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
cd frontend && npm test                        # vitest, single run
cd frontend && npm run test:watch              # vitest, watch mode
cd frontend && npx vitest run path/to/x.test.ts   # a single test file
cd frontend && npm run check:contrast          # WCAG AA check on design tokens
```

The frontend has a Vitest suite. **The pipeline and backend have no tests and are not to get any** — `npm test` there is an unimplemented stub. Verify backend behaviour by calling the running server.

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
- **Every async surface needs three states** — loading, empty, and error — designed together with the success state, not bolted on. A journey search that legitimately returns nothing (`NO_ROUTE_FOUND`) is an empty state, not an error.
- **Never show the API's `error` string to a user.** It is developer-facing English. Map `errorCode` to a localised message; fall back to a generic one for unrecognised codes.
- **Stay inside the declared browser baseline** (`build.target` in `vite.config.ts`: Chrome/Edge 111, Firefox 113, Safari 15.4). Anything newer needs a feature-detected fallback — see `anySignal()` in `src/api/client.ts` for the pattern, and the `@supports not (color: oklch(...))` block for the CSS one. Widening or narrowing the baseline is a deliberate decision, not a side effect.
- Avoid premature abstraction. Don't create an abstraction, or split out a tiny component, without a present need.

## Localisation

English and Arabic are both first-class from the start; Arabic is not a later retrofit.

- **No user-facing string inline in a component.** Strings live in `src/i18n/en.ts` and `src/i18n/ar.ts`, both typed against the explicit `Dictionary` interface, so a new key fails to compile until every locale defines it.
- **Use `useLocale()`** for `t`, `strings`, `locale`, and `direction`. `t` handles interpolation and plural selection.
- **Plurals go through plural forms, never `if (n === 1)`.** Arabic has six CLDR categories (zero/one/two/few/many/other) where English has two; `Intl.PluralRules` picks the right one.
- **Never concatenate translated fragments** or build a sentence from pieces — word order differs between languages. Use one message with placeholders.
- **Format every number, date, time, and duration through `Intl`** (`src/i18n/translate.ts`), never by hand. Parse API `YYYY-MM-DD` values with `parseIsoDate`, never `new Date(string)`, which reads them as UTC and shifts the day.
- **Logical CSS properties only** — `ms-*`/`me-*`, `ps-*`/`pe-*`, `text-start`/`text-end`, `border-s`/`border-e`. Never `ml-*`, `pr-*`, `text-left`, `left-0`. The document `dir` flips wholesale, and physical properties do not flip with it.
- Directional *icons* (arrows, chevrons, back buttons) must mirror in RTL; logos and mode icons must not.
- Arabic strings are stored in logical order — sentence-final punctuation is the last character of the string even though it renders on the left. Do not "fix" it to match what an editor displays.
- Verify changes in both directions. Most RTL bugs are invisible in LTR.

## Accessibility

The target is **WCAG 2.1 AA**. For a public-transport planner in the EU this is the standard public-sector bodies are held to (EN 301 549 / Directive 2016/2102), so treat it as a requirement, not a preference.

- **Semantic HTML first.** A real `<button>`, `<nav>`, `<ul>`, `<label>`. Reach for ARIA only when no native element expresses the meaning — a wrong ARIA role is worse than none.
- **The map is never the only route to information.** Every journey, leg, and stop must be readable as structured text by a screen reader. Treat the map as an enhancement over an accessible itinerary list.
- **Never encode meaning in colour alone.** Transit mode needs an icon and a text label, not just a coloured line — this covers colour-blind users and greyscale printing.
- **Everything reachable and operable by keyboard**, in a sensible order, with a visible focus indicator. That includes map controls; if the map cannot be driven by keyboard, the equivalent action must exist outside it.
- **Announce async results** via a live region so screen-reader users learn that a search finished.
- **Respect `prefers-reduced-motion`** for transitions and map animations.
- Text contrast ≥ 4.5:1, large text and UI boundaries ≥ 3:1, in both colour schemes. `npm run check:contrast` verifies this against the tokens in `src/styles/index.css`; when you add a foreground/background combination, add the pair to `scripts/check-contrast.mjs` and run it. Use `border-strong`, not `border`, for anything that outlines a control.
- Every input needs a real associated `<label>`; placeholder text is not a label.
- Never disable focus outlines without replacing them with something at least as visible.

## Testing

Frontend only. Vitest + Testing Library, jsdom environment. Tests live beside the code they cover as `*.test.ts(x)`.

Test the things that are easy to get silently wrong, not the framework:

- Logic with rules a reader cannot verify by eye — plural category selection, date parsing, query serialisation, error mapping.
- Behaviour the type system cannot express. `Dictionary` guarantees both locales have the same keys, but only a test catches an Arabic plural message missing its `few` form.
- Contracts with the backend: which query parameter a field becomes, what an error body turns into.

Query by accessible role (`getByRole('button', { name })`) rather than by test id where a real user-facing name exists — a test that cannot find an element by its accessible name is telling you about an accessibility bug.

`src/test/setup.ts` shims `localStorage`; the comment there explains why both Node and jsdom fail to provide a working one.

## Privacy

- Request geolocation only in response to an explicit user action, never on page load, and keep the app fully usable when it is denied.
- Coordinates are personal data. Do not log them to third parties or put them in analytics.
