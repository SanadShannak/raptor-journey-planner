# RAPTOR Journey Planner Engine

Live at **[journeyplanner.city](https://journeyplanner.city)**, serving Helsinki's
HSL network.

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

One thing is not served from the compiled feed: **accounts**. Sign-in, saved
stops, lines and journeys, and travel cards live in MongoDB (a free Atlas
cluster in production), and the server will not start without a database.

In production each part runs as a container behind a reverse proxy — see
[Deployment](#deployment).

---

## Quickstart

In order, from a clean checkout. Each step depends on the one before it: the
server reads what the pipeline wrote, and the client reads what the server
serves.

```bash
# 0. Dependencies. The pipeline and backend share the root node_modules;
#    the client has its own.
npm install
cd frontend && npm install && cd ..

# 1. The API's settings. Copy the template, then set the two required values
#    shown below the block.
cp backend/.env.example backend/.env

# 2. Compile the feed. Reads raw-data/<network>-gtfs-data, writes
#    processed-data/<network>-processed-data. Minutes, not seconds — and
#    nothing else will start until it has run at least once.
cd offline-data-ingestion-pipeline && node runPipeline.js && cd ..

# 3. The API. Loads every compiled file into memory and connects to MongoDB
#    before opening the port, so it is slow to start and fast to answer.
#    Leave it running.
cd backend && npm run dev

# 4. The client, in a second terminal.
cd frontend && npm run dev
```

```bash
# backend/.env — the two values you must set
MONGO_URI=mongodb://127.0.0.1:27017/journey_planner_db   # or your Atlas URI
JWT_SECRET_KEY=<a long random string — e.g. the output of: openssl rand -hex 32>
```

The client needs nothing: its settings are committed in `frontend/.env`. Your
optional map and search keys go in `frontend/.env.local` — see
[Start the web client](#4-start-the-web-client).

Then open the address Vite prints — `http://localhost:5173` by default.

**Step 2 is not optional and is easy to skip.** The backend does not read GTFS;
it reads the JSON the pipeline compiles from it, synchronously, before it opens
the port. Skip it and the server prints
`File footpaths.processed.json does not exist` and exits — which means "run the
pipeline", not "reinstall something". Run it again whenever you change
`ACTIVE_NETWORK`: the compiled output is per-network, and the server reads
whichever network that token names.

**Neither is the database.** The server connects to MongoDB before it listens,
and exits with a `[Database] Error` if it cannot. The `MONGO_URI` above is a
local `mongod`; a free Atlas cluster works the same way — paste its URI
instead. `JWT_SECRET_KEY` signs the session cookie, and without it every login
fails.

Everything below this is reference. For the detail — prerequisites, the API's
endpoints, opening it on a phone — see
[Running the Project](#running-the-project); for a different city, see
[Switching networks](#switching-networks); for containers and the live server,
see [Deployment](#deployment).

---

## The Pipeline Configuration Registry (`offline-data-ingestion-pipeline/pipelineConfig.js`)

To prevent hardcoding folder names inside individual parser scripts, we use a central configuration file. This allows us to scale the project easily and switch between different city networks with a single string swap.

### Structural Manifest Rules
1. **Network Independence:** To switch the target data from Helsinki (`hsl`) to Amman (`amman`), change the `ACTIVE_NETWORK` property. All parsers automatically adjust their input and output paths based on this single token.
2. **Pipeline Integrity Controls:** The configuration features a strict `rules` schema validator containing arrays of `requiredFiles` and column headers ensuring incomplete or structurally corrupt datasets are rejected at the stream boundary.
3. **The Backend Asks Its Environment First:** The server reads `ACTIVE_NETWORK` from its environment and falls back to this file only when the variable is unset (`resolveActiveNetwork()` in `backend/src/serverConfig.js`). A checkout keeps working with nothing set, because the feed on disk is whatever this file compiled; a container, which ships without the pipeline, is told per deployment. Unset *and* unavailable is a hard error rather than a guess — a server that guessed `hsl` would quietly read one city's folders while another city's feed sat beside it.

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
3. **Route Output**: Writes the patterns themselves to `routes.processed.json`.
4. **Destination Signs**: Writes each trip's own headsign to `trip-headsigns.processed.json`, deduplicated into a `values` table with a `by_trip` index. A pattern's trips do not always share one sign — a rail line can run some trips beyond the usual terminus — so a departure board needs the trip's sign, not the pattern's.

---

### Component 4: Timetable Compiler (`parseTimetables.js`)

#### Objective
Ingests and transforms raw calendar schedules from `stop_times.txt` into a high-performance, memory-optimized temporal lookup matrix.

#### Ingestion Rules
1. **Temporal Serialization**: Converts `HH:MM:SS` text timestamps into highly compressed base-10 integers representing **Seconds From Midnight**.
2. **Memory Layout**: An array indexed by the flat trip ID from `trip-mapping.json`; each entry is that trip's ordered `[{ arrival, departure }]` in seconds from midnight, so any trip's times are one array index away — $O(1)$, with no string keys.

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
3. **$O(1)$ Memory Indexing**: Builds one stop-offset table per distinct shape and points every trip at the table it shares (`trip-shape-index.processed.json`), ensuring the routing engine can extract a 50-kilometer polyline in under a millisecond. HSL's 380,746 trips ride 1,206 distinct tables, so indexing them rather than giving each trip its own copy costs 1.8 MB on disk and 4 MB of server heap instead of 130 MB and 593 MB.

---

### Component 9: Network Metadata Compiler (`parseNetworkMeta.js`)
#### Objective
Compiles the network's description of itself into `network-meta.processed.json`: timezone, language and agency from `agency.txt`; publisher, version and **validity window** (`feedStartDate`, `feedEndDate`) from `feed_info.txt` where the feed has one; the compile time; and an `available` manifest of which optional data the feed actually supplied (stop codes, platforms, fare zones, headsigns, shapes, distances, and so on).
#### Logic Metrics
1. **Runs Last on Purpose**: The capability flags are read from the *compiled* output rather than the raw feed, so they describe what consumers will really find. A column present in the CSV but blank in every row counts as absent.
2. **The Timezone Is Derived, Not Configured**: Every timestamp in the system is wall-clock time in the network's zone, and the feed states that zone in `agency.txt`. The backend's `NETWORK_TIMEZONES` table is only a fallback for a feed that has no `agency.txt`.
3. **Feeds Expire**: `feedEndDate` is the last day the timetable covers. Past it, the planner has no service days to offer — see [Operating it](#operating-it).

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
7. **Stage 3 (Footpath Processing)**: Processes pedestrian transfers between stops from the precompiled footpath matrix (`footpaths.processed.json`), at the requested walking speed.
8. **Path Reconstruction**: Backtracks through parent pointer matrices to construct an ordered, turn-by-turn itinerary. 
9. **UI & Geometry Hydration**: Enriches the final mathematical path with UI metadata (GTFS `route_type` integer) and injects highly accurate geographic shape polylines via $O(1)$ array slicing for frontend map rendering.

---

### The HTTP API (`backend/src/`)
#### Objective
Exposes the RAPTOR engine, the compiled feed, and user accounts to client
applications over HTTP. `index.js` starts it; `server.js` connects to MongoDB
and only then listens; `app.js` mounts one router per endpoint from `routes/`.
The account endpoints go a layer further — `routes/` → `validators/`
(express-validator rules) → `controllers/` → `models/` (Mongoose) — with
`middleware/requireAuth.js` guarding everything that needs a session. See
[Endpoints](#endpoints) for the list.
#### Operational Logic
1. **Synchronous Memory Bootstrapping**: Leverages Node's synchronous `require()` behavior to load all massive GTFS JSON data into the V8 memory heap *before* opening the port to accept traffic. The database connection comes next, and also before the port opens: if either fails the process exits, so a server that cannot route, or cannot answer for an account, never starts half-working.
2. **Input Validation**: Uses utility validators to strictly enforce date formats (`YYYY-MM-DD`), time formats (`HH:MM:SS`), and optional walking speed constraints.
3. **Performance Telemetry**: Utilizes `performance.now()` to track and log exact execution times for every route calculated.
4. **Two Error Shapes**: The two halves of the API grew at different times and
   answer differently, and a client has to know which it is talking to.
   * **The feed endpoints** (planner, stops, lines, network, dates) carry
     `{ errorCode, error }`, and the status says *who* refused rather than
     whether there is an answer: a malformed request is a `400`, an unknown stop
     or line a `404`, an unexpected throw a `500`. An engine outcome is **none
     of those** — `NO_ROUTE_FOUND` and `DESTINATION_OUT_OF_BOUNDS` come back with
     a `200`, because the request was fine and "nothing runs between those
     points then" is an answer rather than a fault. A client that goes straight
     to reading `legs` reports "unreadable response" for what is really an empty
     result, so **read `errorCode` on a successful response too**.
   * **The account endpoints** (`/api/auth`, `/api/cards`, `/api/user`) carry
     `{ message }` — or `{ errors: [...] }`, one per field, when request
     validation fails with a `400`. A missing or expired session, or a wrong
     password, is a `401`; something not on this account is a `404`; a limit
     reached (five cards, five saved stops) is a `422`.

   Neither `error` nor `message` is ever shown to anyone: both are
   developer-facing English. The client maps each failure to a localised
   message itself — see `frontend/src/api/errors.ts`.
5. **Presenter Pattern (`formatItinerary.js`)**: Once the engine completes
   execution, the raw timeline arrays are passed through a formatter that turns
   engine seconds into wall-clock strings in the network's timezone and attaches
   the itinerary's own totals. Three rounding rules live here, and they are the
   reason a client must never recompute a duration: times round to whole minutes
   **asymmetrically** — an arrival up, a departure down, so nobody is told they
   arrive earlier or may leave later than they can — durations round to whole
   minutes with a floor of 1, and distances to the nearest 50 m with a floor of
   50. See [What `/api/planner` returns](#what-apiplanner-returns).
6. **Sessions**: Logging in sets an HTTP-only cookie (`jwt`) holding a signed
   token, `SameSite=Strict`, valid for 30 days. It is marked `Secure` whenever
   `NODE_ENV=production` — which the container sets — so **in production a
   session only survives over HTTPS**. Login appearing to succeed and then
   forgetting you is the symptom of serving the production build over plain
   HTTP, not a bug in the login.

---

## Haversine Spatial Calculator (`utils/calculateHaversine.js`)

#### Objective
Provides a zero-dependency mathematical helper to calculate the exact great-circle distance between two geographic coordinates. There are two copies, one per side of the decoupling: `offline-data-ingestion-pipeline/utils/` for the footpath generator, and `backend/raptor-engines/utils/` for the engine's coordinate lookups.

#### Design Optimization
1. **Memory Allocation Defenses**: Eliminates heap-allocation churn by performing calculations using direct primitives, blocking the Garbage Collector from triggering stutters.
2. **Geometric Integrity**: Uses pure spherical trigonometry, ensuring precision for both high-latitude and equatorial networks.


---

## Spatial Grid Indexing Utility (`backend/raptor-engines/utils/getNearbyStops.js`)
#### Objective
Bridges geographic coordinate pins (latitude/longitude) to the transit network by performing high-speed spatial searches over the compiled spatial grid hash map.
#### Design Optimization & Penalties
1. **Radius Bounding Box**: Calculates a dynamic grid search radius based on a max walking boundary (`2500m`) and grid resolution.
2. **Detour Simulation**: Applies an urban detour factor (`DETOUR_FACTOR = 1.2`) to simulate real sidewalk paths instead of straight-line distance, yielding exact walking distances (`walkDistanceMeters`).
3. **Bilateral Station Access Penalties**: Inspects the transit routes servicing each candidate stop. If a station serves a heavy transit mode—specifically **metro, railway, or ferry (`route_type` 1, 2, or 4)**—a **120-second station access penalty** is automatically added to both station-entry (origin) and station-exit (destination) walking legs to account for platform and gate traversal friction.

---

## Shape Injection Utility (`backend/raptor-engines/utils/injectTransitShape.js`)
#### Objective
An isolation layer that shields the core routing engine from heavy map geometry processing.
#### Design Optimization
1. **$O(1)$ Array Slicing**: Retrieves exact transit polylines by referencing pre-computed array indices. A trip's offsets are looked up through `getTripShape()` in `memoryCache.js`, which follows `by_trip` into the shared table of `trip-shape-index.processed.json` — the same indirection the headsigns use.
2. **Graceful Fallback**: Dynamically falls back to generating a straight 2-point line connecting the boarding and alighting stations if the transit agency omitted shape geometry for a specific trip.

---

## Pipeline Orchestration (`runPipeline.js`)

Automates the ingestion chain using `child_process.execSync`, ensuring relational dependencies are strictly preserved by freezing parent execution until each sub-parser yields a successful exit code. The nine components run in the order above, and the order is load-bearing: later components read what earlier ones wrote, and the metadata compiler runs last because it describes the compiled output.

---

## Running the Project

### What you need first

* **Node.js 22.9 or newer.** The backend's npm scripts start it with
  `--env-file-if-exists`, which arrived in 22.9.0 and is why there is no
  `dotenv` dependency. The container images use 22.23.3.
* **A GTFS dataset** for the network you want, unzipped into `raw-data/`.
* **MongoDB** — required. Accounts, saved items and travel cards live there,
  and the server will not open its port without a connection. A local `mongod`
  or a free [Atlas](https://www.mongodb.com/atlas) cluster both work.
* **Docker** — only if you want to run the containers. See
  [Deployment](#deployment).

Dependencies for the pipeline and the backend live in the **root**
`node_modules` — `backend/package.json` carries scripts only. The client has
its own, which is why the quickstart installs twice.

### 1. Configure the Target Transit Network

The project supports multiple GTFS datasets through the centralized configuration registry.

1. Place the unzipped GTFS dataset inside the `raw-data/` directory.
2. Name the folder using the convention `<network>-gtfs-data` (for example, `amman-gtfs-data` or `hsl-gtfs-data`).
3. Open `offline-data-ingestion-pipeline/pipelineConfig.js`.
4. Set the `ACTIVE_NETWORK` property to the desired network (e.g., `"amman"` or `"hsl"`).

That single token drives every path in the pipeline, and the backend follows
it too unless its own environment says otherwise. The backend and the client
also need a few facts about a city that no feed contains — see
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

The server's settings come from `backend/.env` (git-ignored; copy
`backend/.env.example`, which explains every variable), read by Node through
`--env-file-if-exists`. The full list is under
[Environment variables](#environment-variables); the two you must set are
`MONGO_URI` and `JWT_SECRET_KEY`. The port defaults to `3000` and is set in
`backend/src/serverConfig.js`, which honours `PORT`. In development the client
reaches it through Vite's proxy, so if you move it, point `VITE_DEV_API_PROXY`
at the new port.

```bash
cd backend && npm run resetdb   # ⚠ drops the whole database MONGO_URI names
```

`resetdb` prints the host and database it is about to empty before it does.
Read that line: it goes through the same `.env` as the server, so with an Atlas
URI in there it empties Atlas, not a local copy.

#### Endpoints

Feed endpoints are public; they answer from the compiled network in memory.
`:id` is a GTFS stop id, `:lineId` a slug such as `bus-550` or `tram-1`.

| Endpoint | What it answers |
| --- | --- |
| `GET /api/health` | A liveness probe, used to gate the client's form |
| `GET /api/network` | Which network this is: timezone, language, currency, agency |
| `GET /api/valid-dates` | The service days the compiled feed covers |
| `GET /api/planner` | Plans a journey between two points |
| `GET /api/stops?minLat=&minLon=&maxLat=&maxLon=` | Every stop inside a bounding box |
| `GET /api/stop/:id` | One stop, and what leaves it next (`/api/stops/:id` works too) |
| `GET /api/stop/:id/timetable` | A stop's departures for a whole service day |
| `GET /api/routes` | The lines in the network, searchable by name and mode |
| `GET /api/routes/:lineId` | One line and its variants |
| `GET /api/routes/:lineId/:patternId` | One variant: its stops in order and its geometry |
| `GET /api/routes/:lineId/:patternId/timetable` | That variant's trips for a service day |

Account endpoints need MongoDB, and everything except register, login and
logout needs a session cookie:

| Endpoint | What it answers |
| --- | --- |
| `POST /api/auth/register` · `/login` · `/logout` | Create an account, sign in, sign out |
| `GET /api/auth/me` | The signed-in user |
| `POST /api/auth/verify-password` | Re-confirms the password before a sensitive action |
| `GET` · `POST /api/cards` | The account's travel cards; add one (at most five) |
| `GET /api/cards/:number` · `PATCH` · `DELETE /api/cards/:id` | One card; rename it; remove it (refused while it holds a balance) |
| `POST /api/cards/:id/top-up` · `/fare` | Add money; charge a fare |
| `/api/user/saved-stops` · `/saved-routes` · `/saved-itineraries` | Saved items: `GET` the list, `POST` one, `PATCH` / `DELETE /…/:itemId` |

The two halves fail differently — `{ errorCode, error }` from the feed
endpoints, `{ message }` from the account ones. See
[Two Error Shapes](#the-http-api-backendsrc). A **200 can still carry an
`errorCode`** — `NO_ROUTE_FOUND` and `DESTINATION_OUT_OF_BOUNDS` among them —
because the request was fine and the engine has an outcome to report. Code that
goes straight to reading `legs` will call that "unreadable response" when it
means "nothing runs then". Neither `error` nor `message` is ever shown to
anyone.

One asymmetry to know about when calling `/api/planner` by hand: **it takes
`HH:MM:SS` and answers in `HH:mm`.** A `time` of `09:00` is rejected with
`BAD_TIME`; `09:00:00` is accepted, and the itinerary that comes back reports
`"startTime": "09:00"`. The client appends the seconds itself for this reason.

```bash
curl "http://localhost:3000/api/planner?originLat=60.1689&originLon=24.9317\
&destLat=60.1985&destLon=24.9333&date=2026-10-12&time=09:00:00"
```

The `date` has to be one the compiled feed covers — `GET /api/valid-dates`
lists them, and a date outside the window is refused rather than guessed at.
Note the destination parameters are `destLat`/`destLon` — not `destination*`.
Either end may instead be given as a stop: `originStopId` / `destStopId`. An
optional `WALKING_SPEED_MPS` (that exact uppercase name) sets the walking pace
in metres per second.

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
at nothing. It doesn't need setting up, though. Two files hold the client's
configuration, and Vite reads both in every mode — the dev server,
`npm run build`, and the Docker image build — so all three always agree:

| File | In git | Holds |
| --- | --- | --- |
| `frontend/.env` | committed | `VITE_API_BASE_URL=/` and `VITE_DEV_API_PROXY`, the address the dev server forwards `/api` to |
| `frontend/.env.local` | ignored | Your optional browser keys — copy `frontend/.env.example` |

**Leave `VITE_API_BASE_URL` as `/`.** The session is an HTTP-only cookie, and
the API's `Access-Control-Allow-Origin: *` cannot be combined with credentials,
so an absolute, cross-origin address breaks every call under `/api/auth`,
`/api/user` and `/api/cards` — the cookie is never sent. One origin, with a
proxy forwarding `/api`, is the shape both development and production use.

Everything named `VITE_*` is compiled into the JavaScript every visitor
downloads, so neither file may ever hold a real secret. The two keys are
public by design (see [External dependencies](#external-dependencies-and-keys)).

**A first visit shows a short guided tour** of each page that has one (the
planner, an opened journey, routes, stops, travel card and favourites), and
the **?** button in the header replays it. Below 1280px wide — phones and
tablets — the header folds its links, settings and the **?** button into the
menu. Some steps act out what they describe (opening the map's "start here"
card, the first route or stop, the add-card form) and are undone afterwards,
so the tour always ends on the page, scroll position and control it was
started from. Which tours a browser has seen is kept in its `localStorage`
under `tours-seen`; delete that key in the browser's dev tools to see them
again as a newcomer would.

Tests ignore both files. `vite.config.ts` pins every `VITE_` variable for the
test run, because Vite loads `.env.local` in test mode too, and a real
Digitransit key there would switch the geocoder under test and send the suite's
requests to the real service. A new `VITE_` variable needs adding there as
well.

---

### 5. Opening it on a phone

Only the dev server has to be reachable from the phone. Vite already forwards
`/api` to the backend on your machine, so the phone talks to one origin and the
API is reached through it — no addresses to edit. Vite binds to localhost by
default and has to be told otherwise:

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

Open the `Network` address on the phone, with both devices on the same Wi-Fi.
The `192.168.1.42` here is only an example — use the line *your* machine prints.
macOS may ask once whether to allow incoming connections; it has to be allowed.

**Don't point `VITE_API_BASE_URL` at your machine's address instead.** That was
how this used to be done, and it now breaks accounts: the API would be a
different origin from the page, and the session cookie is never sent
cross-origin. Logging in works in development over plain HTTP because the
cookie is only marked `Secure` in production.

Two things that waste an afternoon if you do not know them:

* **The address changes.** It moves when the router reassigns a lease, and a
  machine with more than one interface has more than one to choose from. If the
  phone stops loading the page, re-read what Vite printed.
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
const raptorEngine = require("./backend/raptor-engines/raptorEngine.js");

raptorEngine(
    sourceNode,         // { type: "stop", id: "1020502" } OR { type: "coordinate", lat: 60.1, lon: 24.9 }
    targetNode,         // same shape as sourceNode
    queryDate,          // "YYYY-MM-DD"
    departureTime,      // "HH:MM:SS"
    WALKING_SPEED_MPS   // optional, metres per second
);
```

Requiring it loads the whole compiled network first — about 800 MB of heap and
a couple of seconds — through `memoryCache.js`, which resolves
`ACTIVE_NETWORK` exactly as the server does.

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `sourceNode` | The origin: a GTFS stop ID, or lat/lon coordinates |
| `targetNode` | The destination: a GTFS stop ID, or lat/lon coordinates |
| `queryDate` | Date of travel in `YYYY-MM-DD` format |
| `departureTime` | Desired departure time in `HH:MM:SS` format |
| `WALKING_SPEED_MPS` | (Optional) Average human walking pace in metres per second. Defaults to `1.27778` |

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
returns. Captured from the engine, between the same two points as the API example
below on a later date; each `shape` is cut to its two ends, and the final walking leg is
omitted:

```json
{
  "targetArrivalTime": 33589,
  "legs": [
    {
      "waitDurationSeconds": 0,
      "startDate": "2026-10-12",
      "startTime": 32413,
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
      "intermediateStops": null,
      "toStop": {
        "id": "1020502",
        "name": "Helsinki",
        "code": "H0064",
        "platform": null,
        "lat": 60.17272,
        "lon": 24.939911
      },
      "endDate": "2026-10-12",
      "endTime": 33120,
      "mode": "WALK",
      "tripId": null,
      "transitDurationSeconds": null,
      "transitDistanceMeters": null,
      "walkDurationSeconds": 707,
      "walkDistanceMeters": 750,
      "shape": [[60.1689, 24.9317], [60.17272, 24.939911]]
    },
    {
      "waitDurationSeconds": 0,
      "startDate": "2026-10-12",
      "startTime": 33120,
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
      "internalRouteId": 834,
      "internalTripId": 329795,
      "intermediateStops": [],
      "toStop": {
        "id": "1174504",
        "name": "Pasila",
        "code": "H0090",
        "platform": "8",
        "lat": 60.199483,
        "lon": 24.932706
      },
      "endDate": "2026-10-12",
      "endTime": 33360,
      "mode": "TRANSIT",
      "tripId": "3002U_20261005_Ma_1_0912",
      "transitDurationSeconds": 240,
      "transitDistanceMeters": 3026,
      "walkDurationSeconds": null,
      "walkDistanceMeters": null,
      "shape": [[60.17272, 24.939911], [60.199483, 24.932706]]
    }
  ]
}
```

A failed search keeps the same shape, with `targetArrivalTime: null`, empty
`legs`, and an `errorCode` saying why — `SAME_ORIGIN_TARGET`,
`NO_ROUTE_FOUND`, and so on. The API passes those codes through.

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

## Deployment

The live site runs as two containers on a shared server, behind a reverse
proxy that belongs to the server rather than to this project.

### How a request reaches the app

```
browser ──HTTPS──► edge Caddy            shared with the server's other apps;
                     │                     owns ports 80/443, holds certificates
                     │ journeyplanner.city → journey-planner-frontend:80
                     ▼
                   journey-planner-frontend   Caddy: serves the built site,
                     │                          forwards /api
                     │ /api/* → journey-planner-backend:3000
                     ▼
                   journey-planner-backend    Express + RAPTOR, feed in memory
                     │
                     ▼
                   MongoDB Atlas
```

The edge Caddy is **not** in this repository. It already serves other
applications on the same machine and terminates TLS for all of them, so this
stack publishes no ports: the frontend joins the edge proxy's Docker network
(`othman_default`) and is addressed by container name. The backend stays on
this stack's own private network only, because everything on a shared Docker
network can reach everything else — attached there, any other app on the box
could call the API directly, past both proxies.

There are still two Caddy processes, but not two layers of the same thing. The
edge one decides *which app* a hostname belongs to; this project's own one is
the app's web server — it serves the files, falls back to `index.html` for
client-side routes, and forwards `/api`. That logic belongs to the app, not to
infrastructure other services depend on.

### What's in the repository

| File | What it is |
| --- | --- |
| `backend/Dockerfile` | The API image |
| `frontend/Dockerfile` | The web image: builds the site, then serves it with Caddy |
| `frontend/Caddyfile` | That Caddy's routing — also bind-mounted at run time, so it must exist on the server as a file |
| `.dockerignore` | What the build may see. The repo is 5.7 GB; the images need about 3 MB of it |
| `compose.yaml` | **The server's** stack: pulls published images, joins the edge network, publishes nothing |
| `compose.local.yaml` | The same stack for a laptop: builds the images, publishes the site on `localhost:8080`, no edge network. Read only when named with `-f` |
| `.env.example`, `backend/.env.example`, `frontend/.env.example` | Templates for the three env files, each explaining every variable |

Plain `docker compose` reads only `compose.yaml` — and `compose.override.yaml`
if one exists, which Compose merges in silently. That second file is
git-ignored on purpose, so one can never reach the server and change what runs
there.

Both images are built from the **repository root**, because the backend's
dependencies are declared in the root `package.json`:

```bash
docker build -f backend/Dockerfile  -t journey-planner-backend  .
docker build -f frontend/Dockerfile -t journey-planner-frontend .
```

### The images

**Backend** — `node:22.23.3-slim`, production dependencies only, and the server
code. Deliberately **not** in it:

* **The compiled feed.** It is bind-mounted, read-only, at
  `/processed-data/<network>-processed-data`. Code and data change on different
  schedules, and a 475 MB layer would be re-uploaded for every one-line fix.
  That path sits at the filesystem root because `memoryCache.js` resolves the
  folder relative to its own location, `/app`.
* **Configuration and secrets.** Anyone who can pull an image can read its
  `ENV`, so `MONGO_URI`, `JWT_SECRET_KEY` and `ACTIVE_NETWORK` arrive when the
  container starts.

It runs as the image's unprivileged `node` user, and sets
`NODE_OPTIONS=--max-old-space-size=1024` so the heap ceiling is stated rather
than guessed from the machine — on a small server Node guesses below what this
feed needs, and the process is killed instead of collecting harder.

**Frontend** — two stages. The first runs `npm ci` and `vite build`; the
second is `caddy:2-alpine` with only the built `dist/` copied in. Node, the
TypeScript compiler and the frontend's `node_modules` stay in the first stage,
which is discarded.

The build reads `frontend/.env` and `frontend/.env.local` exactly as
`npm run build` does on your machine — `.dockerignore` keeps every other env
file out, and lets precisely those two through. Vite freezes their values into
the JavaScript during the build, so they can't be changed on a running
container: **the keys an image has are the keys in `frontend/.env.local` on
the machine that built it.** Build without that file and you get a working
image on the fallbacks — Photon for search, CARTO's anonymous tier for the
map.

The image's Caddyfile has three `handle` blocks, first match winning:

* `/api/*` → the backend, **prefix kept** — the backend mounts its routes at
  `/api/...`, so stripping it would 404 a perfectly good request.
* `/assets/*` → files only, no fallback. Everything there has a hashed name, so
  a request is either a real file or a mistake, and a mistake must 404. A
  fallback would answer a missing bundle with HTML, and the browser would
  report `Unexpected token '<'` — nowhere near the real fault.
* everything else → the file if it exists, otherwise `index.html`, so a refresh
  on `/favourites` reaches the client-side router.

Every response, the page's and the API's, also carries a set of security
headers from the same file: a Content-Security-Policy, `nosniff`, a referrer
policy, a permissions policy that allows location to this page only, and HSTS.
**The policy lists every outside host the client talks to** — CARTO's
`basemaps.cartocdn.com` and its tile subdomains, `photon.komoot.io`, and
`api.digitransit.fi` — and the browser blocks anything else. The dev server
sends none of these headers, so a new third-party service works under
`npm run dev` and fails silently in the container until its host is added to
`connect-src` (or `img-src`) there. Check it with the containers running
locally: a violation shows in the browser console as `Refused to connect`.

Its address is `{$SITE_ADDRESS::80}`. Unset, it serves plain HTTP on port 80,
which is what it does in production — TLS is the edge proxy's job, so neither
compose file passes the variable at all. For a deployment with no proxy in
front, give the frontend service `environment: { SITE_ADDRESS: <hostname> }`
and publish ports 80 and 443: the same image then gets its own certificate and
serves HTTPS. It must hold a real hostname, never an empty value. A blank turns
the Caddyfile's first line into a bare `{`, which Caddy reads as a
global-options block, and it fails with `unrecognized global option: root`.

### Published images

The server never builds: a Vite build is the heaviest thing in the project,
and the server's memory is shared with other applications. Images are built
elsewhere for **`linux/amd64`** — the server's architecture — and pushed to
GitHub's registry:

```
ghcr.io/sanadshannak/journey-planner-backend:<version>
ghcr.io/sanadshannak/journey-planner-frontend:<version>
```

`platform: linux/amd64` is written into both compose files, because a
development Mac is `arm64`. An image built for the wrong architecture fails
with an exec-format error that does not mention architecture. On an ARM
machine the build runs under emulation, which is slow, and so is running the
`amd64` images locally — neither says anything about speed on the server.

### Environment files

Each part reads **one file, the same one whether it runs under npm or
Docker** — so a value is never written down twice, and the two ways of running
it cannot disagree:

```
backend/.env        → npm run dev / npm start   (Node's --env-file-if-exists)
                    → the backend container      (compose: env_file)

frontend/.env       → npm run dev, npm run build, and the frontend image build
frontend/.env.local   (Vite reads both in every mode; the running container
                       needs nothing — the values are already in the JavaScript)

.env  (root)        → Docker Compose only: ACTIVE_NETWORK, used for the data
                      mount path AND passed to the backend container
```

`ACTIVE_NETWORK` lives in the root `.env` rather than `backend/.env` because
Compose needs it to *find the data folder* before any container exists, and a
container's env file can't be read for that. Keeping it in one place — passed
to the backend by `environment:`, which overrides anything in `backend/.env` —
means the folder that's mounted and the network the server thinks it's serving
can never disagree. Compose refuses to start if it's missing.

Every one has a committed `.env.example` beside it explaining every variable.
Two rules come from Docker reading `backend/.env` as well as Node:

* **No `$` in any value.** Compose substitutes `$NAME` inside env-file values,
  so `abc$xyz` reaches the container as `abc` — a different secret from the one
  Node reads. It still "works", just not as the value you wrote. Generate
  secrets with `openssl rand -hex 32`, which never produces one.
* **Inside a container, `127.0.0.1` is the container itself.** A `MONGO_URI`
  pointing at a local `mongod` works under npm and fails under Docker — use an
  Atlas URI there. And keep `PORT` at 3000: the Caddyfile forwards `/api` to
  that port.

### Running the containers locally

With the feed compiled and the three env files at the repository root:

```bash
docker compose -f compose.local.yaml up -d --build
docker compose -f compose.local.yaml ps          # backend healthy in ~10 s
```

Then open `http://localhost:8080`. The backend's healthcheck gates the
frontend, so a backend that cannot start keeps the site down rather than
serving a page that cannot answer.

### Releasing a new version

1. Bump the image tag in **both** compose files (`1.1` → `1.2`).
2. Make sure `frontend/.env.local` holds the keys the live site should have —
   they are compiled into the image from this machine.
3. Build and push, logged in to `ghcr.io` with a token that has
   `write:packages`:

   ```bash
   docker compose -f compose.local.yaml build
   docker compose -f compose.local.yaml push
   ```

4. On the server: `git pull`, then `docker compose pull && docker compose up -d`.

Push the images **before** pulling the new compose file on the server.
Otherwise it names a tag the registry doesn't have yet, and the pull fails.

Versioned tags rather than `latest` mean you can tell what is running, and
rolling back is a matter of naming the previous one.

### First deployment on a server

Everything below runs on the server, as a user that can run Docker.

```bash
# 1. Pull access for the images, if the packages are private
docker login ghcr.io                     # a token with read:packages

# 2. The code — beside the server's other apps
cd /opt && git clone https://github.com/SanadShannak/raptor-journey-planner.git journey-planner
cd journey-planner

# 3. The two env files the server needs (the frontend needs none at run time)
cp .env.example .env                       # set ACTIVE_NETWORK
cp backend/.env.example backend/.env       # set MONGO_URI (Atlas) and JWT_SECRET_KEY
chmod 600 backend/.env
```

**The compiled feed.** It is not in git, so it travels separately — about
475 MB, compressing to roughly 43 MB. On the machine that compiled it:

```bash
tar -czf hsl-data.tar.gz -C processed-data hsl-processed-data
scp hsl-data.tar.gz <user>@<server>:/tmp/
```

and on the server, from the repository directory:

```bash
mkdir -p processed-data
tar -xzf /tmp/hsl-data.tar.gz -C processed-data && rm /tmp/hsl-data.tar.gz
ls -l processed-data/hsl-processed-data    # world-readable: the container is not root
```

The two `-C` flags cancel out: the first stores the paths without the
`processed-data/` prefix, the second puts it back. Without them the data lands
in `processed-data/processed-data/…`, the mount finds an empty folder, and the
backend reports that a file "does not exist".

**Then:**

1. **Allow the server's IP in Atlas** (*Network Access*). Without it the
   backend exits on startup with a database error — and because it never
   becomes healthy, the frontend never starts either.
2. **Start it:** `docker compose pull && docker compose up -d`, then
   `docker compose ps`.
3. **Check it from where the edge proxy will see it**, before any DNS exists:

   ```bash
   docker run --rm --network othman_default curlimages/curl -s \
     -o /dev/null -w "%{http_code}\n" http://journey-planner-frontend/api/health
   ```

   `200` means the stack is right and only the public routing is left.
4. **Point the domain at the server** — `A` records for the bare name and for
   `www`, as *DNS only* if the provider offers proxying. Wait until
   `dig +short <domain>` returns the server's address.
5. **Add the site to the edge proxy's Caddyfile**, at the end, in its house
   style:

   ```
   journeyplanner.city {
       import security
       reverse_proxy journey-planner-frontend:80
   }

   www.journeyplanner.city {
       import security
       redir https://journeyplanner.city{uri} permanent
   }
   ```

   Then validate and **reload** — never restart — the edge Caddy, so the other
   sites keep serving and a broken config is refused rather than applied:

   ```bash
   docker exec <edge-caddy> caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec <edge-caddy> caddy reload   --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

The order of the last two matters. Caddy proves it controls a name by
answering Let's Encrypt on port 80 *at that name*; add the site before DNS
points at the server and the challenge fails, and Caddy backs off before
retrying.

To view the server's stack before DNS exists, tunnel to the frontend
container's address — `docker inspect` gives it — with
`ssh -L 8080:<container-ip>:80 <user>@<server>`, and open
`http://localhost:8080`.

### Memory

| | Limit | Measured |
| --- | --- | --- |
| Backend container | 1400 MB | ~850–1000 MB resident |
| — of which the V8 heap | 1024 MB ceiling (`NODE_OPTIONS`) | ~780 MB for the full HSL feed |
| Frontend container | 128 MB | ~15–70 MB |

**The container limit must sit above the heap ceiling.** Resident memory is
the heap *plus* everything the runtime holds around it; set the two equal and
the kernel kills the process while V8 still believes it has room — a silent
restart under load, with nothing useful in the logs.

### Operating it

* **Logs:** `docker compose logs -f backend` (or `frontend`). Each container
  keeps at most three 10 MB files, so logs cannot fill the disk.
* **Refreshing the timetable.** Feeds expire. `feedEndDate` in
  `network-meta.processed.json` is the last day covered (the last date
  `/api/valid-dates` returns says the same); after it, the planner has no
  service days to offer. To refresh: download the new GTFS, run the pipeline
  wherever it was compiled, ship the folder as above, and
  `docker compose restart backend`. No image rebuild — the data is mounted.
* **Resetting accounts:** `npm run resetdb` in `backend/` drops the whole
  database `MONGO_URI` names. It prints the host first; read it.
* **No rate limiting yet.** The feed endpoints are public by design, and
  `/api/planner` runs the engine on every request. Abuse would cost CPU rather
  than leak anything, but on a shared server it would slow the neighbours too.
* **`docker compose down` on the edge proxy's stack** removes `othman_default`,
  and this stack cannot start until it exists again — it is declared
  `external`, so Compose attaches to it rather than creating a second one with
  nothing on it.

---

## Switching networks

One token, `ACTIVE_NETWORK`, selects the network, and the pipeline derives
every input and output path from it. But a city is more than its timetable: the
backend and the client each need a few facts that no GTFS feed contains, and a
deployed server needs the compiled data shipped to it. Every one is below, in
the order you meet them, with what happens if you skip it.

The **network id** (`hsl`, `amman`, …) is the key to all of it. It names the
raw and compiled folders, `/api/network` reports it, and every per-city table
below is keyed by it. Use something short and lowercase, and the same spelling
everywhere.

### 1. Get a feed the pipeline will accept

Unzip the GTFS into `raw-data/<network>-gtfs-data/`. The validator in
`pipelineConfig.js` rejects a feed at the start of the run if any of these is
missing, or lacks its required columns:

`stops.txt` · `routes.txt` · `trips*.txt` (several trip files are allowed) ·
`stop_times.txt` · `calendar.txt` · `calendar_dates.txt`

**Both calendar files are required, and many real feeds ship only one.** If
yours does, add the missing file containing only its header row. That gives
the pipeline an empty table to read, with no change to the service days.

Everything else is optional, and the pipeline works out which of it the feed
actually supplied. Here is what you lose without each:

| Missing | Effect |
| --- | --- |
| `agency.txt` | No timezone from the feed. The backend falls back to its own table (step 3), then to **UTC** — which shifts every time on every page |
| `shapes.txt`, or `shape_id` on trips | Rides are drawn as straight lines between stops |
| `feed_info.txt` | No validity window in `network-meta`, so nothing records when the timetable expires |
| `shape_dist_traveled` | `transitDistanceMeters` is `null` on every ride |
| `trip_headsign` | No per-trip destination signs; departure boards fall back to the route's |
| stop codes, platforms, fare zones, wheelchair data | Each one simply isn't shown. The client asks `network-meta`'s `available` flags rather than assuming |

**Route types.** The extended three- and four-digit codes are mapped down to
the basic set — `700`–`799` to bus, `900`–`999` to tram, and so on — and
**anything unrecognised becomes a bus**, including trolleybus (`11`) and
monorail (`12`). If a city runs those, check that its lines show the icons you
expect.

### 2. Compile it

1. Set `ACTIVE_NETWORK` in `offline-data-ingestion-pipeline/pipelineConfig.js`.
2. `cd offline-data-ingestion-pipeline && node runPipeline.js`. The output
   lands in `processed-data/<network>-processed-data/`.
3. Read `network-meta.processed.json`. `timezone` should be the city's own,
   `feedEndDate` says when the timetable runs out, and `available` lists what
   the feed supplied.
4. **Check the memory before deploying a bigger city.** The limits in
   `compose.yaml` were sized for HSL: about 780 MB of heap against a 1024 MB
   ceiling. Another feed can be much larger — Sydney's compiled folder is
   1.2 GB on disk to Helsinki's 475 MB. Measure it rather than guess:

   ```bash
   cd backend && node -e 'require("./memoryCache.js"); console.log(Math.round(process.memoryUsage().heapUsed / 1048576) + " MB")'
   ```

   If that exceeds about 900 MB, raise `NODE_OPTIONS` in
   `backend/Dockerfile` and the container limit in both compose files, and
   keep the container limit the larger of the two (see [Memory](#memory)).

### 3. The backend

| What | Where | Without it |
| --- | --- | --- |
| Which network | `ACTIVE_NETWORK` | **With npm:** nothing to do — the server falls back to `pipelineConfig.js`. If you set it in `backend/.env`, it overrides the file and must be changed too. **In Docker:** the root `.env`, the only place it is read |
| Currency | `NETWORK_CURRENCIES` in `backend/src/utils/networkCurrency.js` — an ISO 4217 code such as `JOD` | The pipeline doesn't compile a feed's fare currency yet, so this table is the only source. Card balances print with no currency rather than a wrong one |
| Timezone fallback | `NETWORK_TIMEZONES` in `backend/src/serverConfig.js` — an IANA zone such as `Asia/Amman` | Only matters for a feed with no `agency.txt`. The feed's own zone always wins; with neither, UTC |

### 4. The client

The client asks `/api/network` which city it is serving when it loads, then
reads its own tables by that id. Each table has a fallback, so a missing entry
degrades the page rather than breaking it, but some of those fallbacks are
poor:

| What | Where | Without an entry |
| --- | --- | --- |
| Search bounds | `BOUNDS` in `frontend/src/config/geocoding.ts` | Place search is unbiased — results from anywhere in the world. Maps also lose their fallback centre |
| Where the maps open | `HOME` in `frontend/src/map/homeView.ts` | The map opens on the centre of the search bounds at a wider zoom. **With no bounds either, it opens over Helsinki** |
| Basemap | `SOURCES` in `frontend/src/map/tileSource.ts` | CARTO, which covers everywhere. Only add an entry if the city has better cartography of its own |

One thing every city sees for a moment: the very first map paint happens
before `/api/network` has answered, so it starts at Helsinki and then moves.

#### Place search (the geocoder)

**The geocoder is chosen by whether a Digitransit key is set, not by which
network is loaded** (`frontend/src/geocoding/index.ts`). Digitransit only knows
Finland. So:

* **For any city outside Finland, remove `VITE_DIGITRANSIT_SUBSCRIPTION_KEY`**
  from `frontend/.env.local`, and rebuild the frontend image — keys are
  compiled in at build time. With the key still set, place search quietly
  looks in Finland.
* **Without a city-specific geocoder, the app uses Photon.** It's built on
  OpenStreetMap, needs no key and covers the world, so addresses and named
  places are found anywhere. What you lose is stop suggestions: Photon knows
  places, not the feed's stops, so it can never return a stop id. The bounds
  in `BOUNDS` are what keep its results in the right country.
* **If a city has a geocoder of its own** (the way Digitransit knows HSL's
  stops), add an adapter. Implement the `Geocoder` interface from
  `frontend/src/types/place.ts` in a new file under `frontend/src/geocoding/`,
  using `digitransit.ts` as the worked example, and select it in
  `frontend/src/geocoding/index.ts`. Three rules carry over: return the
  feed's own stop id, without any namespace or `#platform` suffix; drop a mode
  you don't recognise rather than defaulting it; and never send the visitor's
  position as a search bias.

Making the choice follow the network rather than the key is a sensible
improvement. Until then, the key is the switch.

### 5. Deploy it

1. Ship `processed-data/<network>-processed-data/` to the server as in
   [First deployment](#first-deployment-on-a-server) — the `tar -C` pair
   applies unchanged, with the new folder name.
2. Set `ACTIVE_NETWORK` in the server's root `.env`.
3. `docker compose up -d`.

**Whether anything needs rebuilding** depends on what changed:

| You changed | Rebuild |
| --- | --- |
| Only the data and `ACTIVE_NETWORK`, for a city whose entries already exist | Nothing. The backend image holds no data, and the client reads the city from `/api/network` at runtime |
| Entries in the backend tables | The backend image |
| Entries in the client tables, or a new geocoder | The frontend image |
| `frontend/.env.local` (adding or removing a key) | The frontend image — keys are compiled in |
| Memory limits | The backend image if `NODE_OPTIONS` changed; otherwise just `docker compose up -d` |

Release rebuilt images as in [Releasing a new version](#releasing-a-new-version).
Neither the edge proxy nor DNS changes unless the domain does.

### The whole list

- [ ] Feed unzipped to `raw-data/<network>-gtfs-data/`; both calendar files present
- [ ] `ACTIVE_NETWORK` in `pipelineConfig.js`; pipeline run; `network-meta` checked (timezone, `feedEndDate`)
- [ ] Heap measured; memory limits raised if needed
- [ ] Currency in `NETWORK_CURRENCIES`
- [ ] Timezone in `NETWORK_TIMEZONES` *(only if no `agency.txt`)*
- [ ] Bounds in `frontend/src/config/geocoding.ts`
- [ ] Home view in `frontend/src/map/homeView.ts`
- [ ] Basemap in `frontend/src/map/tileSource.ts` *(optional)*
- [ ] Digitransit key removed for a non-Finnish city, or a new geocoder added
- [ ] Images rebuilt and released, if any of the above changed code or keys
- [ ] Data shipped, root `.env` updated, `docker compose up -d`

A few notes on the home view, because it is the easiest to get wrong. The
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

The client's dependency footprint is deliberately small, and no paid service is
required. The server needs a MongoDB database — a free Atlas cluster is
enough — and two browser keys are optional and improve the client.

| Service | Used for | Key | Without it |
| --- | --- | --- | --- |
| **Photon** | Place search | none | — the default, and works everywhere |
| **Digitransit** | Place search that knows HSL's own stops | `VITE_DIGITRANSIT_SUBSCRIPTION_KEY` | Falls back to Photon: you lose stop suggestions, not search |
| **CARTO** | Vector basemap tiles | `VITE_CARTO_API_KEY` | Tiles still load, on an anonymous tier that has grown unreliable |
| **MongoDB** | Accounts, saved stops/lines/journeys, travel cards | `MONGO_URI` | **Required** — the server exits at startup without a connection |

Each of the outside hosts above is named in the Content-Security-Policy in
`frontend/Caddyfile`; adding a service means adding its host there too (see
*The images*).

Two things worth knowing about the keys:

* **Both browser keys are public by design.** They ship in the bundle, are
  issued for exactly that use, and are rate-limited per key rather than kept
  secret. The consequence is that the quota belongs to whoever deploys this.
* **CARTO reads its key as `key`, not `api_key`.** Sending the wrong name is
  not an error — the CDN answers `200` either way and quietly serves an
  "API KEY REQUIRED" watermark over real cartography, with nothing in the
  console to say why.

### Environment variables

**Backend** — `backend/.env`, under npm and Docker alike. Template:
`backend/.env.example`.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `MONGO_URI` | **Yes** | `mongodb://127.0.0.1:27017/journey_planner_db` | The server exits if it cannot connect. A local `mongod` isn't reachable from inside a container |
| `JWT_SECRET_KEY` | **Yes** | — | Signs the session cookie. Every login fails without it; changing it signs everyone out |
| `JWT_EXPIRES_IN` | No | `30d` | How long a session token is valid |
| `PORT` | No | `3000` | Keep it 3000 under Docker — the Caddyfile forwards there |
| `LOG_LEVEL` | No | `info` | `debug` adds per-calculation timings; `warn` keeps only problems. JSON lines under `NODE_ENV=production`, readable lines otherwise |
| `ARCJET_KEY` | No | — | Arcjet guards login, sign-up and password checks (attacks, bots, ten attempts a minute per address). Without a key the checks fail open: allowed, and a warning logged |
| `ARCJET_MODE` | No | `LIVE` | `DRY_RUN` logs what Arcjet would refuse without refusing it |
| `ARCJET_ENV` | No | — | `development` locally, so Arcjet accepts `127.0.0.1`. Never in production |
| `ACTIVE_NETWORK` | No | `pipelineConfig.js` | Under npm, an override for the pipeline's value. Under Docker it comes from the root `.env` and wins |

**Client** — `frontend/.env` (committed) and `frontend/.env.local` (yours).
Template: `frontend/.env.example`. All four are compiled into the JavaScript
at build time.

| Variable | File | Required | Notes |
| --- | --- | --- | --- |
| `VITE_API_BASE_URL` | `frontend/.env` | **Yes** — the app throws at startup without it | Keep it `/`; see [Start the web client](#4-start-the-web-client) |
| `VITE_DEV_API_PROXY` | `frontend/.env` | Dev server only | Where Vite forwards `/api`. Defaults to `http://localhost:3000` |
| `VITE_DIGITRANSIT_SUBSCRIPTION_KEY` | `frontend/.env.local` | No | Finland only — remove it for any other network |
| `VITE_CARTO_API_KEY` | `frontend/.env.local` | No | |

**Docker Compose** — the root `.env`. Template: `.env.example`.

| Variable | Required | Notes |
| --- | --- | --- |
| `ACTIVE_NETWORK` | **Yes** | Names the data folder to mount and is passed to the backend. Compose refuses to start without it |

`SITE_ADDRESS` is the one remaining variable, read by the frontend container's
Caddy. Production doesn't set it; see [The images](#the-images).

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