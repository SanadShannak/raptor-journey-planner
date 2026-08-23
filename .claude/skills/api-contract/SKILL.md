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
| GET | `/api/planner` | Plan a journey |
| GET | `/api/valid-dates` | Dates the loaded timetable covers |
| GET | `/api/network` | Network identity, clock, and capability manifest |
| GET | `/api/stop/:gtfsId` | Live departure board |
| GET | `/api/stop/:gtfsId/timetable?date=` | Whole-day timetable |
| GET | `/api/routes` | Line index — inspection, not planning |
| GET | `/api/routes/:lineId` | One line and its variants |
| GET | `/api/routes/:lineId/:patternId` | One variant, with stops and geometry |
| GET | `/api/health` | `{ status, message }` liveness probe |

## Optional data is a manifest, not a guess

Almost everything beyond the GTFS required columns is optional in the spec, so
none of it can be assumed. `GET /api/network` reports what the loaded feed
actually supplied:

```
{ network, timezone, language, agencyName, agencyUrl, publisherName,
  publisherUrl, feedStartDate, feedEndDate, feedVersion, compiledAt,
  capabilities: { stopCode, stopDescription, fareZones,
                  wheelchairAccessibility, routeLongName, routeDirection,
                  routeHeadsign, tripHeadsign, routeShape, transitDistance } }
```

Every capability key is present and boolean even when the feed carries no
metadata at all. Fetch this once at startup and branch on it, rather than
null-checking each field at every call site — that keeps *"this network has no
wheelchair data"* distinct from *"this stop is missing it"*.

**Optional fields are always present as `null`, never omitted.** A missing key
and a null both mean "no value", but only one lets you read the field without
guarding first.

## Time

Every date and time this API returns is **wall-clock in the network's own
timezone** — never the server's, never the browser's. The zone comes from the
feed's `agency_timezone` and is reported by `/api/network`.

Do not re-apply that zone when formatting a returned value; it is already
resolved. Use it only to work out what "now" or "today" is on the network.

Times are 24-hour. Departures carry their **own `date`**, because GTFS counts
past midnight — a 25:10 trip is the 01:10 service of the next day, and a time
alone cannot express that.

`/api/valid-dates` returns a plain ascending array of `YYYY-MM-DD` strings. It is computed once at boot from `active-services.processed.json` and cached, so it is cheap to call.

## `/api/planner` query parameters

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

Every leg carries the same **22 keys**; mode decides which are populated. Model this as a discriminated union on `mode` — this is verified behaviour, not a guess (60 live journeys checked, zero violations).

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
| `lineId` | `null` | `` `${modeSlug}-${routeShortName}` `` — e.g. `bus-550`, `tram-1`. The key `/api/routes/:lineId` takes |
| `routeLongName` | `null` | `string \| null` — null when the feed omits it |
| `directionId` | `null` | `0 \| 1 \| null` — null when the feed omits it |
| `headsign` | `null` | `string \| null` — the operator's own sign, verbatim |
| `destination` | `null` | `string \| null` — always populated; see below |

`lineId` exists because designations collide across modes: HSL has `"H"` as
both a tram and a train, which become `tram-H` and `train-H`. The mode is
written as a word rather than the raw `route_type` so the identifier is legible
in a URL. Slugs: `tram` `metro` `train` `bus` `ferry` `cable-tram` `cable-car`
`funicular` `trolleybus` `monorail`, falling back to `mode<N>` for a type the
table does not name. Split on the first hyphen — no designation in the feed
contains one.

**`headsign` and `destination` are a pair, and the difference licenses
different wording.**

`headsign` is the operator's destination sign verbatim, or null when the feed
carries none for that trip. It is what is displayed on the front of the
vehicle, so a UI may print it as-is and a rider can match it.

`destination` always has a value: the headsign when there is one, the pattern's
last stop name otherwise. When `headsign` is null the value is *our inference* —
the vehicle may be signed something else entirely — so it should read
"towards X" rather than be presented as the sign itself.

The trip's own sign wins over the pattern's, because a pattern's trips do not
always share one: HSL's rail `H` runs a single Helsinki–Siuntio pattern where
some trips are signed `"Siuntio-Hanko"` and others `"Siuntio"`. Reading the
pattern would show every one of them as the same destination.

`capabilities.tripHeadsign` answers this feed-wide; the per-leg `headsign` is
what you need for a feed that carries signs on only some trips.

`transitDistanceMeters` is `null` when the source GTFS feed omits the optional `shape_dist_traveled` column — the pipeline then disables distance tracking entirely. HSL provides it; another network may not. Always handle the null.

`routeType` uses only the **standard** GTFS set, never extended three-digit codes: 0 tram, 1 metro, 2 rail, 3 bus, 4 ferry, 5 cable tram, 6 aerial lift, 7 funicular, 11 trolleybus, 12 monorail. Values 0–4 observed live on HSL.

### `waitDurationMinutes`

Time spent waiting at `fromStop` **before** the leg departs at `startTime`. It occupies the gap between the previous leg's `endTime` and this leg's `startTime`, and is **excluded** from that leg's own `walkDurationMinutes` / `transitDurationMinutes`. So `startTime` is a departure time, already past the wait.

### Stops

`fromStop` / `toStop` are `{ id, name, code, lat, lon }`. `id` is the GTFS stop
id — the same value `/api/planner` accepts as `originStopId`, which is what makes
"plan onward from this stop" a link rather than a lookup.

Journeys that begin or end at a dropped pin use synthetic stops: `name` `"ORIGIN"` / `"TARGET"`, `code` `"ORIGIN_PIN"` / `"TARGET_PIN"`. Treat these as pins in the UI, not as real stations.

`intermediateStops` entries use different key names and are **not** the same shape: `{ stopId, stopName, stopCode, stopLat, stopLon, stopArrivalTime }`.

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

### Engine outcomes may arrive inside a 200

`backend/server/routes/plannerApi.js` is being changed so that an engine
outcome — everything in the 404 list above, `NO_ROUTE_FOUND` included — comes
back as the same `{ errorCode, error }` envelope but with a **200** status; the
status then says only that the request was served, not that a journey was
found. Route-handler validation failures (the 400 list) keep their status.

**A client must therefore read `errorCode` on a successful response too.** An
outcome body has no `legs`, so a client that goes straight to parsing an
itinerary reports "unreadable response" for what is really "nothing runs then".

`frontend/src/api/journey.ts` accepts both forms, so which one a given backend
build uses is not something the UI has to know. Detection is "both `errorCode`
and `error` are strings" — never `errorCode` alone, or an itinerary would be
swallowed the day a success body gains an `error: null`.

> **Caveat, as of this writing.** The working-tree edit that introduces this
> returns the object from the Express handler (`return rawItinerary;`) instead
> of sending it (`return res.json(rawItinerary);`). Returning from a handler
> sends nothing, so the request hangs until the client times out. Verify
> against a live response before relying on this section.

## Expected behaviours that look like bugs

Documented in the README's "Known Limitations" section. Surface these in the UI; do not paper over them.

- A journey may be a **single walking leg** with no transit — correct when walking beats waiting, or when no service runs in the window.
- The engine may route a rider **off a vehicle and back onto the same one** (pure RAPTOR optimises earliest arrival only; McRAPTOR would fix it).
- Footpaths are straight-line Haversine and may cross water or buildings.

## Frontend consumption rules

- All access goes through `frontend/src/api/`. No `fetch` in components.
- Types live in `frontend/src/types/journey.ts`. Nullable in the API means nullable in TypeScript.
- Failures surface as `ApiError` with `kind` (`network` / `timeout` / `http` / `malformed`), `status`, and `code`. Branch on `error.code`, never on message text.

## Stop endpoints

`GET /api/stop/:gtfsId` — live board. `{ stop, asOf: { date, time }, servingLines[], departures[], capabilities }`

`GET /api/stop/:gtfsId/timetable?date=` — whole day. `{ stop, date, servingLines[], schedule[], totalDepartures, outsideTimetableRange, capabilities }`

`schedule` is an **array** of `{ hour, departures[] }`, not an object keyed by
hour. Object keys would reorder: `"10"`–`"23"` are canonical integer strings and
get hoisted ahead of `"07"`, silently scrambling the board.

A departure is:

```
{ date, time, arrivalDate, arrivalTime, lineId, routeShortName, routeType,
  headsign, destination, terminatesHere, tripId, directionId, routeLongName }
```

`terminatesHere` is true when the trip ends at the stop being viewed; its
`destination` is then `null`, because "towards <the stop you are standing at>"
is nonsense.

A stop is `{ id, name, code, lat, lon, description, fareZone, wheelchairAccessible }`.
`wheelchairAccessible` is **tri-state**: `true`, `false`, or `null` for "the
agency never said". Do not collapse null into false — that tells a wheelchair
user a stop is unusable when the truth is unknown.

## Route inspection

The compiled data holds stop-sequence **patterns**, not lines: HSL has 1,179
patterns for 464 lines, because every variant and direction is its own record.
`/api/routes` lists lines; the patterns behind them appear as `variants`.

`GET /api/routes?q=&mode=` → `{ lines[], totalLines, capabilities }`, where a
line is `{ lineId, routeShortName, routeType, routeLongName, variantCount, directions[] }`.

`directions` is `[0, 1]` when the feed carries `direction_id` — that is what
lets a client offer a direction flip. It is `[]` for a feed without it, and the
client should then label variants by their end points instead.

`GET /api/routes/:lineId` → the line plus `variants[]`, ordered busiest first:

```
{ patternId, directionId, headsign, originStopName, terminusStopName,
  stopCount, tripCount, firstDeparture, lastDeparture }
```

`patternId` indexes the compiled patterns. It is stable for the life of a
dataset but **not across a pipeline re-run**, so a client holding one across a
data refresh should fall back to the line's first variant rather than error.

`GET /api/routes/:lineId/:patternId` adds `stops[]` and `shape`. `shape` is the
pattern's *representative* geometry — trips on one pattern can use different
shapes, so the most-used is stored; it is `null` for a feed without shapes.txt.
Journey legs do not use it, slicing the trip's own shape instead.

Errors: `LINE_NOT_FOUND`, `PATTERN_NOT_FOUND`, `STOP_NOT_FOUND` (404).

## Verifying feed-agnosticism

`offline-data-ingestion-pipeline/fixtures/makeMinimalFeed.js` writes a GTFS
feed carrying only the required columns. Compile it and run the server against
it to confirm every optional field degrades rather than breaks — a real feed
supplies almost everything and so cannot exercise the fallbacks.
