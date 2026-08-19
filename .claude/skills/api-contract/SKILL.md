---
name: api-contract
description: The backend journey-planning API contract — endpoints, query parameters, response fields, nullability rules, error codes, and rounding behaviour. Load before writing or changing anything in frontend/src/api or frontend/src/types, before adding a field to a journey type, when interpreting a leg/stop/shape field, or when handling an API error code.
---

# Journey-planning API contract

Base URL comes from `VITE_API_BASE_URL`. Port `3000` is hardcoded in `backend/index.js`.

The authoritative sources, in order: a live response, then `backend/utils/formatItinerary.js` (the presenter that builds the payload), then `backend/index.js` (validation and query params). **Never invent a field.** If something here disagrees with a live response, the live response wins — and this file needs updating.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/route` | Plan a journey |
| GET | `/api/valid-dates` | Dates the loaded timetable covers |
| GET | `/api/health` | `{ status, message }` liveness probe |

`/api/valid-dates` returns a plain ascending array of `YYYY-MM-DD` strings. It is computed once at boot from `active-services.processed.json` and cached, so it is cheap to call.

## `/api/route` query parameters

| Parameter | Required | Notes |
| --- | --- | --- |
| `originLat` + `originLon` | one of | Coordinate origin (dropped pin) |
| `originStopId` | one of | Stop-id origin — alternative to the coordinate pair |
| `destLat` + `destLon` | one of | Coordinate destination |
| `destStopId` | one of | Stop-id destination |
| `date` | yes | `YYYY-MM-DD`, regex-validated |
| `time` | yes | `HH:MM:SS` — **note the seconds**, while responses return `HH:mm` |
| `WALKING_SPEED_MPS` | no | Metres per second. Literal uppercase parameter name. |

Origin and destination are independent: one may be a coordinate while the other is a stop id.

`WALKING_SPEED_MPS` defaults to **`1.27778` m/s** (≈4.6 km/h) in the engine. The frontend mirrors this in `frontend/src/config/journey.ts` so the UI can show the user the value they are about to override; if the engine default changes, that constant must change too. The backend validates only "is a number and greater than zero" — there is **no upper bound**, so the UI must impose a sensible range itself.

Stop-id routing has a known engine limitation (README, "No Direct Start"): a stop-to-stop query can fail to find a route when the origin stop lacks a direct connection, because Round-0 footpath expansion is not applied to exact stop nodes. Coordinate origins do not have this problem.

## Journey response

```
startDate  startTime  endDate  endTime  totalDurationMinutes  legs[]
```

`totalDurationMinutes` is wall-clock from `startTime` to `endTime`, so it *includes* waiting. The engine loads yesterday/today/tomorrow schedules with offsets, so a journey can cross midnight — **`endDate` may be later than `startDate`**; never assume a single date.

`targetArrivalTime` appears in some 404 error bodies but is **never** present on a success response. Do not type it on `Journey`.

## Legs

Every leg carries the same 17 keys; mode decides which are populated. Model this as a discriminated union on `mode` — this is verified behaviour, not a guess (60 live journeys checked, zero violations).

Common to both modes: `mode`, `waitDurationMinutes`, `startDate`, `startTime`, `endDate`, `endTime`, `fromStop`, `toStop`, `shape`.

| Field | `WALK` | `TRANSIT` |
| --- | --- | --- |
| `routeShortName` | `null` | `string` — e.g. `"6"`, `"M2"`, `"K"` |
| `routeType` | `null` | GTFS `route_type` |
| `intermediateStops` | `null` | array, possibly empty |
| `tripId` | `null` | `string` |
| `transitDurationMinutes` | `null` | `number` |
| `transitDistanceMeters` | `null` | `number \| null` — see below |
| `walkDurationMinutes` | `number` | `null` |
| `walkDistanceMeters` | `number` | `null` |

`transitDistanceMeters` is `null` when the source GTFS feed omits the optional `shape_dist_traveled` column — the pipeline then disables distance tracking entirely. HSL provides it; another network may not. Always handle the null.

`routeType` uses only the **standard** GTFS set, never extended three-digit codes: 0 tram, 1 metro, 2 rail, 3 bus, 4 ferry, 5 cable tram, 6 aerial lift, 7 funicular, 11 trolleybus, 12 monorail. Values 0–4 observed live on HSL.

### `waitDurationMinutes`

Time spent waiting at `fromStop` **before** the leg departs at `startTime`. It occupies the gap between the previous leg's `endTime` and this leg's `startTime`, and is **excluded** from that leg's own `walkDurationMinutes` / `transitDurationMinutes`. So `startTime` is a departure time, already past the wait.

### Stops

`fromStop` / `toStop` are `{ name, code, lat, lon }`.

Journeys that begin or end at a dropped pin use synthetic stops: `name` `"ORIGIN"` / `"TARGET"`, `code` `"ORIGIN_PIN"` / `"TARGET_PIN"`. Treat these as pins in the UI, not as real stations.

`intermediateStops` entries use different key names and are **not** the same shape: `{ stopName, stopCode, stopLat, stopLon, stopArrivalTime }`.

### `shape`

Array of `[latitude, longitude]` pairs — latitude first, matching Leaflet's `LatLngTuple`, not GeoJSON order. Always at least 2 points. Walk legs are a straight 2-point line between endpoints, so they can cross water or buildings (README, "Unrealistic Footpath Routing"); that is expected, not a bug to work around.

## Rounding

Applied by the backend presenter, so values arrive pre-rounded — do not round again.

- Durations: whole minutes, with a floor of 1 for any non-zero duration (`backend/utils/formatDuration.js`).
- Distances: nearest 50 m, with a floor of 50 for any non-zero distance (`backend/utils/formatDistance.js`).

## Errors

Non-2xx responses carry `{ errorCode, error }`. `error` is developer-facing English — **never show it to end users**; map `errorCode` to a localised string instead.

**400** — validation, from `backend/index.js`:
`MISSING_ORIGIN`, `MISSING_DESTINATION`, `BAD_DATE`, `BAD_TIME`

**404** — engine, from `backend/raptor-engines/raptorEngine.js`:
`SAME_ORIGIN_TARGET`, `NO_ACTIVE_SERVICES`, `ORIGIN_OUT_OF_BOUNDS`, `ORIGIN_STOP_NOT_FOUND`, `DESTINATION_OUT_OF_BOUNDS`, `DESTINATION_STOP_NOT_FOUND`, `NO_ROUTE_FOUND`

**500** — `INTERNAL_SERVER_ERROR`

404 bodies may carry extra fields alongside the error envelope (e.g. `targetArrivalTime: null`, `legs: []`). Ignore them; read `errorCode`.

Unknown paths return an Express **HTML** 404, not JSON — the client must tolerate a non-JSON error body.

## Expected behaviours that look like bugs

Documented in the README's "Known Limitations" section. Surface these in the UI; do not paper over them.

- A journey may be a **single walking leg** with no transit — correct when walking beats waiting, or when no service runs in the window.
- The engine may route a rider **off a vehicle and back onto the same one** (pure RAPTOR optimises earliest arrival only; McRAPTOR would fix it).
- Footpaths are straight-line Haversine and may cross water or buildings.

## Frontend consumption rules

- All access goes through `frontend/src/api/`. No `fetch` in components.
- Types live in `frontend/src/types/journey.ts`. Nullable in the API means nullable in TypeScript.
- Failures surface as `ApiError` with `kind` (`network` / `timeout` / `http` / `malformed`), `status`, and `code`. Branch on `error.code`, never on message text.
