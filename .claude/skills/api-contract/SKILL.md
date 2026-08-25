---
name: api-contract
description: The backend journey-planning API contract — endpoints, query parameters, response fields, nullability rules, error codes, and rounding behaviour. Load before writing or changing anything in frontend/src/api or frontend/src/types, before adding a field to a journey type, when interpreting a leg/stop/shape field, or when handling an API error code.
---

# Journey-planning API contract

Base URL comes from `VITE_API_BASE_URL`. The server port defaults to `3000`, set in `backend/server/serverConfig.js` (honours `process.env.PORT`).

The authoritative sources, in order: a live response, then `backend/server/utils/formatItinerary.js` (the presenter that builds the payload), then `backend/server/routes/plannerApi.js` (validation and query params). **Never invent a field.** If something here disagrees with a live response, the live response wins — and this file needs updating.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/planner` | Plan a journey |
| GET | `/api/valid-dates` | Dates the loaded timetable covers |
| GET | `/api/network` | Network identity, clock, and capability manifest |
| GET | `/api/stop/:gtfsId?limit=` | Live departure board |
| GET | `/api/stop/:gtfsId/timetable?date=` | Whole-day timetable |
| GET | `/api/routes` | Line index — inspection, not planning |
| GET | `/api/routes/:lineId` | One line and its variants |
| GET | `/api/routes/:lineId/:patternId` | One variant, with stops and geometry |
| GET | `/api/routes/:lineId/:patternId/timetable?date=` | One variant's trips for one service day |
| GET | `/api/card/:number` | Travel-card balance |
| GET | `/api/health` | `{ status, message }` liveness probe |

## Optional data is a manifest, not a guess

Almost everything beyond the GTFS required columns is optional in the spec, so
none of it can be assumed. `GET /api/network` reports what the loaded feed
actually supplied:

```
{ network, timezone, language, currency, agencyName, agencyUrl,
  publisherName, publisherUrl, feedStartDate, feedEndDate, feedVersion,
  compiledAt, modes: [0, 1, 2, 3, 4],
  capabilities: { stopCode, stopDescription, fareZones,
                  wheelchairAccessibility, routeLongName, routeDirection,
                  routeHeadsign, tripHeadsign, routeShape, transitDistance,
                  platforms } }
```

Every capability key is present and boolean even when the feed carries no
metadata at all. Fetch this once at startup and branch on it, rather than
null-checking each field at every call site — that keeps *"this network has no
wheelchair data"* distinct from *"this stop is missing it"*.

`modes` is the standard GTFS `route_type`s this network actually **runs**,
ascending and de-duplicated, computed once at boot from the compiled routes.

It is not a capability and the difference is the point: `capabilities` says
which optional *columns* the feed supplied, `modes` says what moves. A client
offering a mode filter needs the second — a fixed list would put a ferry on a
network that has none — and the only other way to learn it is to fetch
`/api/routes` and read one field off every line, which is ~70 kB for HSL to
recover five integers.

**Empty is a real answer** for a feed with no routes. Offer no filter rather
than falling back to a default set.

`currency` is what this network charges in, as ISO 4217 — the same kind of
value as `timezone`, and reported for the same reason: one thing everything
derives from, so a fare or a card balance prints in the right money without any
call site knowing which city is loaded.

**How many decimal places to show is a property of the currency, never a
choice.** A dinar has three (`1.300 JOD`) and a euro two; `Intl.NumberFormat`
knows, and hard-coding either is wrong on half the networks this repo can load.

GTFS carries it in `fare_attributes.currency_type`, which the pipeline does not
yet compile — `backend/server/utils/networkCurrency.js` therefore answers from a
per-network table, exactly as `NETWORK_TIMEZONES` answers for a feed with no
agency.txt, and will prefer the feed's value the day network-meta has one.
**Null is a real answer**: print a bare number rather than guessing, because a
balance in the wrong currency is worse than one with none.

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
| `patternId` | `null` | `number` — which of the line's stop sequences this leg rode. See below |
| `routeLongName` | `null` | `string \| null` — null when the feed omits it |
| `directionId` | `null` | `0 \| 1 \| null` — null when the feed omits it |
| `headsign` | `null` | `string \| null` — the operator's own sign, verbatim |
| `destination` | `null` | `string \| null` — always populated; see below |

`patternId` is what makes a leg openable. `lineId` names the line and a line can
be many stop sequences — HSL's tram H is thirty-nine — so a client wanting to
show the rider *this* run has no way to pick between them from `lineId` alone,
and searching every variant's timetable for its own `tripId` is dozens of
requests. The engine scanned this exact pattern, so it says which.

Together with `tripId` and the leg's `startDate` it addresses one run of one
variant: `/api/routes/{lineId}/{patternId}/timetable?date={startDate}` contains
that `tripId`. Same stability caveat as everywhere else — good for the life of a
dataset, not across a pipeline re-run.

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

It is **measured from those two published times**, so it is exactly the gap a reader can see between them. Do not recompute it, and do not treat a disagreement as expected — there is none. `0` is a real answer and means the connection is immediate at minute resolution; it is not a missing value.

### Stops

`fromStop` / `toStop` are `{ id, name, code, platform, lat, lon }`. `id` is the GTFS stop
id — the same value `/api/planner` accepts as `originStopId`, which is what makes
"plan onward from this stop" a link rather than a lookup.

`platform` is the designation printed on the stop — GTFS's optional
`platform_code`. It is `null` when the feed omits the column, which is a
property of the *whole feed* rather than of odd stops: `/api/network` reports
`capabilities.platforms` so a client can tell "this network does not publish
them" from "not known for this one". The synthetic pins carry `platform: null`
like every other field, so it is always safe to read.

**GTFS does not say what the designation *is*.** There is a number and nothing
else — never whether it names a platform, a track, or a stand. Choosing the
word is the client's job, and the frontend takes it from the mode: rail says
"Track", everything else says "Platform", mirroring how the networks speak
(HSL prints *raide* on a train and *laituri* on a bus stand).

Journeys that begin or end at a dropped pin use synthetic stops: `name` `"ORIGIN"` / `"TARGET"`, `code` `"ORIGIN_PIN"` / `"TARGET_PIN"`. Treat these as pins in the UI, not as real stations.

`intermediateStops` entries use different key names and are **not** the same shape: `{ stopId, stopName, stopCode, stopLat, stopLon, stopArrivalTime }`.

### `shape`

Array of `[latitude, longitude]` pairs — latitude first, matching Leaflet's `LatLngTuple`, not GeoJSON order. Always at least 2 points. Walk legs are a straight 2-point line between endpoints, so they can cross water or buildings (README, "Unrealistic Footpath Routing"); that is expected, not a bug to work around.

## Rounding

Applied by the backend presenter, so values arrive pre-rounded — do not round again.

- Times: whole minutes, and **asymmetrically** — an arrival rounds *up*, a departure rounds *down*, so nobody is told they arrive earlier or may leave later than they really can (`backend/server/utils/roundSecondsToMinute.js`).
- Durations: whole minutes, with a floor of 1 for any non-zero duration (`backend/server/utils/formatDuration.js`).
- Distances: nearest 50 m, with a floor of 50 for any non-zero distance (`backend/server/utils/formatDistance.js`).

### Durations agree with the times beside them

**Every duration is measured between the two rounded times the same response publishes**, never from the engine's exact seconds. This is a guarantee, and the reason it needs stating is that it was once untrue: rounding a duration from raw seconds while rounding the times asymmetrically let the two drift apart by up to two minutes, so a response could say `waitDurationMinutes: 4` between a `01:50` arrival and a `01:52` departure, or a nine-minute ride between times ten minutes apart.

Three things follow, and a client should rely on all three rather than defending against them:

- A leg's duration equals `endTime − startTime`.
- A leg's `waitDurationMinutes` equals its `startTime` minus the previous leg's `endTime`, and is never negative.
- The legs and the waits **tile the journey**: they sum to `totalDurationMinutes`, which is itself `endTime − startTime`.

Dates move with the times. When rounding an arrival up crosses midnight, the published `endDate` advances with it, so a date and the clock beside it always describe the same moment.

Verify with `node` against a running server rather than by reading the engine, which works in exact seconds and knows nothing about any of this.

## Errors

Non-2xx responses carry `{ errorCode, error }`. `error` is developer-facing English — **never show it to end users**; map `errorCode` to a localised string instead.

**400** — validation, from `backend/server/routes/plannerApi.js`:
`MISSING_ORIGIN`, `MISSING_DESTINATION`, `BAD_DATE`, `BAD_TIME`

**404 (legacy) / 200 (current)** — engine outcomes, from `backend/raptor-engines/raptorEngine.js`. See *Engine outcomes may arrive inside a 200* below; a client should handle both:
`SAME_ORIGIN_TARGET`, `NO_ACTIVE_SERVICES`, `ORIGIN_OUT_OF_BOUNDS`, `ORIGIN_STOP_NOT_FOUND`, `DESTINATION_OUT_OF_BOUNDS`, `DESTINATION_STOP_NOT_FOUND`, `NO_ROUTE_FOUND`

**Outside the planner**, the stop and route routers add their own:
`STOP_NOT_FOUND` (404, both stop endpoints), `BAD_DATE` (400, either timetable
— a stop's or a line variant's),
`BAD_BOUNDS` and `BOUNDS_TOO_LARGE` (400, the bounding box), `LINE_NOT_FOUND`
and `PATTERN_NOT_FOUND` (404). These are ordinary HTTP failures — the 200-with-an-
`errorCode` behaviour below belongs to the planner alone.

**500** — `INTERNAL_SERVER_ERROR`

404 bodies may carry extra fields alongside the error envelope (e.g. `targetArrivalTime: null`, `legs: []`). Ignore them; read `errorCode`.

Unknown paths return an Express **HTML** 404, not JSON — the client must tolerate a non-JSON error body.

### Engine outcomes may arrive inside a 200

`backend/server/routes/plannerApi.js` sends an engine outcome — everything in
the list above, `NO_ROUTE_FOUND` included — as the same `{ errorCode, error }`
envelope but with a **200** status. The status says only that the request was
served, not that a journey was found. Route-handler validation failures (the
400 list) keep their status.

Verified live: an out-of-bounds origin answers `200` in ~24 ms with
`{ targetArrivalTime: null, legs: [], errorCode: "ORIGIN_OUT_OF_BOUNDS", error: ... }`.
Note the `legs: []` sitting beside the error — an empty list is **not** proof of
a successful search.

**A client must therefore read `errorCode` on a successful response too.** An
outcome body has no `legs`, so a client that goes straight to parsing an
itinerary reports "unreadable response" for what is really "nothing runs then".

`frontend/src/api/journey.ts` accepts both forms, so which one a given backend
build uses is not something the UI has to know. Detection is "both `errorCode`
and `error` are strings" — never `errorCode` alone, or an itinerary would be
swallowed the day a success body gains an `error: null`.

> **If a planner request ever hangs**, this is the first place to look. An
> Express handler that `return`s a value sends nothing — the response is never
> written and the client waits for its own timeout. It must be
> `return res.json(rawItinerary);`. That exact mistake shipped once.

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

`GET /api/stop/:gtfsId?limit=` — live board. `{ stop, asOf: { date, time }, servingLines[], departures[], capabilities }`

`limit` is the only parameter, **clamped to 1–200 with a default of 20**
(`DEFAULT_DEPARTURES_LIMIT`). It is read with `parseInt(...) || DEFAULT`, so
`limit=0` and anything non-numeric fall back to 20 rather than erroring. There
is no `total` or `truncated` here, so a client can only tell "20 because that is
all there is" from "20 because that is what I asked for" by comparing the length
against the limit it sent.

`asOf` is the moment the board was resolved, on the **network's** clock, so a
tab left open is detectable as stale. `departures` is ascending and may be `[]`,
which is a real answer at the end of service and not an error.

`GET /api/stop/:gtfsId/timetable?date=` — whole day. `{ stop, date, servingLines[], schedule[], totalDepartures, outsideTimetableRange, capabilities }`

`date` is **required**, and validated by a bare `/^\d{4}-\d{2}-\d{2}$/`. So a
well-formed impossible date like `2026-99-99` is *not* a `BAD_DATE` — it is
served as an ordinary empty board with `outsideTimetableRange: true`. Only a
malformed string gets the 400.

`outsideTimetableRange` says the date falls outside the feed's calendar
entirely. It is an **empty state, not a failure**, and deserves different
wording from "nothing runs at this stop that day".

**Neither stop endpoint takes a line filter**, and the timetable takes no limit.
Filtering a board by line is the client's job, over `servingLines`.

Both raise **404 `STOP_NOT_FOUND`** for an id the feed does not contain. On the
timetable route the id is checked *before* the date, so a bad id and a bad date
together answer 404, not 400.

`GET /api/stops?minLat=&minLon=&maxLat=&maxLon=` → `{ stops[], total, truncated, capabilities }`

The stops inside a bounding box, for a map. Same router as `/api/stop/:id`, mounted twice: the singular is one stop, the plural is the set of them in an area.

Each entry is `describeStop` plus `modes` — the standard GTFS `route_type`s of everything calling there, de-duplicated and ascending. Never fall back to a default mode; a bus icon on a tram stop sends someone to the wrong side of the street.

**Only stops something actually calls at are returned.** A stop with no routes is excluded, which removes two things that were previously drawn and could not be used:

- GTFS **stations** (`location_type=1`), the parent record for a set of platforms. HSL's feed has 122, none of them appear in `stop_times` at all, no footpath leads to one, and the engine can neither board nor alight there. On a map they were a marker with no mode whose departure board was empty forever.
- Ordinary stops that outlived their routes — a real thing in a feed, and just as unusable.

This applies to **this endpoint only**. `/api/stop/:id` still describes any id it knows, so an existing link to one keeps working.

All four corners are required and must parse as numbers, and the minimum corner must not exceed the maximum — otherwise `400 BAD_DATE`-style `{ errorCode: "BAD_BOUNDS" }`. A box spanning more than **1.5 degrees** on a side is refused with `BOUNDS_TOO_LARGE`: that is a request for the whole network wearing a bounding box.

The answer is **capped at 400 stops and never paged**. A map asks again on every pan, so an answer that arrives late is worth less than one that arrives small; a client wanting more detail asks for a smaller box, which is what zooming in is. `truncated` is `true` when the cap was reached — do not infer it from the count, and do not cache a truncated answer as covering its box.

**A truncated answer is spread across the box, not cut off partway.** The grid is walked latitude band by latitude band, so returning the first 400 handed back a *southern slice* of what was asked for — a wide box came back with its northern half simply missing, and a map drawn from it showed empty ground where there were stops. Over the cap, an even stride is taken instead, so the sample covers the whole box at lower density.

Answered from the spatial grid the routing engine already holds in memory, so the cost follows the size of the box rather than the size of the feed.


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

`servingLines` is the distinct lines calling at the stop, sorted by designation
with `numeric: true` so `3` precedes `21`:

```
{ lineId, routeShortName, routeType, routeLongName, directionId, destinations[] }
```

`destinations` is de-duplicated and **may be empty** — every pattern of that
line terminates here, or none of their end points resolved to a name.

**`directionId` here is not this line's direction.** Entries are keyed by
`lineId`, which does not encode direction, so both directions of a line collapse
into one entry and the value is whichever pattern happened to be seen first.
Read it as noise; use `/api/routes/:lineId` when direction actually matters.

A stop is `{ id, name, code, platform, lat, lon, description, fareZone, wheelchairAccessible }`.
`wheelchairAccessible` is **tri-state**: `true`, `false`, or `null` for "the
agency never said". Do not collapse null into false — that tells a wheelchair
user a stop is unusable when the truth is unknown.

`platform` is the same field, with the same meaning, as the one on a journey
leg's `fromStop`/`toStop` — see *Stops* above for why the client and not the
feed chooses whether it reads "Track" or "Platform".

One shape note that only bites a corrupt dataset: if the internal record behind
an id is missing, `describeStop` falls back to `{ id, name: null, code: null,
lat: null, lon: null }` and the remaining keys are **absent rather than null**.
The `:gtfsId` routes 404 before they can reach it, but a parser should default
the missing keys rather than assume the full shape.

## Travel card

`GET /api/card/:number` → `{ number, balance, lastUsedDate, usages[] }`

**The only endpoint backed by a database rather than by the compiled feed**, and
therefore the only one that can be unavailable on its own. Everything else is
served from RAM and keeps working when Mongo is down.

`:number` is eleven digits, and the `XXXXX-XXXXX-X` grouping is optional —
`12345-67890-1`, `12345 67890 1` and `12345678901` are the same card. The
grouping is punctuation for reading a long number aloud, not part of the
identity: it is stripped on the way in and reapplied on the way out, so
`number` always comes back grouped however it was asked for.

`balance` is a **number in major units** — `10.7` is ten dinars seven hundred
fils. How many decimals to print is a property of the currency, never a choice:
`/api/network` reports which currency, and `Intl.NumberFormat` gives three for a
dinar and two for a euro. Never format it by hand.

`lastUsedDate` is `YYYY-MM-DD` on the **network's** clock, or `null` for a card
never used. A tap at 23:30 in Helsinki is the previous day in Virginia, so this
is resolved through the network zone rather than by slicing an ISO timestamp.

`usages` is what has moved the balance, **newest first** and capped at 20 —
enough to recognise a charge, not an account statement. Each entry is:

```
{ date, time, amount, kind, description }
```

`amount` is a **magnitude and never negative**; `kind` is `"fare"` or
`"topUp"` and is what carries the direction. A sign cannot tell a top-up from a
refund — both are money arriving — so a client that wants `−1.300` builds it
from the two rather than reading it off the wire.

`date` and `time` are network-local wall clock, 24-hour, like every other time
this API returns. Either may be `null` if the store held no instant.
`description` is where it happened — a line, a machine — and is `null` when
unknown.

`lastUsedDate` is **derived from the newest usage** when there is one, falling
back to the stored `lastUsedAt`, so the summary and the list can never disagree.

An empty `usages` is a real answer, and is indistinguishable from a card whose
history was never kept — say "nothing recorded" rather than "never used".

Errors:

- **400 `BAD_CARD_NUMBER`** — not eleven digits. Validated before the store is
  touched.
- **404 `CARD_NOT_FOUND`** — no card with that number. Almost always a mistyped
  digit rather than a fault, and worth its own wording.
- **503 `CARD_STORE_UNAVAILABLE`** — the database is not connected. Distinct
  from a 500 on purpose: nothing is broken, this one feature cannot answer, and
  the rest of the app is unaffected.
- **500 `INTERNAL_SERVER_ERROR`**.

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
  stopCount, tripCount, firstDeparture, lastDeparture, serviceDates[] }
```

`patternId` indexes the compiled patterns. It is stable for the life of a
dataset but **not across a pipeline re-run**, so a client holding one across a
data refresh should fall back to the line's first variant rather than error.

`GET /api/routes/:lineId/:patternId` adds `stops[]`, `stopCount` and `shape`.
`shape` is the pattern's *representative* geometry — trips on one pattern can
use different shapes, so the most-used is stored; it is `null` for a feed
without shapes.txt. Journey legs do not use it, slicing the trip's own shape
instead.

A stop is `describeStop`'s shape — `platform` included — plus `sequence` and
`distanceFromOriginMeters` (`null` for a feed without `shape_dist_traveled`).

**`sequence` is the stop's position in the pattern, and `stops[]` can have
holes.** A stop whose internal record is missing is dropped from the list, so
array position and `sequence` are not the same number. `sequence` is the key to
join on — it is what indexes a timetable trip's `calls`.

`serviceDates` is exactly the days a variant runs, ascending, and is
**narrower than `/api/valid-dates`** — that is every day the feed covers, this
is every day this variant moves. HSL: 31 of 60 for tram 1's main pattern, and
the feed carries at least one covered date whose service list is empty
altogether. A date control on a line page should offer these and nothing else.

It is on the **variant summary**, so `/api/routes/:lineId` carries one per
variant. That is what makes a list of variants choosable rather than a set of
equally plausible wrong answers: a line's short workings are often seasonal, and
`tram-H`'s 39 variants split 32 running today against 7 that start later. The
whole line costs 33 kB, which is the largest on HSL.

**Empty is a real answer** — a variant whose services have all expired.

Yesterday's spillover is deliberately excluded: a pattern whose last trip is
00:30 is finishing the previous service day, not running on this one. And the
dates need not be contiguous, so `serviceDates[0]` and the last entry are a
*range* rather than a promise about every day between them — ask `includes()`
about a specific day.

### `GET /api/routes/:lineId/:patternId/timetable?date=`

One variant's whole service day, a trip per row and a time per stop. The stop
timetable answers "what calls at this pole"; this answers "when does the line
run, and how long between any two of its stops", which no board of a single stop
can.

```
{ …line fields, …variant fields, date,
  stops[], stopCount,
  trips: [ { tripId, headsign, calls[] } ],
  totalTrips, outsideTimetableRange, capabilities }
```

`date` is **required** and validated by the same bare `/^\d{4}-\d{2}-\d{2}$/`
the stop timetable uses, with the same consequence: `2026-99-99` is not a
`BAD_DATE`, it is an ordinary empty board with `outsideTimetableRange: true`.
The line and variant are resolved **before** the date, so a bad id and a bad
date together answer 404.

**`calls` is indexed by `sequence`, is always `stopCount` long, and an entry may
be `null`** — a trip short a stop time leaves a hole rather than shifting every
stop after it. A non-null call is
`{ date, time, arrivalDate, arrivalTime }`, each carrying its own date for the
usual reason.

`trips` is ascending by first departure, merged across every service running
that day, and **uncapped** — the largest pattern on HSL is 143 trips over 34
stops, which is ~440 kB served in single-digit milliseconds from RAM.

Which calendar date a trip belongs to is decided by **where it starts**. A trip
leaving 23:30 and arriving 00:01 is tonight's, and its last call resolves onto
tomorrow by itself; yesterday's 25:10 trip is this date's 01:10 and appears
here, not on yesterday's board. Both offsets are walked for exactly that reason.

`headsign` is the trip's own sign, falling back to the pattern's — a pattern's
trips do not always share one.

Errors: `LINE_NOT_FOUND`, `PATTERN_NOT_FOUND`, `STOP_NOT_FOUND` (404),
`BAD_DATE` (400, the timetable).

## Verifying feed-agnosticism

`offline-data-ingestion-pipeline/fixtures/makeMinimalFeed.js` writes a GTFS
feed carrying only the required columns. Compile it and run the server against
it to confirm every optional field degrades rather than breaks — a real feed
supplies almost everything and so cannot exercise the fallbacks.
