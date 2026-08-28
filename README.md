# RAPTOR Journey Planner Engine

## Core System Architecture Overview

Public transit engines process massive datasets containing millions of weekly scheduled trips. Running a routing engine directly against raw schedule files or a standard database produces unacceptably high latency.

To overcome this, this project is divided into three decoupled, distinct parts, each in its own directory:

| Directory | What it is | Language |
| --- | --- | --- |
| `offline-data-ingestion-pipeline/` | Compiles raw GTFS text feeds into indexed JSON | CommonJS Node |
| `backend/` | Express server + RAPTOR routing engine, reads the compiled JSON | CommonJS Node |
| `frontend/` | Journey-planning web client | React + TypeScript + Vite |

1. **The Offline Data Pipeline:** A sequence of ingestion compilers that read heavy, relational, text-based GTFS data and compact them into zero-indexed, contiguous memory buffers saved as highly readable `.json` files.
2. **The Online Routing Server:** An ultra-fast, multi-modal routing environment that loads pre-compiled JSON memory blocks into RAM cache to execute RAPTOR range queries in sub-50ms runtimes.
3. **The Web Client:** A React application that consumes the HTTP API. It draws journeys, lines and stops on a vector map, and is written so that the map is always an enhancement over an accessible list rather than the only route to any information.

The three are genuinely decoupled: the pipeline can be rebuilt without touching the server, and the server runs without the client. Only the direction of dependency is fixed — the client reads the API, the API reads the compiled data, the pipeline writes it.

---

## The Pipeline Configuration Registry (`pipelineConfig.js`)

To prevent hardcoding folder names inside individual parser scripts, we use a central configuration file. This allows us to scale the project easily and switch between different city networks with a single string swap.

### Structural Manifest Rules
1. **Network Independence:** To switch the target data from Helsinki (`hsl`) to Amman (`amman`), change the `ACTIVE_NETWORK` property. All parsers automatically adjust their input and output paths based on this single token.
2. **Pipeline Integrity Controls:** The configuration features a strict `rules` schema validator containing arrays of `requiredFiles` and column headers ensuring incomplete or structurally corrupt datasets are rejected at the stream boundary.

---

## Component Documentation

### Component 1: Stop Parser (`parseStops.js`)

#### Objective
Converts sparse, text-heavy GTFS `stops.txt` datasets into highly compacted, zero-indexed, contiguous memory buffers mapped to execution-ready arrays for performance scaling.

#### Ingestion Rules
1. **File Dependencies:** The input directory matching the active network must contain a valid `stops.txt` dataset.
2. **Memory Layout Transformation:**
   - **`stops.processed.json`**: An array where a stop's index position serves as its internal ID. Metadata is stripped to save RAM.
   - **`stop-mapping.json`**: A translator file mapping the original GTFS string ID to the internal integer ID.

---

### Component 2: Active Services Compiler (`parseActiveServices.js`)

#### Objective
Ingests `calendar.txt` and `calendar_dates.txt` to compile a chronological manifest of service availability. This creates an $O(1)$ lookup capability to determine which transit services are running on any specific query date.

#### Ingestion Rules
1. **Date Serialization**: Converts arbitrary date ranges into standardized integer IDs for high-performance indexing.
2. **Exception Handling**: Processes `calendar_dates.txt` to apply "ADD" or "REMOVE" exceptions to the base schedule.
3. **Service Mapping**: Generates `service-mapping.processed.json`, mapping GTFS `service_id` strings to internal integer tokens.

---

### Component 3: Route Builder (`parseRoutes.js`)

#### Objective
Aggregates individual scheduled journeys by extracting their physical stop sequences from `stop_times.txt`. This script groups commercial transit variants into mathematically strict, sequence-locked RAPTOR routes traveling in a single direction.

#### Ingestion Rules
1. **Sequence Serialization**: Converts raw stop sequences into signature strings. Trips sharing identical sequences are collapsed into the same `service_bucket`.
2. **Trip Mapping**: Generates the `trip-mapping.json` manifest, bridging raw GTFS string IDs to compressed integer indices.

---

### Component 4: Timetable Compiler (`parseTimetables.js`)

#### Objective
Ingests and transforms raw calendar schedules from `stop_times.txt` into a high-performance, memory-optimized temporal lookup matrix.

#### Ingestion Rules
1. **Temporal Serialization**: Converts `HH:MM:SS` text timestamps into highly compressed base-10 integers representing **Seconds From Midnight**.
2. **Memory Layout**: Groups data into a direct Key-Value Hash Map `{ trip_id: [{ arrival, departure }] }` to ensure $O(1)$ lookup complexity.

---
### Component 5: Stop-to-Route Indexer (`parseStopToRoutes.js`)

#### Objective
Compiles an inverted relational index matrix that maps every stop to the routes servicing it.

#### Design
Binds dictionary lookup keys directly to sequential zero-indexed integer array positions, ensuring that the engine can instantly resolve associated routes without string comparisons.

---

### Component 6: Spatial Grid Generator (`generateSpatialGrid.js`)
#### Objective
Ingests the processed flat stops array (`stops.processed.json`) and maps every physical stop into a geographic spatial grid (`spatial-grid.processed.json`).

#### Logic Metrics
1. **Grid Partitioning**: Divides coordinates into discrete square boxes using a resolution constant (`GRID_SIZE_DEGREES = 0.005`, roughly 500 meters per cell).
2. **Spatial Hashing**: Generates unique string keys (`latIndex_lonIndex`) to group stops by geographic area. Each populated grid cell stores the stop's internal ID, latitude, longitude, and stop code.
3. **Footpath Candidate Acceleration**: The generated grid is consumed by the footpath generator to identify nearby candidate stops without performing an exhaustive all-to-all comparison between every stop in the network.


---

### Component 7: Footpath Generator (`generateFootpaths.js`)
#### Objective
Compiles a complete pedestrian transfer matrix (`footpaths.processed.json`) connecting transit stops that are within the configured walking radius.

#### Logic Metrics
1. **Spatial Grid Candidate Search**: Uses the pre-generated spatial grid (`spatial-grid.processed.json`) to restrict walking calculations to stops located within the relevant neighboring grid cells.
2. **Walking Distance Calculation**: Calculates the straight-line distance between candidate stops using the Haversine formula. A `DETOUR_FACTOR = 1.2` is applied to approximate real-world pedestrian routing distance, with the resulting distance rounded to the nearest 10 meters.
3. **Maximum Walking Radius**: Only candidate pairs with an estimated walking distance of **1,000 meters or less** are included in the footpath matrix.
4. **Self-Transfer Rule**: Every stop receives a reflexive transfer edge to itself with a distance of `0` meters and a `stop_access_penalty` of `0`.
5. **Station Access & Exit Penalties**: Stops serving **metro, railway, or ferry (`route_type` 1, 2, or 4)** receive a **120-second station access penalty** when entering or exiting the station. When both the origin and destination stops require the penalty, the resulting footpath carries a cumulative **240-second** penalty.
6. **Output Structure**: Each stop is represented by its internal stop ID and contains a list of reachable destination stops, their estimated walking distance, and the corresponding station access penalty. The resulting matrix is written incrementally to `footpaths.processed.json` to avoid JavaScript string-length limitations when processing large networks.

---


### Component 8: Trip Shape Builder (`generateShapes.js`)
#### Objective
Fuses sparse station coordinate data with high-density polyline drawing instructions (`shapes.txt`) to generate exact geographic paths for map rendering.
#### Logic Metrics
1. **Defensive Validation**: Gracefully skips processing without crashing if the optional `shapes.txt` feed is not provided by the transit agency.
2. **Two-Pointer Merge Algorithm**: Strictly sorts both station stops and polyline points by distance and sequence, merging them in a single $O(N)$ pass to guarantee stations are perfectly anchored to the map line.
3. **$O(1)$ Memory Indexing**: Distributes static array slicing indices to individual trips (`trip-to-shape-mapping.json`), ensuring the routing engine can extract a 50-kilometer polyline in under a millisecond.

---

### The Online Routing Server: RAPTOR Engine (`raptorEngine.js`)
#### Objective
The core online algorithm that consumes pre-compiled transit arrays to answer travel queries, fully equipped with path reconstruction, spatial grid coordinate lookups, multi-day temporal windows, and strict machine-readable error codes.
#### Operational Logic
1. **Multi-Day Temporal Window**: Automatically loads "Yesterday", "Today", and "Tomorrow" transit schedules, applying mathematical offsets to ensure seamless cross-midnight transit routing.
2. **Coordinate & Pin Routing**: Supports dynamic lat/lon inputs with Just-In-Time (JIT) spatial grid lookups, automatically generating origin/destination walking legs and analyzing fallback direct-walk scenarios.
3. **Engine Circuit Breakers & Structured Errors**: Implements immediate short-circuits for identical source/target queries, out-of-bounds coordinates, missing stop IDs, and inactive calendar dates.
4. **Initialization**: Pre-allocates native 2D arrays to hold arrival times across `MAX_ROUNDS`, utilizing `Infinity` to signify unvisited nodes.
5. **Stage 1 (Route Accumulation)**: Identifies all active routes that pass through reachable stops in $O(1)$ time.
6. **Stage 2 (Route Scanning)**: Executes an $O(\log N)$ binary search across the multi-day temporal window to retrieve the earliest possible transit trip, scanning stop-by-stop while pruning dominated paths. 
7. **Stage 3 (Footpath Processing)**: Processes pedestrian transfers between stops using dynamic walking speeds and the spatial grid index (`spatialGrid.js`).
8. **Path Reconstruction**: Backtracks through parent pointer matrices to construct an ordered, turn-by-turn itinerary. 
9. **UI & Geometry Hydration**: Enriches the final mathematical path with UI metadata (GTFS `route_type` integer) and injects highly accurate geographic shape polylines via $O(1)$ array slicing for frontend map rendering.

---

### The API Controller (`index.js`)
#### Objective
Exposes the RAPTOR engine and the compiled feed to client applications over
HTTP, handling request validation, performance tracking, and payload
formatting. It has grown from one endpoint to eight — see
[Endpoints](#endpoints) for the list; one router per endpoint lives in
`server/routes/`.
#### Operational Logic
1. **Synchronous Memory Bootstrapping**: Leverages Node's synchronous `require()` behavior to load all massive GTFS JSON data into the V8 memory heap *before* opening the port to accept traffic.
2. **Input Validation**: Uses utility validators to strictly enforce date formats (`YYYY-MM-DD`), time formats (`HH:MM:SS`), and optional walking speed constraints.
3. **Performance Telemetry**: Utilizes `performance.now()` to track and log exact execution times for every route calculated.
4. **Error Propagation**: Every failure carries `{ errorCode, error }`, and the
   status says *who* refused rather than whether there is an answer. A
   malformed request is a `400`; an unknown line is a `404`; a card lookup with
   no store behind it is a `503`; an unexpected throw is a `500`. An engine
   outcome is **none of those** — `NO_ROUTE_FOUND` and
   `DESTINATION_OUT_OF_BOUNDS` come back with a `200`, because the request was
   fine and "nothing runs between those points then" is an answer rather than a
   fault. A client that goes straight to reading `legs` reports "unreadable
   response" for what is really an empty result, so **read `errorCode` on a
   successful response too**.
5. **Presenter Pattern (`formatItinerary.js`)**: Once the engine completes
   execution, the raw timeline arrays are passed through a formatter that turns
   engine seconds into wall-clock strings in the network's timezone and attaches
   the itinerary's own totals. Three rounding rules live here, and they are the
   reason a client must never recompute a duration: times round to whole minutes
   **asymmetrically** — an arrival up, a departure down, so nobody is told they
   arrive earlier or may leave later than they can — durations round to whole
   minutes with a floor of 1, and distances to the nearest 50 m with a floor of
   50. See [What `/api/planner` returns](#what-apiplanner-returns).

---

## Haversine Spatial Calculator (`utils/calculateHaversine.js`)

#### Objective
Provides a zero-dependency mathematical helper to calculate the exact great-circle distance between two geographic coordinates.

#### Design Optimization
1. **Memory Allocation Defenses**: Eliminates heap-allocation churn by performing calculations using direct primitives, blocking the Garbage Collector from triggering stutters.
2. **Geometric Integrity**: Uses pure spherical trigonometry, ensuring precision for both high-latitude and equatorial networks.


---

## Spatial Grid Indexing Utility (`utils/getNearbyStops.js`)
#### Objective
Bridges geographic coordinate pins (latitude/longitude) to the transit network by performing high-speed spatial searches over the compiled spatial grid hash map.
#### Design Optimization & Penalties
1. **Radius Bounding Box**: Calculates a dynamic grid search radius based on a max walking boundary (`2500m`) and grid resolution.
2. **Detour Simulation**: Applies an urban detour factor (`DETOUR_FACTOR = 1.2`) to simulate real sidewalk paths instead of straight-line distance, yielding exact walking distances (`walkDistanceMeters`).
3. **Bilateral Station Access Penalties**: Inspects the transit routes servicing each candidate stop. If a station serves a heavy transit mode—specifically **metro, railway, or ferry (`route_type` 1, 2, or 4)**—a **120-second station access penalty** is automatically added to both station-entry (origin) and station-exit (destination) walking legs to account for platform and gate traversal friction.

---

## Shape Injection Utility (`utils/injectTransitShape.js`)
#### Objective
An isolation layer that shields the core routing engine from heavy map geometry processing.
#### Design Optimization
1. **$O(1)$ Array Slicing**: Retrieves exact transit polylines by referencing pre-computed array indices.
2. **Graceful Fallback**: Dynamically falls back to generating a straight 2-point line connecting the boarding and alighting stations if the transit agency omitted shape geometry for a specific trip.

---

## Pipeline Orchestration (`runPipeline.js`)

Automates the ingestion chain using `child_process.execSync`, ensuring relational dependencies are strictly preserved by freezing parent execution until each sub-parser yields a successful exit code.

## Running the Project

### Quickstart

In order, from a clean checkout. Each step depends on the one before it: the
server reads what the pipeline wrote, and the client reads what the server
serves.

```bash
# 0. Dependencies. The pipeline and backend share the root node_modules;
#    the client has its own.
npm install
cd frontend && npm install && cd ..

# 1. Compile the feed. Reads raw-data/<network>-gtfs-data, writes
#    processed-data/<network>-processed-data. Minutes, not seconds — and
#    nothing else will start until it has run at least once.
cd offline-data-ingestion-pipeline && node runPipeline.js && cd ..

# 2. The API. Loads every compiled file into memory before opening the port,
#    so it is slow to start and fast to answer. Leave it running.
cd backend && npm run dev

# 3. The client, in a second terminal.
cd frontend && npm run dev
```

Then open the address Vite prints — `http://localhost:5173` by default.

**Step 1 is not optional and is easy to skip.** The backend does not read GTFS;
it reads the JSON the pipeline compiles from it, synchronously, before it opens
the port. Skip it and the server exits with an `ENOENT` naming the
`processed-data/<network>-processed-data` file it wanted — which is at least a
clear message, and means "run the pipeline", not "reinstall something". Run it
again whenever you change `ACTIVE_NETWORK`: the compiled output is per-network,
and the server reads whichever network that token names.

---

### What you need first

* **Node.js 22 or newer.** The backend starts with `--env-file-if-exists`, which
  is native to Node and is why there is no `dotenv` dependency.
* **A GTFS dataset** for the network you want, unzipped into `raw-data/`.
* **MongoDB** — optional, and only for the travel-card endpoints. Everything
  else is served from the compiled feed held in memory. Without it the card
  endpoints answer with a `503` saying the store is unavailable, and the rest
  of the app is unaffected.

Dependencies for the pipeline and the backend live in the **root**
`node_modules` — `backend/package.json` carries scripts only. The client has
its own, which is why the quickstart installs twice.

### 1. Configure the Target Transit Network

The project supports multiple GTFS datasets through the centralized configuration registry.

1. Place the unzipped GTFS dataset inside the `raw-data/` directory.
2. Name the folder using the convention `<network>-gtfs-data` (for example, `amman-gtfs-data` or `hsl-gtfs-data`).
3. Open `pipelineConfig.js`.
4. Set the `ACTIVE_NETWORK` property to the desired network (e.g., `"amman"` or `"hsl"`).

That single token drives every path in the pipeline **and** in the backend.
The client needs a few entries of its own — see
[Switching networks](#switching-networks) for the complete list.

---

### 2. Build the Optimized Data Structures

Run the offline preprocessing pipeline:

```bash
cd offline-data-ingestion-pipeline && node runPipeline.js
```

This executes the complete ingestion pipeline, validates the GTFS feed, and generates all optimized JSON structures required by the routing engine.

---

### 3. Start the API server

```bash
cd backend && npm run dev     # http://localhost:3000, restarts on change
cd backend && npm start       # the same without the watcher
```

Startup is deliberately slow and requests are not: `memoryCache.js` loads every
compiled file synchronously at require time, so the whole network is in the V8
heap before the port opens.

The port defaults to `3000` and is set in `backend/server/serverConfig.js`,
which honours `PORT`. Whatever you choose, the client's `VITE_API_BASE_URL`
must agree with it.

Optional, for the travel-card endpoints only:

```bash
cp backend/.env.example backend/.env   # then edit MONGO_URI
```

#### Endpoints

| Endpoint | What it answers |
| --- | --- |
| `GET /api/planner` | Plans a journey between two points |
| `GET /api/stops` | Every stop inside a bounding box |
| `GET /api/stop/:id` | One stop, and what leaves it next |
| `GET /api/routes` | The lines in the network, and one line's detail |
| `GET /api/network` | Which network this is, and its timezone |
| `GET /api/valid-dates` | The service days the compiled feed covers |
| `GET /api/card/:number` | A travel card's balance (needs MongoDB) |
| `GET /api/health` | A liveness probe, used to gate the client's form |

Every failure carries `{ errorCode, error }`. The status says *who* refused,
not whether there is an answer: a **200 can still carry an `errorCode`** —
`NO_ROUTE_FOUND` and `DESTINATION_OUT_OF_BOUNDS` among them — because the
request was fine and the engine has an outcome to report. Code that goes
straight to reading `legs` will call that "unreadable response" when it means
"nothing runs then". The `error` string is developer-facing English and is
never shown to anyone.

One asymmetry to know about when calling `/api/planner` by hand: **it takes
`HH:MM:SS` and answers in `HH:mm`.** A `time` of `09:00` is rejected with
`BAD_TIME`; `09:00:00` is accepted, and the itinerary that comes back reports
`"startTime": "09:00"`. The client appends the seconds itself for this reason.

```bash
curl "http://localhost:3000/api/planner?originLat=60.1689&originLon=24.9317\
&destLat=60.1985&destLon=24.9333&date=2026-08-28&time=09:00:00"
```

Note the destination parameters are `destLat`/`destLon` — not `destination*`.
Either end may instead be given as a stop: `originStopId` / `destStopId`.

---

### 4. Start the web client

```bash
cd frontend && npm install
cd frontend && npm run dev        # Vite dev server
cd frontend && npm run build      # tsc -b && vite build
cd frontend && npm run lint       # oxlint
cd frontend && npm test           # vitest, single run
cd frontend && npm run check:contrast   # WCAG AA check on the design tokens
```

The client needs `VITE_API_BASE_URL` and **will refuse to start without it** —
there is no fallback to localhost, so a production build cannot silently point
at nothing. `frontend/.env.development` supplies it for local work; copy
`frontend/.env.example` to `frontend/.env.local` to override.

---

### 5. Opening it on a phone

Both servers have to be reachable from the phone, and only one of them already
is. The API listens on every interface, so it needs nothing. Vite binds to
localhost by default and has to be told otherwise:

```bash
cd backend  && npm run dev
cd frontend && npm run dev -- --host
```

`--host` makes Vite print an address per network interface — one line per
interface, so a machine on both Wi-Fi and Ethernet prints two:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.1.42:5173/  en0
```

**Use the address *your* machine prints, and put the same one in
`VITE_API_BASE_URL`.** The `192.168.1.42` here and below is only an example —
yours will differ, and on a machine with several interfaces the wrong line
looks just as plausible as the right one.

That variable is the whole trick: the phone's `localhost` is the *phone*, so a
client told to call `http://localhost:3000` asks the handset for a journey
planner and is told nothing is there.

```bash
# frontend/.env.development.local — git-ignored, for local overrides
VITE_API_BASE_URL=http://192.168.1.42:3000   # your address, not this one
```

Then open that same address on the phone, with both devices on the same Wi-Fi.
macOS may ask once whether to allow incoming connections; it has to be allowed.

Three things that waste an afternoon if you do not know them:

* **The address is baked in at load, so changing it needs a Vite restart.** It
  is read through `src/config/env.ts`, which validates at startup.
* **The address changes.** It moves when the router reassigns a lease, and a
  machine with more than one interface has more than one to choose from. A
  stale or wrong value is a silent failure: the app loads
  and the API calls never answer, so the clock and the stop list stay empty
  while everything else looks fine. If that happens, re-read what Vite printed.
* **"Near me" will not work.** `navigator.geolocation` requires a secure
  context, and while `http://localhost` counts as one, `http://192.168.x.x`
  does not. The button is refused by the browser rather than by the app.
  Everything else works; if you need to test that button specifically, reach
  the dev server over HTTPS or a tunnel that terminates it.

---

### Calling the RAPTOR engine directly

Everything above goes through the HTTP API, which is what the client uses. The
engine underneath can also be called on its own — useful for testing routing in
isolation, and the reason the two are described differently below: the engine
speaks in **raw seconds from midnight**, and the API's presenter
(`formatItinerary.js`) is what turns those into `HH:mm` strings and rounded
durations.

Invoke the `raptorEngine` function with the following parameters:

```javascript
raptorEngine(
    sourceNode,      // Object: { type: "stop", id: "123" } OR { type: "coordinate", lat: 60.1, lon: 24.9 }
    targetNode,      // Object: { type: "stop", id: "123" } OR { type: "coordinate", lat: 60.1, lon: 24.9 }
    queryDate,       // "YYYY-MM-DD"
    departureTime    // "HH:MM:SS"
);
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `sourceStop` | Object defining the origin (either a GTFS Stop ID or lat/lon coordinates) |
| `targetStop` | Object defining the destination (either a GTFS Stop ID or lat/lon coordinates) |
| `queryDate` | Date of travel in `YYYY-MM-DD` format |
| `departureTime` | Desired departure time in `HH:MM:SS` format |
| `WALKING_SPEED_MPS` | (Optional) Average human walking pace in meters/sec (Defaults to 1.27778)|

---

### Output
The engine executes the RAPTOR routing algorithm over the preprocessed transit network and returns the earliest reachable arrival time at the specified destination. During execution, the engine automatically:
- Resolves the transit services active on the query date.
- Selects the earliest valid trip for each scanned route using binary search.
- Processes pedestrian transfers between nearby stops via spatial indexing.
- Displays waiting time at stations *before* a trip shall be boarded
- Applies RAPTOR pruning rules to eliminate dominated journeys while preserving correctness.
- Reconstructs the selected path.

To keep mathematics and presentation apart, the engine deals only in **raw
integer seconds from absolute engine midnight** — it has no opinion about how a
time should be written. What it hands back is therefore not what the API
returns:

```json
{
  "targetArrivalTime": 80280,
  "legs": [
    {
      "waitDurationSeconds": 0,
      "startTime": 79800,
      "fromStop": {
        "name": "Kamppi",
        "code": "H0614",
        "lat": 60.168,
        "lon": 24.931
      },
      "routeShortName": "2",
      "routeType": 0,
      "intermediateStops": [
        {
          "stopName": "Luonnontieteellinen museo",
          "stopCode": "H0612",
          "stopArrivalTimeSeconds": 79830
        }
      ],
      "toStop": {
        "name": "Sammonkatu",
        "code": "H0639",
        "lat": 60.171,
        "lon": 24.925
      },
      "endTime": 79860,
      "mode": "TRANSIT",
      "tripId": "1002_20260831_Su_2_2220",
      "transitDistanceKilometers": 1.209,
      "walkDurationSeconds": 0,
      "walkDistanceMeters": null
    },
    {
      "waitDurationSeconds": 300,
      "startTime": 80160,
      "fromStop": {
        "name": "Sammonkatu",
        "code": "H0639",
        "lat": 60.171,
        "lon": 24.925
      },
      "routeShortName": null,
      "routeType": null,
      "intermediateStops": null,
      "toStop": {
        "name": "Destination",
        "code": "TARGET_PIN",
        "lat": 60.175,
        "lon": 24.930
      },
      "endTime": 80400,
      "mode": "WALK",
      "tripId": null,
      "transitDistanceKilometers": null,
      "walkDurationSeconds": 240,
      "walkDistanceMeters": 266
    }
  ]
}
```

### What `/api/planner` returns

`formatItinerary.js` turns those seconds into wall-clock strings in the
network's timezone, adds the itinerary's own totals, and that is what leaves
the server. Captured from a live request:

```json
{
  "startDate": "2026-08-28",
  "startTime": "09:00",
  "endDate": "2026-08-28",
  "endTime": "09:20",
  "totalDurationMinutes": 20,
  "legs": [
    {
      "mode": "WALK",
      "waitDurationMinutes": 0,
      "startDate": "2026-08-28",
      "startTime": "09:00",
      "fromStop": {
        "name": "ORIGIN",
        "id": null,
        "code": "ORIGIN_PIN",
        "platform": null,
        "lat": 60.1689,
        "lon": 24.9317
      },
      "routeShortName": null,
      "routeType": null,
      "lineId": null,
      "patternId": null,
      "routeLongName": null,
      "directionId": null,
      "headsign": null,
      "destination": null,
      "intermediateStops": null,
      "toStop": {
        "id": "1020502",
        "name": "Helsinki",
        "code": "H0064",
        "platform": null,
        "lat": 60.17272,
        "lon": 24.939911
      },
      "endDate": "2026-08-28",
      "endTime": "09:12",
      "tripId": null,
      "transitDurationMinutes": null,
      "transitDistanceMeters": null,
      "walkDurationMinutes": 12,
      "walkDistanceMeters": 750,
      "shape": [
        [
          60.1689,
          24.9317
        ],
        [
          60.17272,
          24.939911
        ]
      ]
    },
    {
      "mode": "TRANSIT",
      "waitDurationMinutes": 0,
      "startDate": "2026-08-28",
      "startTime": "09:12",
      "fromStop": {
        "id": "1020502",
        "name": "Helsinki",
        "code": "H0064",
        "platform": null,
        "lat": 60.17272,
        "lon": 24.939911
      },
      "routeShortName": "U",
      "routeType": 2,
      "lineId": "train-U",
      "patternId": 716,
      "routeLongName": "Helsinki-Kirkkonummi",
      "directionId": 0,
      "headsign": "Kirkkonummi",
      "destination": "Kirkkonummi",
      "intermediateStops": [],
      "toStop": {
        "id": "1174504",
        "name": "Pasila",
        "code": "H0090",
        "platform": "8",
        "lat": 60.199483,
        "lon": 24.932706
      },
      "endDate": "2026-08-28",
      "endTime": "09:16",
      "tripId": "3002U_20260814_Pe_1_0912",
      "transitDurationMinutes": 4,
      "transitDistanceMeters": 3050,
      "walkDurationMinutes": null,
      "walkDistanceMeters": null,
      "shape": [
        [
          60.17272,
          24.939911
        ],
        [
          60.178854,
          24.939419
        ],
        [
          60.199483,
          24.932706
        ]
      ]
    }
  ]
}
```

Elided for length: this itinerary has a third leg (the walk from the alighting
stop), and each `shape` is the full run of coordinates rather than three.
Nothing else is trimmed — every field a leg carries is above.

Three things in there are worth pointing out, because a client that assumes
otherwise breaks quietly:

* **A leg is a discriminated union on `mode`.** `WALK` and `TRANSIT` legs carry
  the same keys, and the ones that do not apply are `null` rather than absent —
  a walk has no `routeShortName`, a ride has no `walkDistanceMeters`.
* **Times are `HH:mm` and each leg carries its own date.** An itinerary can
  legitimately cross midnight, because the engine loads yesterday, today and
  tomorrow with offsets, so `endDate` may be later than `startDate`.
* **`ORIGIN_PIN` and `TARGET_PIN` are synthetic.** When a journey starts or
  ends at a coordinate rather than a stop, the engine invents an endpoint named
  `ORIGIN`/`TARGET`. They are placeholders, and a client should substitute
  whatever the traveller actually chose.

Every duration in a response is measured between the rounded times that same
response publishes, never from the engine's exact seconds. A leg's duration is
`endTime − startTime`, a wait is the gap between the previous leg's `endTime`
and this leg's `startTime`, and legs and waits tile the journey — they sum to
`totalDurationMinutes`. **A client must not recompute a duration.**

## Switching networks

`ACTIVE_NETWORK` in `pipelineConfig.js` is the whole story for the pipeline and
the backend — one token, and every input and output path follows it. The client
is not automatic in the same way, because the things it needs are facts about a
city that no feed contains. Adding one means adding entries, not editing logic.

| What | Where | Why it cannot be derived |
| --- | --- | --- |
| `ACTIVE_NETWORK` | `pipelineConfig.js` | The one token the pipeline and backend derive every path from |
| Search bounds | `frontend/src/config/geocoding.ts` | How far out a place search should look; a feed's own extent is far wider than anywhere useful to search |
| Geocoding adapter | `frontend/src/geocoding/` | Which service knows this city's addresses *and* its stops |
| Basemap style | `frontend/src/map/tileSource.ts` | A city may want its operator's own cartography |
| Where the maps open | `frontend/src/map/homeView.ts` | A resting view is a judgement about a city, not a centroid |

A few notes on that last one, because it is the easiest to get wrong. The
resting view is **not** the middle of the search bounds: those are generous on
purpose — HSL's reach extends an hour of commuter rail north of Helsinki — and
framing to them opens on a region where the city is a smudge. The view Helsinki
uses sits between the central station and the market square, which is the one
stretch holding all five modes at once: trains and the metro under the station,
trams and buses through the middle, and the ferry at the far end.

**Time is always the network's clock.** Every timestamp in this system is
wall-clock time in the active network's timezone, taken from the feed's own
`agency_timezone` — never the server's and never the browser's. A Helsinki
timetable reads the same whether the server runs in Frankfurt and the visitor
is in Amman. Values coming *out* of the API are already network-local and must
not be converted again.

---

## External dependencies and keys

The client's dependency footprint is deliberately small, and no key is required
to run the project. Two are optional and improve it.

| Service | Used for | Key | Without it |
| --- | --- | --- | --- |
| **Photon** | Place search | none | — the default, and works everywhere |
| **Digitransit** | Place search that knows HSL's own stops | `VITE_DIGITRANSIT_SUBSCRIPTION_KEY` | Falls back to Photon: you lose stop suggestions, not search |
| **CARTO** | Vector basemap tiles | `VITE_CARTO_API_KEY` | Tiles still load, on an anonymous tier that has grown unreliable |
| **MongoDB** | Travel-card balances | `MONGO_URI` | Card endpoints report unavailable; nothing else is affected |

Two things worth knowing about the keys:

* **Both browser keys are public by design.** They ship in the bundle, are
  issued for exactly that use, and are rate-limited per key rather than kept
  secret. The consequence is that the quota belongs to whoever deploys this.
* **CARTO reads its key as `key`, not `api_key`.** Sending the wrong name is
  not an error — the CDN answers `200` either way and quietly serves an
  "API KEY REQUIRED" watermark over real cartography, with nothing in the
  console to say why.

### Environment variables

| Variable | Where | Required |
| --- | --- | --- |
| `PORT` | backend | No — defaults to `3000` |
| `MONGO_URI` | backend (`backend/.env`) | No — card endpoints only |
| `VITE_API_BASE_URL` | frontend | **Yes** — the app throws at startup without it |
| `VITE_DIGITRANSIT_SUBSCRIPTION_KEY` | frontend | No |
| `VITE_CARTO_API_KEY` | frontend | No |

Copy `backend/.env.example` and `frontend/.env.example` for the annotated
versions. Both are committed; the files they are copied to are git-ignored.

### The map needs WebGL2

The client's maps are vector — geometry drawn on the GPU from a stylesheet —
so there is no software renderer to fall back to. Every browser in the declared
support baseline ships WebGL2; what actually turns it off is a hardened
configuration, a blocklisted GPU driver, or a remote session with no
accelerated context. Those visitors get a panel where the map would be and a
page that otherwise works exactly as it does for everyone else, which is the
point of the rule that the map is never the only route to any information.

---

## Known Limitations & Unexpected Behaviors

Because this engine strictly implements the foundational RAPTOR algorithm, there are a few edge cases and mathematical quirks to be aware of during routing.

### 1. The "No Direct Start" Limitation
* **The Behavior:** When running a pure station-to-station query (passing `type: "stop"` for both origin and destination), the engine may fail to find a route if the origin stop does not have a direct connection, even if a stop 100 meters away does.
* **The Cause:** This implementation uses pure RAPTOR without Round-0 footpath expansion for exact stop nodes.
* **The Resolution:** This occurs specifically when we don't convert the origin stop into a coordinate. This will be completely resolved once the Stop-to-Coordinate conversion pipeline (which is currently written but commented out) is fully activated.

### 2. The Latent "Trip Over-Boarding" Bug
* **The Behavior:** The engine might instruct a user to get off a bus, walk to a nearby stop, and re-board the *exact same vehicle*, or even leave a the initial station, walk to a nearby station, then board the same exact bus that passed through the initial station.
* **The Cause:** Pure RAPTOR optimizes exclusively for the earliest absolute arrival time. If walking a footpath cuts a corner faster than the bus drives it, the math blindly accepts the walk as the "better" path.
* **The Resolution:** This surfaces primarily when coordinate-based origins trigger dense footpath overlaps. This will be permanently eliminated in future iterations by upgrading the core engine to **McRAPTOR (Multi-Criteria RAPTOR)**, which natively penalizes unnecessary transfers.

### 3. Unrealistic Footpath Routing
* **The Behavior:** The routing engine occasionally generates walking legs or footpaths that traverse physically impassable terrain, such as walking straight across bodies of water, cutting directly through building footprints, or crossing restricted private property.
* **The Cause:** This anomaly is a direct result of calculating footpaths using the Haversine formula. The Haversine function computes the straight-line ("as-the-crow-flies") distance between two geographic coordinates without any awareness of urban topology, street layouts, sidewalks, or natural barriers. As a result, stops that are geographically close get connected via a direct Euclidean vector, completely ignoring real-world obstacles like rivers, lakes, and structural blockages.

### 4. Pedestrian-Only Itineraries
* **The Behavior:** The engine returns an itinerary consisting of a single, direct walking leg with no transit boarded.
* **The Cause:** This is mathematically correct behavior. It means one of two things: either walking directly from the origin pin to the target pin is objectively faster than walking to a station, waiting for a bus, and riding it; or there is simply no valid transit service operating during the requested temporal window.


### 5. Null Transit Distances
* **The Behavior:** The `transitDistanceMeters` property returns `null` in the final JSON payload for a transit leg.
* **The Cause:** This is an expected fallback. The GTFS specification considers the `shape_dist_traveled` column inside `stop_times.txt` to be optional. If a transit agency omits this column, the offline compiler dynamically disables distance tracking to save RAM, resulting in a clean `null` value in the frontend payload.