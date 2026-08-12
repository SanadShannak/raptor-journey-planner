# RAPTOR Journey Planner Engine

## Core System Architecture Overview

Public transit engines process massive datasets containing millions of weekly scheduled trips. Running a routing engine directly against raw schedule files or a standard database produces unacceptably high latency.

To overcome this, this project is divided into two decoupled, distinct architectures:

1. **The Offline Data Pipeline:** A sequence of ingestion compilers that read heavy, relational, text-based GTFS data and compact them into zero-indexed, contiguous memory buffers saved as highly readable `.json` files.
2. **The Online Routing Server:** An ultra-fast, multi-modal routing environment that loads pre-compiled JSON memory blocks into RAM cache to execute RAPTOR range queries in sub-50ms runtimes.

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

### Component 6: Footpath Generator (`generateFootpaths.js`)
#### Objective
Compiles a complete pedestrian transfer matrix (`footpaths.processed.json`) that bridges nearby transit stops.
#### Logic Metrics
1. **Spatial Filter & Spatial Grid Acceleration (`spatialGrid.js`)**: Utilizes a high-performance spatial partitioning grid (`spatialGrid.js`) to bucket transit stops spatially, drastically reducing candidate search pairs and dropping any destination pair with a physical distance greater than a **1,000-meter** radius.
2. **Self-Transfer Rule & Bilateral Station Access Penalties**: Injects a reflexive transfer edge from every stop to itself with a distance of `0` meters. For stations servicing **metro, railway, or ferry (`route_type` 1, 2, or 4)**, a **120-second station access penalty** is embedded into the transfer logic per interaction—assessing 120 seconds for station entry, 120 seconds for station exit, and a cumulative **240 seconds** when both entry and exit thresholds are crossed.
---

### Component 7: Spatial Grid Generator (`generateSpatialGrid.js`)
#### Objective
Ingests the processed flat stops array (`stops.processed.json`) and maps every physical stop into a high-performance geographic spatial grid (`spatial-grid.processed.json`).
#### Logic Metrics
1. **Grid Partitioning**: Divides coordinates into discrete square boxes using a fine resolution constant (`GRID_SIZE_DEGREES = 0.005`, roughly 500 meters per cell).
2. **Hash Indexing**: Generates unique string keys (`latIndex_lonIndex`) to group nearby stops, enabling $O(1)$ spatial lookups during coordinate-to-stop routing queries without exhaustive pairwise scans.

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
Exposes the RAPTOR engine to client applications via a RESTful HTTP endpoint, handling request validation, performance tracking, and payload formatting.
#### Operational Logic
1. **Synchronous Memory Bootstrapping**: Leverages Node's synchronous `require()` behavior to load all massive GTFS JSON data into the V8 memory heap *before* opening the port to accept traffic.
2. **Input Validation**: Uses utility validators to strictly enforce date formats (`YYYY-MM-DD`), time formats (`HH:MM:SS`), and optional walking speed constraints.
3. **Performance Telemetry**: Utilizes `performance.now()` to track and log exact execution times for every route calculated.
4. **Error Propagation**: Catches RAPTOR's internal engine error codes (e.g., `NO_ROUTE_FOUND`, `OUT_OF_BOUNDS`) and maps them to appropriate HTTP status codes (400, 404, 500) so the frontend can display helpful UI states.
5. **Presenter Pattern (`formatItinerary.js`)**: Once the engine completes execution, the raw timeline arrays are passed through a formatter to translate raw engine seconds into human-readable strings (e.g., `18:02`, `14 min`) and attach overarching itinerary metrics.

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

### 1. Configure the Target Transit Network

The project supports multiple GTFS datasets through the centralized configuration registry.

1. Place the unzipped GTFS dataset inside the `raw-data/` directory.
2. Name the folder using the convention `<network>-gtfs-data` (for example, `amman-gtfs-data` or `hsl-gtfs-data`).
3. Open `pipelineConfig.js`.
4. Set the `ACTIVE_NETWORK` property to the desired network (e.g., `"amman"` or `"hsl"`).

---

### 2. Build the Optimized Data Structures

Run the offline preprocessing pipeline:

```bash
node runPipeline.js
```

This executes the complete ingestion pipeline, validates the GTFS feed, and generates all optimized JSON structures required by the routing engine.

---

### 3. Execute the RAPTOR Engine

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

To ensure absolute data integrity and strictly decouple mathematical logic from frontend presentation (the Presenter Pattern), all durations, start times, end times, and target arrival times are output as **raw integer seconds from absolute engine midnight**.

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

This payload is then formatted by the API layer itinerary formatter to present the data nicely to the frontend:
```json
{
  "startTime": "18:02",
  "endTime": "19:06",
  "totalDurationMinutes": 64,
  "legs": [
    {
      "mode": "WALK",
      "waitDurationMinutes": 0,
      "startTime": "18:02",
      "fromStop": {
        "name": "ORIGIN",
        "code": "ORIGIN_PIN",
        "lat": 60.2050763376478,
        "lon": 24.962304855336
      },
      "routeShortName": null,
      "routeType": null,
      "intermediateStops": null,
      "toStop": {
        "name": "Kumpulan kampus",
        "code": "H0326",
        "lat": 60.203071,
        "lon": 24.965821
      },
      "endTime": "18:08",
      "tripId": null,
      "transitDurationMinutes": null,
      "transitDistanceMeters": null,
      "walkDurationMinutes": 5,
      "walkDistanceMeters": 350,
      "shape": [
        [60.2050763376478, 24.962304855336],
        [60.203071, 24.965821]
      ]
    },
    {
      "mode": "TRANSIT",
      "waitDurationMinutes": 0,
      "startTime": "18:08",
      "fromStop": {
        "name": "Kumpulan kampus",
        "code": "H0326",
        "lat": 60.203071,
        "lon": 24.965821
      },
      "routeShortName": "6",
      "routeType": 0,
      "intermediateStops": [
        {
          "stopName": "Paavalinkirkko",
          "stopCode": "H0330",
          "stopArrivalTime": "18:10"
        }
      ],
      "toStop": {
        "name": "Kaisaniemenkatu",
        "code": "H0304",
        "lat": 60.17163,
        "lon": 24.94737
      },
      "endTime": "18:24",
      "tripId": "1006_20260831_Su_2_1805",
      "transitDurationMinutes": 16,
      "transitDistanceMeters": 3950,
      "walkDurationMinutes": 0,
      "walkDistanceMeters": null,
      "shape": [
        [60.203071, 24.965821],
        [60.203072, 24.965429],
        [60.17163, 24.94737]
      ]
    }
  ]
}
```

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