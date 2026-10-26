# Amman GTFS generator

Builds `raw-data/amman-gtfs-data/` from the public Kentkart API behind Amman Bus
(`mobile.ammanbus.jo`, region 116). Amman publishes no GTFS feed of its own;
this is where the `amman` network's timetable comes from. It covers every
Kentkart operator in Jordan — Amman Bus and the BRT, and the intercity lines to
Irbid, Zarqa, Karak, Tafila, Ma'an and Aqaba. Python 3.9+, standard library only.

```sh
# From the repository root.
# 1. Snapshot the API: ~382 requests at 1/s, then the same again for the
#    Arabic stop names — about fifteen minutes in all, resumable.
python3 scripts/amman-gtfs/amman_gtfs.py fetch --out raw-data/amman-api-snapshots/$(date +%F)
#    (A snapshot taken before the names pass existed can gain them on its own:
#    python3 scripts/amman-gtfs/amman_gtfs.py fetch-names --out raw-data/amman-api-snapshots/YYYY-MM-DD)

# 2. Write the feed. Old .txt files in the folder are removed first.
python3 scripts/amman-gtfs/amman_gtfs.py build \
  --raw raw-data/amman-api-snapshots/YYYY-MM-DD --dir raw-data/amman-gtfs-data [--days 28] [--overrides holidays.csv]

# 3. Extract the towns the service area takes in: OpenStreetMap built-up land
#    around the stops, from Geofabrik's Jordan extract (60 MB, kept and reused;
#    add --refresh for a newer one). About fifteen seconds.
python3 scripts/urban-areas/urban_areas.py --network amman

# 4. Compile it, as for any network.
cd offline-data-ingestion-pipeline && node runPipeline.js
```

Snapshots are git-ignored (`raw-data/*-api-snapshots/`) and worth keeping:
comparing two of them is the only way to see a timetable change.

## The feed expires — refresh it

The API has **no validity dates**. It publishes three recurring weekly patterns
(Sun–Thu, Friday, Saturday) and nothing tied to a calendar. The feed therefore
runs from the snapshot date for `--days` (28 by default), and `feed_info.txt`
says so, which is what `network-meta`'s `feedEndDate` reports. Past that date
the planner has no service days. Refresh at least every four weeks: fetch,
build, compile, ship `processed-data/amman-processed-data/` as in the main
README's *Deployment*.

Holidays and Ramadan timetables are not in the API. Known ones can be given as
`--overrides`, a CSV of `date,run_as` where `run_as` is a weekday name or
`none`. For example, `20261225,friday` runs the Friday service that day. These
become `calendar_dates.txt`, which is otherwise written with only its header
because the pipeline requires the file.

## What comes from where

| GTFS | Source | |
|---|---|---|
| agency, routes | `web/nearest/find` → `routeList` | verified |
| stops, stop order | `web/pathInfo` → `busStopList` | verified |
| trips, `trip_id` | `scheduleList[].timeList[].tripId`, unique network-wide | verified |
| `trip_headsign` | the last place in `timeList[].tripHeadSign` (or the path's `headSign`) | derived: the API signs a trip with its whole route, origin first (`Al Mahatta Terminal - Al Manara`), so only what follows the last spaced hyphen is kept |
| stop times | trip start + per-stop `arrival_offset` / `departure_offset` | identical to the API's own per-stop timetable |
| calendar weekdays | `scheduleList[].description`, uppercase = runs (`MTWTfsS` = Sun–Thu) | verified |
| calendar dates | snapshot date + `--days` | **assumed**; see above |
| shapes | `pointList` | verified |
| `shape_dist_traveled` | each stop projected onto its shape, in **kilometres** | derived |
| `agency_timezone` | `Asia/Amman` | the API server's clock |
| `agency_url` | `https://www.ammanbus.jo/` | assumed |
| `translations.txt` | `web/pathInfo` with `lang=ar` → `busStopList[].stopName`, by `stopId` | verified; the API names only 405 of 1,365 stops in Arabic and repeats the English for the rest, which are left out |

`shape_dist_traveled` is what lets the pipeline cut a ridden leg out of its
route's shape; without it every leg is drawn as a straight line. Kilometres
because that is what HSL publishes and what the engine multiplies by 1000.

## Upstream data problems the build handles

- **Shapes drawn backwards.** About twenty paths, mostly intercity, list their
  points end-to-start relative to their own stops. Each path is fitted both
  ways and reversed when that is decisively better. Each reversal is printed
  as a warning.
- **Patterns that revisit a stop.** Routes 5 and 12 are loops that start and
  end at one terminal, and route 2 doubles back. The pipeline and engine
  handle this (see `parseRoutes.js` and `injectTransitShape.js`).
- **Shapes that do not reach a stop.** Route 2 direction 0 is inconsistent
  upstream (3.3 km off), and a handful of short routes have a terminal a few
  hundred metres past the end of their line. They are kept; the map draws a
  short connector.
- **No timetable.** 29 routes, all university shuttles, have none and are left
  out.

## The API

No authentication. Every request takes `region=116&lang=en`. `result.code` is
`0` OK, `1` invalid region, `3` "Result Not Found" (a direction the route does
not run), `34` missing parameters. `service.kentkart.com` does not serve region
116; Amman's deployment is separate.

`web/pathInfo` takes `displayRouteCode`, `direction` (0/1) and `resultType`, a
bitmask over `pointList|busList|busStopList|timeTableList|scheduleList|-`; the
build asks for `101010`. `timeTableList` is today's remaining departures only
and ignores any date parameter. `busList` is live vehicle positions.
`api/route/timetable?busStopId=` gives the same schedule at another stop.
