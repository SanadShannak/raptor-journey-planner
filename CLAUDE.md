# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository boundaries

Three decoupled parts live in one repo:

| Directory | What it is | Language |
| --- | --- | --- |
| `offline-data-ingestion-pipeline/` | Compiles raw GTFS text feeds into indexed JSON | CommonJS Node |
| `backend/` | Express server + RAPTOR routing engine, reads the compiled JSON | CommonJS Node |
| `frontend/` | Journey-planning web client | React + TypeScript + Vite |

**Do not modify anything outside `frontend/` without explicit permission.** The pipeline and backend are working, tuned code; treat them as read-only reference. Reading them to understand the API contract is expected and encouraged.

Work on a `claude/<topic>` branch off `main`, never directly on `main`.

## Commands

Dependencies for the pipeline and backend live in the **root** `node_modules` (root `package.json` holds `express`, `cors`, `csv-parser`); `backend/package.json` carries scripts only.

```sh
npm install                                    # root — pipeline + backend deps

cd backend && npm run dev                      # server on :3000 (node --watch)
cd backend && npm start                        # server without watch

cd offline-data-ingestion-pipeline && node runPipeline.js   # rebuild processed-data/

cd frontend && npm install
cd frontend && npm run dev                     # Vite dev server
cd frontend && npm run build                   # tsc -b && vite build
cd frontend && npm run lint                    # oxlint
```

There is no test suite anywhere in the repo — `npm test` is an unimplemented stub in both `package.json` files. Verify changes by running the app.

The backend port (`3000`) is hardcoded in `backend/index.js`.

## Architecture

### Network selection drives every path

`offline-data-ingestion-pipeline/pipelineConfig.js` exports `ACTIVE_NETWORK` (currently `"hsl"`). That single string derives `raw-data/<network>-gtfs-data/` and `processed-data/<network>-processed-data/` throughout both the pipeline and the backend. Switching cities is a one-token change; never hardcode a network folder name.

`pipelineConfig.rules` is also the ingestion schema validator — required GTFS files and column headers are rejected at the stream boundary if missing.

### Offline pipeline → processed JSON → in-memory server

`runPipeline.js` runs eight parsers **in order** as synchronous child processes; later components consume earlier ones' output (spatial grid feeds the footpath generator, stops feed the grid, and so on). Reordering them breaks the build.

The parsers compact relational GTFS text into zero-indexed contiguous arrays: a stop's *array index* is its internal integer ID, and `*-mapping.json` files translate original GTFS string IDs back to those integers. Times are stored as seconds-from-midnight integers, not strings.

`backend/memoryCache.js` loads every `processed-data/` file synchronously at require time, so the whole network is in the V8 heap before the port opens. Startup is slow; requests are not.

### Request path

`backend/index.js` (validate query) → `raptor-engines/raptorEngine.js` (route, in seconds-from-midnight) → `backend/utils/formatItinerary.js` (presenter: seconds → `HH:mm`, rounding) → JSON.

`formatItinerary.js` is the definitive source for the response shape the frontend consumes — read it rather than guessing at fields. Two rounding behaviours from `utils/`: durations round to whole minutes with a floor of 1 (`formatDuration`), distances round to the nearest 50 m with a floor of 50 (`formatDistance`).

The engine loads *yesterday, today, and tomorrow* schedules with offsets, so itineraries can legitimately cross midnight — `endDate` may be later than `startDate`.

### API contract

Endpoints are `GET /api/route`, `GET /api/valid-dates`, `GET /api/health`. Non-2xx responses carry `{ errorCode, error }`, split 400 (validation, from `index.js`) / 404 (engine, from `raptorEngine.js`) / 500.

**The full contract — every parameter, field, nullability rule, error code, and rounding behaviour — lives in the `api-contract` skill.** Load it before touching `frontend/src/api` or `frontend/src/types`, or when interpreting any response field.

The README's "Known Limitations & Unexpected Behaviors" section documents deliberate engine quirks — pedestrian-only itineraries, null `transitDistanceMeters`, straight-line footpaths across water. Do not "fix" these in the frontend; surface them.

## Frontend conventions

Deliberately small dependency footprint. Before adding any package, justify it: it must solve a real problem that would otherwise need significant custom code, and be mature enough for production. Prefer native `fetch`, React state, CSS, and small local utilities. Specifically **not** wanted unless the need actually materialises: a global state library, a date library, a form library, a validation library, an HTTP client. Never add two libraries for the same problem.

- **No `fetch` in components.** All API access goes through `src/api/`; components import `getValidDates()` / `planJourney()` and receive domain types.
- **Domain types live in `src/types/`**, derived from real API responses. Never invent a field. Nullable in the API means nullable in TypeScript. Legs are a `WALK | TRANSIT` discriminated union on `mode`. When the backend contract changes, verify against a live response and update the `api-contract` skill in the same commit.
- **No `any`** without a documented, unavoidable reason. `tsconfig.app.json` runs `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — optional properties therefore need an explicit `| undefined`.
- **Environment config only via `src/config/env.ts`**, which validates at startup. The backend URL is `VITE_API_BASE_URL`; it has no fallback and will throw if unset.
- **No literal colours, radii, or shadows in components.** Use the design tokens declared in the `@theme` block of `src/styles/index.css` (Tailwind v4 — tokens become both CSS variables and utilities). Add a token rather than an arbitrary value.
- **No user-facing strings inline in components.** They belong in `src/i18n/en.ts`. Arabic and RTL are planned, so prefer logical CSS properties (`ms-*`, `pe-*`, `text-start`) over `left`/`right` ones from the start.
- Avoid premature abstraction. Don't create an abstraction, or split out a tiny component, without a present need.
