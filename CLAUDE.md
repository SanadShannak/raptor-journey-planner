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
cd frontend && npm run check:contrast          # WCAG AA check on design tokens, both schemes
```

The frontend has a Vitest suite. **The pipeline and backend have no tests and are not to get any** — `npm test` there is an unimplemented stub. Verify backend behaviour by calling the running server.

The backend port defaults to `3000` and is set in `backend/server/serverConfig.js`, which honours `process.env.PORT`. The frontend's `VITE_API_BASE_URL` must agree with it.

## Architecture

### Network selection drives every path

`offline-data-ingestion-pipeline/pipelineConfig.js` exports `ACTIVE_NETWORK` (currently `"hsl"`). That single string derives `raw-data/<network>-gtfs-data/` and `processed-data/<network>-processed-data/` throughout both the pipeline and the backend. Switching cities is a one-token change; never hardcode a network folder name.

`pipelineConfig.rules` is also the ingestion schema validator — required GTFS files and column headers are rejected at the stream boundary if missing.

### Offline pipeline → processed JSON → in-memory server

`runPipeline.js` runs eight parsers **in order** as synchronous child processes; later components consume earlier ones' output (spatial grid feeds the footpath generator, stops feed the grid, and so on). Reordering them breaks the build.

The parsers compact relational GTFS text into zero-indexed contiguous arrays: a stop's *array index* is its internal integer ID, and `*-mapping.json` files translate original GTFS string IDs back to those integers. Times are stored as seconds-from-midnight integers, not strings.

`backend/memoryCache.js` loads every `processed-data/` file synchronously at require time, so the whole network is in the V8 heap before the port opens. Startup is slow; requests are not.

### Request path

`backend/server/index.js` (mounts routers) → `backend/server/routes/plannerApi.js` (validates the query) → `backend/raptor-engines/raptorEngine.js` (routes, in seconds-from-midnight) → `backend/server/utils/formatItinerary.js` (presenter: seconds → `HH:mm`, rounding) → JSON.

Everything server-side lives under `backend/server/` apart from the engine, which sits at `backend/raptor-engines/`. One router per endpoint in `backend/server/routes/`.

`formatItinerary.js` is the definitive source for the response shape the frontend consumes — read it rather than guessing at fields. Three rounding behaviours from `backend/server/utils/`: times round to whole minutes *asymmetrically* — an arrival up, a departure down, so nobody is told they arrive earlier or may leave later than they can (`roundSecondsToMinute`); durations round to whole minutes with a floor of 1 (`formatDuration`); distances round to the nearest 50 m with a floor of 50 (`formatDistance`).

**Every duration in a response is measured between the rounded times that same response publishes, never from the engine's exact seconds.** A leg's duration is `endTime − startTime`, a wait is the gap between the previous leg's `endTime` and this leg's `startTime`, and the legs and waits tile the journey — they sum to `totalDurationMinutes`, which is itself `endTime − startTime`. Dates move with the times, so rounding an arrival up across midnight advances `endDate` with it.

This is a guarantee to build on, not a coincidence to defend against: **a client must not recompute a duration, and must not treat a disagreement as expected.** It is stated because it was once untrue — rounding a duration from raw seconds while rounding times asymmetrically let the two drift by up to two minutes, and the frontend grew a whole module to paper over it. The engine works in exact seconds and knows nothing about any of this; the rounding, and therefore the arithmetic, belongs to the presenter.

The engine loads *yesterday, today, and tomorrow* schedules with offsets, so itineraries can legitimately cross midnight — `endDate` may be later than `startDate`.

### Time is always the network's clock

**Every timestamp in this system is wall-clock time in the active network's timezone** — never the server's, never the browser's. A Helsinki timetable reads the same whether the server runs in Frankfurt or Virginia and whether the visitor is in Amman or Toronto.

The authoritative source is the feed's own `agency_timezone` (`Europe/Helsinki` for HSL, `Asia/Amman` for an Amman feed). Like `ACTIVE_NETWORK`, it is one value that everything derives from; never hardcode a zone or reach for the host's.

Three rules follow, and the third is the one that gets broken:

1. **Computing "now" or "today" uses the network zone.** Any default date, any "next departures" cutoff, any is-this-in-the-past check. `new Date()` alone is a bug — it answers in the host's zone.
2. **Date arithmetic builds from parts.** `new Date("2026-09-10")` parses as UTC midnight and lands on the previous day for anyone west of Greenwich, which silently shifts a whole service day. See `convertDateIdToDateObject`.
3. **Values coming *out* of the API are already network-local — do not convert them again.** `startTime`, `endTime`, and every departure are wall-clock strings in the network's zone. Formatting them with a `timeZone` option would shift them a second time. The zone is only for answering "what time is it there now", never for re-interpreting a value the API already resolved.

**On the wire, times are always 24-hour**; only the *display* is localised. The API returns and accepts `HH:mm`, every value stored in a URL or in state is `HH:mm`, and `formatClockTime` is the single place that turns one into something a person reads — currently 12-hour with a meridiem, in whichever form the locale writes it.

The risk a 12-hour clock carries is that "12:40 AM" reads as the wrong end of the day. That is answered by the date rather than by the clock: an itinerary whose arrival falls on the next day says so, and every departure the API returns carries its own date for exactly this reason. Never render a time that could fall after midnight without the date beside it.

### API contract

Endpoints are `GET /api/planner` (journey planning), `GET /api/stop/:id`, `GET /api/routes`, `GET /api/network`, `GET /api/valid-dates`, and `GET /api/health`.

Every failure, whatever its status, carries `{ errorCode, error }`. **The status tells you who refused, not whether there is an answer:**

- **400** — the request was malformed, from `backend/server/routes/plannerApi.js`.
- **200 with an `errorCode`** — the request was fine and the *engine* has an outcome to report, `NO_ROUTE_FOUND` among them. There is no `legs` in such a body, so code that goes straight to parsing an itinerary reports "unreadable response" for what is really "nothing runs then". **Read `errorCode` on a successful response too.**
- **500** — `INTERNAL_SERVER_ERROR`.

`NO_ROUTE_FOUND` is an *empty state, not a failure* — the search ran and the honest answer is that nothing connects those places then. `frontend/src/api/journey.ts` turns it into an empty list so no caller has to remember to special-case it. Everything else becomes an `ApiError` carrying the code, which `frontend/src/i18n/apiError.ts` maps to a localised message. **The API's own `error` string is developer-facing English and is never shown to anyone.**

**The full contract — every parameter, field, nullability rule, error code, and rounding behaviour — lives in the `api-contract` skill.** Load it before touching `frontend/src/api` or `frontend/src/types`, or when interpreting any response field.

The README's "Known Limitations & Unexpected Behaviors" section documents deliberate engine quirks — pedestrian-only itineraries, null `transitDistanceMeters`, straight-line footpaths across water. Do not "fix" these in the frontend; surface them.

## Frontend conventions

Deliberately small dependency footprint. Before adding any package, justify it: it must solve a real problem that would otherwise need significant custom code, and be mature enough for production. Prefer native `fetch`, React state, CSS, and small local utilities. Specifically **not** wanted unless the need actually materialises: a global state library, a date library, a form library, a validation library, an HTTP client. Never add two libraries for the same problem.

- **No `fetch` in components.** All API access goes through `src/api/`; components import `getValidDates()` / `planJourney()` and receive domain types.
- **Domain types live in `src/types/`**, derived from real API responses. Never invent a field. Nullable in the API means nullable in TypeScript. Legs are a `WALK | TRANSIT` discriminated union on `mode`. When the backend contract changes, verify against a live response and update the `api-contract` skill in the same commit.
- **No `any`** without a documented, unavoidable reason. `tsconfig.app.json` runs `strict` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — optional properties therefore need an explicit `| undefined`.
- **Never call `new Date()` for "now" or "today".** Those come from the network's clock (see *Time is always the network's clock*); the browser's zone is not the network's. Parse API dates with `parseIsoDate` and format API times with `formatClockTime`, neither of which applies a timezone conversion.
- **Environment config only via `src/config/env.ts`**, which validates at startup. The backend URL is `VITE_API_BASE_URL`; it has no fallback and will throw if unset.
- **No literal colours, radii, or shadows in components.** Use the design tokens declared in the `@theme` block of `src/styles/index.css` (Tailwind v4 — tokens become both CSS variables and utilities). Add a token rather than an arbitrary value.
- **`chrome` is a surface, not a brand shade.** The wine header/nav bar uses `bg-chrome text-on-chrome`; brand-coloured text on a normal page uses `brand-500`. Anything placed on a bar is contrast-checked against `chrome`, not against `surface`.
- **Light is the base palette; dark is an override.** Dark values are declared once as `--dark-*` and mapped onto the semantic tokens by two rules — a `prefers-color-scheme` query that paints the first frame before any JavaScript runs, and a `:root[data-theme='dark']` rule for the in-app choice. Add a token to *both* mapping blocks or `check:contrast` will fail.
- **Colour scheme is a three-way choice** (`light` / `dark` / `system`) in `src/theme/`. "System" removes `data-theme` entirely and hands the decision back to the media query; it must never be stored as a resolved value, or the app stops tracking the OS.
- **Fonts are self-hosted** and declared in `src/styles/fonts.css`: IBM Plex Sans for Latin, IBM Plex Sans Arabic for Arabic, split by `unicode-range` so neither locale downloads the other's files. No font CDN — it would leak every visitor's IP to a third party. Regenerate the `@font-face` rules from the Fontsource packages when adding a weight or a script; do not import their stylesheets wholesale.
- **Every async surface needs three states** — loading, empty, and error — designed together with the success state, not bolted on. A journey search that legitimately returns nothing (`NO_ROUTE_FOUND`) is an empty state, not an error.
- **Never show the API's `error` string to a user.** It is developer-facing English. Map `errorCode` to a localised message; fall back to a generic one for unrecognised codes.
- **Stay inside the declared browser baseline** (`build.target` in `vite.config.ts`: Chrome/Edge 111, Firefox 113, Safari 15.4). Anything newer needs a feature-detected fallback — see `anySignal()` in `src/api/client.ts` for the pattern, and the `@supports not (color: oklch(...))` block for the CSS one. Widening or narrowing the baseline is a deliberate decision, not a side effect.
- Avoid premature abstraction. Don't create an abstraction, or split out a tiny component, without a present need.

### The journey planner

`src/pages/PlanPage.tsx` owns the state; `src/features/journey/` holds the parts. The search **is** in the URL, via `src/features/journey/searchParams.ts` — nine parameters: a label and a coordinate pair per end, the date, the time, and the pace. It was taken out once, on the grounds that a query string of coordinates and labels bought only a shareable link nobody had asked for, and put back when the page gained somewhere to go: an itinerary leg opens the run it is riding and so does a drawn line on the map, and coming back from either landed on an empty form with the journey gone. A back button that does not work costs more than a long address.

Two rules keep it honest. It is written only when a search is **run**, never as the form is filled in — the address records a question that was asked, not one being typed — and always with `replace`, so the back button leaves the page rather than walking out through every time and pace tried on the way. Asking for later departures deliberately does not write: that reads further down one answer rather than asking a different question. A search found in the address runs itself once, gated on the health probe. Anything incomplete or mangled restores as an empty form rather than a half-filled one. Which itinerary is open and which stop is being inspected go in the address too, so leaving from a detail panel comes back to that panel.

Beside it, `src/features/journey/plannerMemory.ts` holds what the page was showing in a **module-level value** — not storage of any kind, and that is the whole distinction. It survives every navigation inside the app, because the tab keeps running the same JavaScript, and it does not survive a reload, because a reload is a new context: come back to where you were, ask for a fresh page and get one. `sessionStorage` would outlive a refresh, and a timetable answer that outlives a refresh is one nobody asked to keep. The two are not redundant — this answers "take me back to what I was doing", the address answers "open this search on a machine that has never seen it". A module-level value is shared by every test in a file, so `forgetPlanner()` belongs in `beforeEach`. The page's own memory of what it last searched is what stops a repeat; see `lastSearched`. The form searches when it is submitted, not when it is complete. It used to search itself the moment every field was filled, which stopped paying once the search left the URL: with a minimum on the searching state and results cleared on every change, adjusting a date then a time then a pace threw away two answers to reach a third. The button is also the only thing that can say the form is a question you finish asking. Enter submits from any field.

**Results are two views, not one.** `ItineraryOverview` is a card per result, carrying only what a choice is made on; opening one swaps the sidebar for `ItineraryDetail`. Do not put the stop-by-stop account back in the list — a 26rem sidebar showing five of them cannot be compared, which is the whole reason the list exists.

**The strip map is built from `itineraryRows.ts`, not from legs directly.** A leg is a *segment* and has nowhere to put the moment you arrive somewhere as distinct from the moment you leave it, so a change drawn straight from legs reads as one point in time when really you get off at 18:24, wait six minutes, and board again at 18:30. `itineraryRows()` expands a journey into strictly alternating node and segment rows — a stop appearing **twice** when there is a wait between them, once when there is not — and that invariant is what lets each colour run centre to centre between circles. Change the drawing there, not in the component.

`journeyTotals.ts` computes what the API never sends: walking, waiting, and riding totals. Riding distance is null whenever *any* ridden leg lacks one, because a partial sum presented as a whole is worse than no number.

The engine's synthetic endpoints are `code: "ORIGIN_PIN"` / `"TARGET_PIN"` with `name: "ORIGIN"` / `"TARGET"`. Those are placeholders, never shown — substitute what the traveller actually chose.

`checkHealth()` from `src/api/health.ts` gates the form. It **never rejects**, including on abort, which is where it parts company with `getJson`: it is a fire-and-forget probe inside an effect, and re-throwing produced an unhandled rejection on every unmount rather than information anyone used.

**Back is a stack, not a destination.** `src/app/useBackStack.ts` counts in-app pushes in a module-level value — mounted once in `RootLayout` — so a back control can tell "there is an entry of ours behind this one" from "this page was opened cold". When there is one it steps back a single entry, however many levels deep somebody has gone; when there is not, it goes to the section's own index, which is the only case a page has to name for itself. The count is subscribed to rather than read, because a control words itself during render and the count moves in an effect one render later.

The corollary: **a row that is a `<Link>` must not also navigate on click.** Both agreed on the destination, so pressing a stop pushed the same address twice and the first press of back appeared to do nothing.

### Place search

Geocoding is an adapter behind the `Geocoder` interface in `src/types/place.ts`, resolved once in `src/geocoding/index.ts` — the right one depends on the network, so adding a city means adding an adapter, not changing the form.

- **Photon** is the default and needs no key. It is one of the few free geocoders that permits typeahead; Nominatim forbids it. It knows OpenStreetMap, not our feed, so it can never supply a stop id.
- **Digitransit** is used when `VITE_DIGITRANSIT_SUBSCRIPTION_KEY` is set, and knows HSL's own stops. Its `addendum.GTFS` carries modes, stop code, and platform, which is what lets six results named "Pasila" be told apart. A key in a browser bundle is public by design; the dev one is committed in `frontend/.env.development` and is rate-limited per key.

Two rules that cost real bugs: a stop id arrives as `GTFS:HSL:1020444#H0101` and the `#platform` suffix is **not** part of the id, and an unrecognised mode is **dropped rather than defaulted** — telling someone a rail platform is a bus stop sends them to the wrong side of the station.

Never send a visitor's coordinates to a geocoder as a search bias. That would hand their position to a third party as a side effect of typing.

## Localisation

English and Arabic are both first-class from the start; Arabic is not a later retrofit.

- **No user-facing string inline in a component.** Strings live in `src/i18n/en.ts` and `src/i18n/ar.ts`, both typed against the explicit `Dictionary` interface, so a new key fails to compile until every locale defines it.
- **Use `useLocale()`** for `t`, `strings`, `locale`, and `direction`. `t` handles interpolation and plural selection.
- **Plurals go through plural forms, never `if (n === 1)`.** Arabic has six CLDR categories (zero/one/two/few/many/other) where English has two; `Intl.PluralRules` picks the right one.
- **Never concatenate translated fragments** or build a sentence from pieces — word order differs between languages. Use one message with placeholders.
- **Format every number, date, time, and duration through `Intl`** (`src/i18n/translate.ts`), never by hand. Parse API `YYYY-MM-DD` values with `parseIsoDate`, never `new Date(string)`, which reads them as UTC and shifts the day.
- **Logical CSS properties only** — `ms-*`/`me-*`, `ps-*`/`pe-*`, `text-start`/`text-end`, `border-s`/`border-e`. Never `ml-*`, `pr-*`, `text-left`, `left-0`. The document `dir` flips wholesale, and physical properties do not flip with it.
- **Truncating a name that may be in the other script is the one exception, and it needs two properties together.** A stop's name comes from the feed and a nickname comes from a person, so either can be Latin on an Arabic page or Arabic on a Latin one. Left alone, an over-long Latin name in RTL loses its *front* rather than its tail — the RTL line's end is on the left, so that is where `text-overflow` puts the ellipsis, turning "Olympiaterminaali - Eira - Päärautatieasema" into "…Kallio - Kuusitie". `unicode-bidi: plaintext` takes the paragraph direction from the content and truncates the run as what it actually is. It then redirects `text-align: start`, though, which follows that same content direction — so the name aligns itself to one edge while the code badge under it stays on the other, and an Arabic nickname on an English page does it mirrored. Pin the box with `ltr:text-left rtl:text-right`; this is the only place a physical alignment is right. **`dir="auto"` is not the answer to either half** — it flips the whole box, which is the misalignment, not a fix for it. Worked example: `frontend/src/features/favourites/FavouriteCard.tsx`.
- **A badge's visible edge is its border, not the text inside it.** A code or zone chip is bordered and padded, so plain text stacked above it has three candidate edges to line up with and only one of them reads as aligned: the chip's *border* against the text's *first glyph*. Matching the text inside the chip instead leaves the chip itself hanging out to the side, which is the same fault seen from the other end. Give both the same leading inset — the plain line gets `border border-transparent px-1.5` so its own focus ring matches the chip too, and a wrapper around the chip gets `ms-px ps-1.5`, which is the same seven pixels without the two a second border would add to the height. Worked example: `frontend/src/features/favourites/FavouriteCard.tsx`.
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
