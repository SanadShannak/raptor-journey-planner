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

### Component 5: Footpath Generator (`generateFootpaths.js`)

#### Objective
Compiles a complete pedestrian transfer matrix (`footpaths.processed.json`) that bridges nearby transit stops.

#### Logic Metrics
1. **Spatial Filter**: Drops any destination pair with a physical distance greater than a **1,000-meter** radius.
2. **Self-Transfer Rule**: Injects a reflexive transfer edge from every stop to itself with a distance of `0` meters.

---

### Component 6: Stop-to-Route Indexer (`parseStopToRoutes.js`)

#### Objective
Compiles an inverted relational index matrix that maps every stop to the routes servicing it.

#### Design
Binds dictionary lookup keys directly to sequential zero-indexed integer array positions, ensuring that the engine can instantly resolve associated routes without string comparisons.

---

### Component 7: RAPTOR Routing Engine (`raptorEngine.js`)

#### Objective
The core online algorithm that consumes pre-compiled transit arrays to answer travel queries, now fully equipped with path reconstruction and strict entry safety checks.

#### Operational Logic
1. **Engine Circuit Breakers**: Implements immediate short-circuits for identical source/target queries ($O(1)$ exit) and safeguards against isolated (orphan) stops gracefully.
2. **Initialization**: Pre-allocates native 2D arrays to hold arrival times across `MAX_ROUNDS`, utilizing `Infinity` to signify unvisited nodes.
3. **Stage 1 (Route Accumulation)**: Identifies all active routes that pass through reachable stops in $O(1)$ time.
4. **Stage 2 (Route Scanning)**: Executes an $O(\log N)$ binary search to retrieve the earliest possible transit trip, scanning stop-by-stop while pruning dominated paths. Tracks parent routes, trips, and boarding stops for path reconstruction.
5. **Stage 3 (Footpath Processing)**: Processes pedestrian transfers between stops, enforcing strict pruning to ensure only time-optimal paths are tracked.
6. **Path Reconstruction**: Backtracks through parent pointer matrices to construct an ordered, turn-by-turn itinerary. Utilizes Just-In-Time (JIT) walking logic and exact timetable departures to calculate flawless temporal gaps.
---

## Shared Utility Core: Haversine Spatial Calculator (`utils/calculateHaversine.js`)

#### Objective
Provides a zero-dependency mathematical helper to calculate the exact great-circle distance between two geographic coordinates.

#### Design Optimization
1. **Memory Allocation Defenses**: Eliminates heap-allocation churn by performing calculations using direct primitives, blocking the Garbage Collector from triggering stutters.
2. **Geometric Integrity**: Uses pure spherical trigonometry, ensuring precision for both high-latitude and equatorial networks.

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
    sourceStop,      // Original GTFS stop_id
    targetStop,      // Original GTFS stop_id
    queryDate,       // "YYYY-MM-DD"
    departureTime    // "HH:MM:SS"
);
```

#### Parameters

| Parameter | Description |
|-----------|-------------|
| `sourceStop` | Original GTFS `stop_id` of the departure stop |
| `targetStop` | Original GTFS `stop_id` of the destination stop |
| `queryDate` | Date of travel in `YYYY-MM-DD` format |
| `departureTime` | Desired departure time in `HH:MM:SS` format |
| `WALKING_SPEED_MPS` (optional) | Average human walking pace (meters/sec)|

---

### Output

The engine executes the RAPTOR routing algorithm over the preprocessed transit network and returns the earliest reachable arrival time at the specified destination. During execution, the engine automatically:

- Resolves the transit services active on the query date.
- Selects the earliest valid trip for each scanned route using binary search.
- Processes pedestrian transfers between nearby stops.
- Applies RAPTOR pruning rules to eliminate dominated journeys while preserving correctness.
- Reconstructs the selected path

Instead of returning a single primitive time, the engine returns a deeply nested `ItineraryDetails` object representing the mathematically optimal journey. 

To ensure absolute data integrity and strictly decouple mathematical logic from frontend presentation (the Presenter Pattern), all durations and internal transit events are output as **raw integer seconds**.

```json
{
  "targetArrivalTime": "22:18",
  "legs": [
    {
      "waitDurationSeconds": 0,
      "startTime": 79800,
      "fromStopCode": "H0614",
      "routeShortName": "2",
      "toStopCode": "H0639",
      "endTime": 79860,
      "mode": "TRANSIT",
      "tripId": "1002_20260831_Su_2_2220",
      "walkDurationSeconds": null
    },
    {
      "waitDurationSeconds": 300,
      "startTime": 80160,
      "fromStopCode": "H0639",
      "routeShortName": null,
      "toStopCode": "H1919",
      "endTime": 80400,
      "mode": "WALK",
      "tripId": null,
      "walkDurationSeconds": 240
    }
  ]
}
```