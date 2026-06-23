# RAPTOR Journey Planner Engine

## 🏗️ Core System Architecture Overview

Public transit engines process massive datasets containing millions of weekly scheduled trips. Running a routing engine directly against raw schedule files or a standard database produces unacceptably high latency. 

To overcome this, this project is divided into two decoupled, distinct architectures:

1. **The Offline Data Pipeline (Current Phase):** A sequence of ingestion compilers that read heavy, relational, text-based GTFS data and compact them into zero-indexed, contiguous memory buffers saved as highly readable `.json` files.
2. **The Online Routing Server (Future Phase):** An ultra-fast, multi-modal routing environment that loads pre-compiled JSON memory blocks into RAM cache to execute RAPTOR range queries in sub-50ms runtimes.

---

## ⚙️ The Pipeline Configuration Registry (`pipelineConfig.js`)

To prevent hardcoding folder names inside individual parser scripts, we use a central configuration file. This allows us to scale the project easily and switch between different city networks with a single string swap.

### Structural Manifest Rules
1. **Network Independence:** To switch the target data from Helsinki (`hsl`) to Amman (`amman`), change the `ACTIVE_NETWORK` property. All parsers automatically adjust their input and output paths based on this single token.
2. **Pipeline Integrity Controls:** The configuration features a strict `rules` schema validator containing arrays of `requiredFiles` and column headers (`requiredStopHeaders`, `requiredRouteHeaders`, etc.) ensuring incomplete or structurally corrupt datasets are rejected at the stream boundary.

---

## 📦 Component Documentation

### Component 1: Stop Parser (`parseStops.js`)

#### Objective
Converts sparse, text-heavy GTFS `stops.txt` datasets into highly compacted, zero-indexed, contiguous memory buffers mapped to execution-ready arrays for performance scaling.

#### Ingestion Rules
1. **File Dependencies:** The input directory matching the active network must contain a valid `stops.txt` dataset.
2. **Field Requirements:** The dataset schema *must* feature at minimum the configuration's `requiredStopHeaders`:
   * `stop_id`: Relational system identifier.
   * `stop_name`: Verbal text descriptive label.
   * `stop_lat`: Coordinate dimension.
   * `stop_lon`: Coordinate dimension.
3. **Memory Layout Transformation:** * **`stops.processed.json`**: An array where a stop's index position (`0, 1, 2...`) serves as its brand-new internal ID. Heavy metadata fields are stripped entirely to save RAM cache space.
   * **`stop-mapping.json`**: A temporary translator file that maps the original GTFS string ID to our new internal integer ID. This is used by subsequent parsers to convert relational records downstream.

---

### Component 2: Route Builder (`parseRoutes.js`)

#### Objective
Aggregates individual scheduled journeys by extracting their physical stop sequences from `stop_times.txt`. This script groups commercial transit variants into mathematically strict, sequence-locked RAPTOR routes traveling in a single direction.

#### Ingestion Rules
1. **File Dependencies:** Requires a valid `routes.txt`, `stop_times.txt`, and dynamic trip source files matching the pattern `trips*.txt`. It also directly reads the pre-compiled translation manifest `stop-mapping.json`.
2. **Field Requirements:** The parsing parser validates rows against the configuration's strict `requiredRouteHeaders` (`route_id`, `route_short_name`) and `requiredTripHeaders` (`route_id`, `trip_id`).
3. **Header Sanitization Layer:** Intercepts incoming data streams with a global `mapHeaders` filter to strip hidden Byte Order Marks (BOM) or leading non-alphanumeric artifacts before keys map to internal memory loops.
4. **Route Signatures:** Stop sequences are serialized into string keys (`stop1-stop2-stop3`). Trips sharing identical signatures are coalesced into a single structural route block containing arrays of valid trip references.

---

### Component 3: Timetable Compiler (`parseTimetables.js`)

#### Objective
Ingests and transforms raw calendar schedules from `stop_times.txt` into a high-performance, memory-optimized temporal lookup matrix for the live RAPTOR engine.

#### Ingestion Rules
1. **File Dependencies:** Streams the network's `stop_times.txt` file and handles ingestion routing dynamically via the pipeline configuration context.
2. **Field Requirements:** Enforces the structural validation of incoming data rows against the registry's strict `requiredStopTimesHeaders` array (`trip_id`, `stop_id`, `arrival_time`, `departure_time`).
3. **Header Sanitization Layer:** Employs a regular-expression-driven global stream interceptor (`mapHeaders: ({ header }) => header.replace(/^\W+/, "").trim()`) to strip out structural byte order marks (BOM) and non-alphanumeric artifacts that cause key mismatch regressions at the source.
4. **Temporal Serialization:** Converts standard human-readable `HH:MM:SS` text timestamps into highly compressed base-10 integers representing **Seconds From Midnight**.
5. **Memory Layout and Optimization:** To bypass JavaScript string-allocation length constraints (`RangeError: Invalid string length`), data is grouped into a direct Key-Value Hash Map (`{ trip_id: [{ arrival, departure }] }`) and written to disk as minified JSON. This architecture ensures $O(1)$ lookup complexity for the live routing server.

---

## 🗺️ Operational Workflows

### Swapping Transit Networks
To toggle between local datasets (e.g., Helsinki vs. Amman):
1. Place your target GTFS (unzipped) folder inside the `raw-data/` folder matching exactly the following name format: `amman-gtfs-data`. Ensure it contains all necessary text files specified in your pipeline configuration.
2. Open `pipelineConfig.js` in the project root.
3. Update the `ACTIVE_NETWORK` attribute to `'amman'`.