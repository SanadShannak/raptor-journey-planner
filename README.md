# RAPTOR Journey Planner Engine

## 🏗️ Core System Architecture Overview

Public transit engines process massive datasets containing millions of weekly scheduled trips. Running a routing engine directly against raw schedule files or a standard database produces unacceptably high latency. 

To overcome this, this project is divided into two decoupled, distinct architectures:

1. **The Offline Data Pipeline (Current Phase):** A sequence of ingestion compilers that read heavy, relational, text-based GTFS data and compact them into zero-indexed, contiguous memory buffers saved as highly readable `.json` files.
2. **The Online Routing Server (Future Phase):** (to be added)

---

## 🛠️ The Ingestion Registry (`pipelineConfig.js`)

To prevent hardcoding folder names inside individual parser scripts, we use a central configuration file. This allows us to scale the project easily and switch between different city networks with a single string swap.

### Operational Rules
1. **Network Independence:** To switch the target data from Helsinki (`hsl`) to Amman (`amman`), change the `ACTIVE_NETWORK` property. All parsers automatically adjust their input and output paths based on this single token.
2. **Structural Manifest:** The configuration explicitly lists mandatory file types and data attributes required to ensure the parsing chain never ingests incomplete data.

---

## 📦 Component Documentation

### Component 1: Stop Parser (`parseStops.js`)

#### Objective
Converts sparse, text-heavy GTFS `stops.txt` datasets into highly compacted, zero-indexed, contiguous memory buffers mapped to execution-ready arrays for performance scaling.

#### Ingestion Rules
1. **File Dependencies:** The input directory matching the active network must contain a valid `stops.txt` dataset.
2. **Field Requirements:** The dataset schema *must* feature at minimum the following headers:
   * `stop_id`: Relational system identifier.
   * `stop_name`: Verbal text descriptive label.
   * `stop_lat`: Coordinate dimension.
   * `stop_lon`: Coordinate dimension.
3. **Memory Layout Transformation:** * **`stops.processed.json`**: An array where a stop's index position (`0, 1, 2...`) serves as its brand-new internal ID. Heavy metadata fields are stripped entirely to save RAM cache space.
   * **`stop-mapping.json`**: A temporary translator file that maps the original GTFS string ID to our new internal integer ID. This is used by subsequent parsers to convert relational records downstream.

#### Swapping Transit Networks
To toggle between local datasets (e.g., Helsinki vs. Amman):
1. Place your target GTFS (unzipped) folder inside the "raw_data" folder with exactly the following name format: "amman-gtfs-data". Make sure it contains all the data required (as stated in the "pipeline.config")
2. Open `pipelineConfig.js` in the project root.
3. Update `ACTIVE_NETWORK` attribute to `'amman'`.

### Component 2: Route Builder (`parseRoutes.js`)

#### Objective
Aggregates individual scheduled journeys by extracting their physical stop sequences from `stop_times.txt`. This script groups commercial transit variants into mathematically strict, sequence-locked RAPTOR routes traveling in a single direction.

#### Ingestion Rules
1. **File Dependencies:** Requires a valid `routes.txt`, `stop_times.txt`, and dynamic trip source files matching the pattern `trips*.txt`. It also directly reads the pre-compiled translation manifest `stop-mapping.json`.
2. **BOM Header Remediation:** The reader includes an active global stream interceptor (`mapHeaders`) to strip invisible UTF-8 Byte Order Mark characters (`\uFEFF`) natively present in the dataset headers.
3. **Route Signatures:** Stop sequences are serialized into string keys (`stop1-stop2-stop3`). Trips sharing identical signatures are coalesced into a single structural route block containing arrays of valid trip references.