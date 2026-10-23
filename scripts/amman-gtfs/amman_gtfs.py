"""Amman Bus (Kentkart region 116) -> GTFS.

Two stages, so the network is only hit once per snapshot. From the repository root:

    python3 scripts/amman-gtfs/amman_gtfs.py fetch --out raw-data/amman-api-snapshots/$(date +%F)
    python3 scripts/amman-gtfs/amman_gtfs.py build --raw raw-data/amman-api-snapshots/YYYY-MM-DD \
        --dir raw-data/amman-gtfs-data [--days 28] [--overrides holidays.csv]

Data source (verified 2026-10-23, no auth required):
    https://mobile.ammanbus.jo/rl1/web/nearest/find?region=116&lang=en              -> routeList
    https://mobile.ammanbus.jo/rl1/web/pathInfo?region=116&lang=en&displayRouteCode=X&direction=D&resultType=101010
        -> pathList[].pointList (shape), busStopList (ordered stops + offsets), scheduleList (weekday patterns + trips)

The API exposes recurring weekday patterns only; it has no validity dates or exceptions.
See README.md for how calendar dates are handled.
"""

import argparse
import csv
import datetime as dt
import io
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile

BASE_URL = "https://mobile.ammanbus.jo/rl1"
REGION = "116"
TIMEZONE = "Asia/Amman"
USER_AGENT = "amman-gtfs/0.1 (personal journey planner; contact via github)"
# pointList | busStopList | scheduleList ; skips live busList and today-only timeTableList
PATH_RESULT_TYPE = "101010"
# Written even when empty: some consumers (and the RAPTOR pipeline) require the file to exist.
HEADER_ONLY = {"calendar_dates.txt": ["service_id", "date", "exception_type"]}
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


# --------------------------------------------------------------------------- fetch


class Client:
    def __init__(self, delay=1.0, retries=4, timeout=30):
        self.delay = delay
        self.retries = retries
        self.timeout = timeout
        self._last = 0.0

    def get(self, path, allow_codes=(0,), **params):
        params = {"region": REGION, "lang": "en", **params}
        url = f"{BASE_URL}{path}?{urllib.parse.urlencode(params)}"
        for attempt in range(self.retries):
            wait = self.delay - (time.monotonic() - self._last)
            if wait > 0:
                time.sleep(wait)
            self._last = time.monotonic()
            try:
                req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
                with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as e:
                print(f"  ! {url}: {e} (attempt {attempt + 1}/{self.retries})", file=sys.stderr)
                time.sleep(2 ** (attempt + 1))
                continue
            code = data.get("result", {}).get("code")
            if code not in allow_codes:
                # Application-level error (e.g. 1 "Invalid Region", 34 missing params): not retryable.
                raise RuntimeError(f"{url} -> code {code}: {data.get('result', {}).get('message')}")
            return data
        raise RuntimeError(f"giving up on {url}")


def fetch(out_dir, delay):
    client = Client(delay=delay)
    os.makedirs(os.path.join(out_dir, "paths"), exist_ok=True)

    nearest = client.get("/web/nearest/find")
    with open(os.path.join(out_dir, "nearest.json"), "w", encoding="utf-8") as f:
        json.dump(nearest, f, ensure_ascii=False)

    codes = sorted({r["displayRouteCode"] for r in nearest["routeList"]})
    print(f"{len(codes)} routes; fetching 2 directions each at {delay}s/request")
    for i, code in enumerate(codes, 1):
        for direction in (0, 1):
            dest = os.path.join(out_dir, "paths", f"{urllib.parse.quote(code, safe='')}_{direction}.json")
            if os.path.exists(dest):  # resumable
                continue
            data = client.get(
                "/web/pathInfo", allow_codes=(0, 3),  # 3 = "Result Not Found": direction does not exist
                displayRouteCode=code, direction=direction, resultType=PATH_RESULT_TYPE,
            )
            with open(dest, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        print(f"  [{i}/{len(codes)}] {code}")

    with open(os.path.join(out_dir, "snapshot.json"), "w") as f:
        json.dump({"fetched_at": nearest["result"]["dateTime"], "base_url": BASE_URL, "region": REGION}, f)


# --------------------------------------------------------------------------- build


def hms_to_sec(t):
    h, m, s = (t.split(":") + ["0"])[:3]
    return int(h) * 3600 + int(m) * 60 + int(s)


def sec_to_hms(s):
    return f"{s // 3600:02d}:{s % 3600 // 60:02d}:{s % 60:02d}"


def weekday_mask(description):
    """'MTWTfsS' -> [1,1,1,1,0,0,1]; uppercase letter = runs that day (Mon..Sun).

    Verified on Amman data: weekday trips are 'MTWTfsS' (Sun-Thu), 'mtwtFss' (Fri), 'mtwtfSs' (Sat),
    and today's (Friday) live timeTableList contained only the 'mtwtFss' trips.
    """
    if not description or len(description) != 7 or not description.isalpha():
        raise ValueError(f"unexpected schedule description {description!r}")
    return [int(c.isupper()) for c in description]


def shape_distances(points, stop_points):
    """Metres along the shape for every shape point and for every stop, in stop order.

    The API gives no distances, so each stop is projected onto the polyline. A greedy nearest-point snap fails
    on loop routes (first and last stop share a spot), so this picks, for each stop in turn, a position that never
    moves backwards along the line and minimises the total snapping distance (O(stops x segments)).
    Returns (cumulative point distances, stop distances, worst snap in metres).
    """
    lat0 = math.radians(points[0][0])
    k = 6371008.8 * math.pi / 180

    def xy(p):
        return p[1] * k * math.cos(lat0), p[0] * k

    pts = [xy(p) for p in points]
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.dist(a, b))
    segs = range(len(pts) - 1)

    best_prev = [0.0] * len(segs)  # min cost of the previous stop over segments <= j
    choices = []  # per stop: (along per segment, argmin-prefix of previous stop)
    snap = []
    for sp in stop_points:
        px, py = xy(sp)
        cost, along, dists = [], [], []
        for j in segs:
            (ax, ay), (bx, by) = pts[j], pts[j + 1]
            dx, dy = bx - ax, by - ay
            seg_len2 = dx * dx + dy * dy
            t = 0.0 if seg_len2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg_len2))
            d = math.hypot(px - (ax + t * dx), py - (ay + t * dy))
            dists.append(d)
            along.append(cum[j] + t * math.sqrt(seg_len2))
            cost.append(d + best_prev[j])
        prefix_arg, prefix, run, run_arg = [], [], math.inf, 0
        for j in segs:
            if cost[j] < run:
                run, run_arg = cost[j], j
            prefix.append(run)
            prefix_arg.append(run_arg)
        choices.append((along, prefix_arg, dists))
        best_prev = prefix

    # Backtrack from the cheapest final segment.
    stop_d = [0.0] * len(stop_points)
    j = choices[-1][1][-1]
    for i in range(len(stop_points) - 1, -1, -1):
        along, prefix_arg, dists = choices[i]
        j = prefix_arg[j]
        stop_d[i] = along[j]
        snap.append(dists[j])
    for i in range(1, len(stop_d)):  # two stops on one segment can come out reversed by a hair
        stop_d[i] = max(stop_d[i], stop_d[i - 1])
    return cum, stop_d, max(snap)


def build(raw_dir, zip_path, days, overrides_path=None, out_dir=None):
    with open(os.path.join(raw_dir, "nearest.json"), encoding="utf-8") as f:
        nearest = json.load(f)
    with open(os.path.join(raw_dir, "snapshot.json")) as f:
        snapshot = json.load(f)
    snap_date = dt.datetime.strptime(snapshot["fetched_at"][:8], "%Y%m%d").date()

    agencies, routes, stops, trips, stop_times, shapes, services = {}, {}, {}, [], [], [], {}
    warnings = []

    for r in nearest["routeList"]:
        aid = r.get("agencyId") or "0"
        agencies.setdefault(aid, {
            "agency_id": aid,
            "agency_name": r.get("agencyName", "").strip() or "Unknown",
            "agency_url": "https://www.ammanbus.jo/",
            "agency_timezone": TIMEZONE,
        })
        routes[r["displayRouteCode"]] = {
            "route_id": r["routeCode"],
            "agency_id": aid,
            "route_short_name": r["displayRouteCode"],
            "route_long_name": r.get("name", "").strip(),
            "route_type": int((r.get("routeType") or "3").split(",")[0]),
            "route_color": r.get("routeColor", ""),
            "route_text_color": r.get("routeTextColor", ""),
        }

    used_routes, seen_trips, seen_shapes = set(), set(), set()
    worst_snap = (0.0, "")
    for code, route in routes.items():
        for direction in (0, 1):
            fname = os.path.join(raw_dir, "paths", f"{urllib.parse.quote(code, safe='')}_{direction}.json")
            if not os.path.exists(fname):
                warnings.append(f"route {code} dir {direction}: not fetched")
                continue
            with open(fname, encoding="utf-8") as f:
                data = json.load(f)
            for path in data.get("pathList", []):
                shape_id = path.get("path_code") or f"{route['route_id']}{direction}"
                pts = sorted(path.get("pointList", []), key=lambda p: int(p["seq"]))
                bus_stops = sorted(path.get("busStopList", []), key=lambda b: int(b["seq"]))
                if len(bus_stops) < 2:
                    warnings.append(f"route {code} dir {direction}: {len(bus_stops)} stops, skipped")
                    continue

                stop_dist = [""] * len(bus_stops)
                if len(pts) >= 2:
                    line = [(float(p["lat"]), float(p["lng"])) for p in pts]
                    stop_xy = [(float(b["lat"]), float(b["lng"])) for b in bus_stops]
                    cum, stop_dist, worst = shape_distances(line, stop_xy)
                    # Some paths (mostly 2-stop intercity lines) have pointList drawn end-to-start relative to
                    # their own busStopList; the reversed line then fits the stops and the forward one cannot.
                    rev = shape_distances(line[::-1], stop_xy)
                    if worst > 500 and rev[2] < worst / 4:  # decisive only: a loop fits either way round
                        warnings.append(f"route {code} dir {direction}: shape reversed to match stop order "
                                        f"(worst snap {worst:.0f} m -> {rev[2]:.0f} m)")
                        pts = pts[::-1]
                        cum, stop_dist, worst = rev
                    worst_snap = max(worst_snap, (worst, f"{code} dir {direction}"))
                    if shape_id not in seen_shapes:
                        seen_shapes.add(shape_id)
                        for i, (p, d) in enumerate(zip(pts, cum), 1):
                            shapes.append({"shape_id": shape_id, "shape_pt_lat": p["lat"], "shape_pt_lon": p["lng"],
                                           "shape_pt_sequence": i, "shape_dist_traveled": round(d / 1000, 4)})
                    # Kilometres, as HSL publishes them: the RAPTOR backend multiplies by 1000 for transitDistanceMeters.
                    stop_dist = [round(d / 1000, 4) for d in stop_dist]
                else:
                    pts = []
                for b in bus_stops:
                    stops.setdefault(b["stopId"], {"stop_id": b["stopId"], "stop_name": b.get("stopName", "").strip(),
                                                   "stop_lat": b["lat"], "stop_lon": b["lng"]})
                offsets = [(int(b.get("arrival_offset") or 0), int(b.get("departure_offset") or 0)) for b in bus_stops]
                if any(b[0] < a[1] for a, b in zip(offsets, offsets[1:])):
                    warnings.append(f"route {code} dir {direction}: non-monotonic offsets")

                for sched in path.get("scheduleList", []):
                    try:
                        mask = weekday_mask(sched.get("description"))
                    except ValueError as e:
                        warnings.append(f"route {code} dir {direction}: {e}, skipped")
                        continue
                    service_id = "D" + "".join(map(str, mask))  # e.g. D1111001 = Sun-Thu
                    services[service_id] = mask
                    for t in sched.get("timeList", []):
                        trip_id = t.get("tripId")
                        if not trip_id or not t.get("departureTime"):
                            continue
                        if trip_id in seen_trips:
                            warnings.append(f"duplicate tripId {trip_id} (route {code} dir {direction}), skipped")
                            continue
                        seen_trips.add(trip_id)
                        start = hms_to_sec(t["departureTime"])
                        trips.append({
                            "route_id": route["route_id"], "service_id": service_id, "trip_id": trip_id,
                            "trip_headsign": t.get("tripHeadSign") or path.get("headSign", ""),
                            "direction_id": direction, "shape_id": shape_id if pts else "",
                        })
                        used_routes.add(code)
                        for seq, (b, (arr, dep), dist) in enumerate(zip(bus_stops, offsets, stop_dist), 1):
                            stop_times.append({
                                "trip_id": trip_id, "arrival_time": sec_to_hms(start + arr),
                                "departure_time": sec_to_hms(start + dep), "stop_id": b["stopId"],
                                "stop_sequence": seq, "timepoint": 1 if seq == 1 else 0,
                                "shape_dist_traveled": dist,
                            })

    # Calendar: the API gives weekday patterns only. Validity window = snapshot date .. +days,
    # declared in feed_info.txt so consumers know the feed is a time-boxed snapshot, not an official calendar.
    end = snap_date + dt.timedelta(days=days)
    calendar = [{"service_id": sid, **dict(zip(WEEKDAYS, mask)),
                 "start_date": snap_date.strftime("%Y%m%d"), "end_date": end.strftime("%Y%m%d")}
                for sid, mask in sorted(services.items())]
    calendar_dates = load_overrides(overrides_path, services, snap_date, end) if overrides_path else []

    dropped = set(routes) - used_routes
    if dropped:
        warnings.append(f"{len(dropped)} routes without trips omitted: {', '.join(sorted(dropped))}")
    used_stop_ids = {st["stop_id"] for st in stop_times}

    files = {
        "agency.txt": list(agencies.values()),
        "routes.txt": [r for c, r in routes.items() if c in used_routes],
        "stops.txt": [s for s in stops.values() if s["stop_id"] in used_stop_ids],
        "trips.txt": trips,
        "stop_times.txt": stop_times,
        "calendar.txt": calendar,
        "calendar_dates.txt": calendar_dates,
        "shapes.txt": shapes,
        "feed_info.txt": [{
            "feed_publisher_name": "Unofficial snapshot of Amman Bus / Kentkart API",
            "feed_publisher_url": "https://www.ammanbus.jo/", "feed_lang": "en",
            "feed_start_date": snap_date.strftime("%Y%m%d"), "feed_end_date": end.strftime("%Y%m%d"),
            "feed_version": snapshot["fetched_at"],
        }],
    }
    texts = {}
    for name, rows in files.items():
        fields = list(rows[0].keys()) if rows else HEADER_ONLY.get(name)
        if fields:
            buf = io.StringIO()
            w = csv.DictWriter(buf, fieldnames=fields, lineterminator="\n")
            w.writeheader()
            w.writerows(rows)
            texts[name] = buf.getvalue()
        print(f"  {name}: {len(rows)}")
    if zip_path:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for name, text in texts.items():
                zf.writestr(name, text)
    if out_dir:
        # Old .txt files go first, so a file this build no longer writes cannot linger beside the new feed.
        os.makedirs(out_dir, exist_ok=True)
        for old in os.listdir(out_dir):
            if old.endswith(".txt"):
                os.remove(os.path.join(out_dir, old))
        for name, text in texts.items():
            with open(os.path.join(out_dir, name), "w", encoding="utf-8", newline="") as f:
                f.write(text)
    for w_ in warnings:
        print("  WARN", w_, file=sys.stderr)
    print(f"  worst stop-to-shape snap: {worst_snap[0]:.0f} m ({worst_snap[1]})")
    print(f"wrote {zip_path or out_dir} (valid {snap_date} .. {end}, {TIMEZONE})")


def load_overrides(path, services, start, end):
    """Optional CSV `date,run_as` (YYYYMMDD, weekday name or 'none') for public holidays etc.

    E.g. `20261225,friday` runs the Friday service on that date. Nothing here comes from the API.
    """
    rows = []
    with open(path, newline="") as f:
        for r in csv.DictReader(f):
            day = dt.datetime.strptime(r["date"], "%Y%m%d").date()
            if not start <= day <= end:
                continue
            normal = WEEKDAYS[day.weekday()]
            run_as = r["run_as"].strip().lower()
            for sid, mask in services.items():
                runs_normally = bool(mask[WEEKDAYS.index(normal)])
                runs_override = run_as != "none" and bool(mask[WEEKDAYS.index(run_as)])
                if runs_normally and not runs_override:
                    rows.append({"service_id": sid, "date": r["date"], "exception_type": 2})
                elif runs_override and not runs_normally:
                    rows.append({"service_id": sid, "date": r["date"], "exception_type": 1})
    return rows


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--out", required=True)
    f.add_argument("--delay", type=float, default=1.0, help="seconds between requests (default 1.0)")
    b = sub.add_parser("build")
    b.add_argument("--raw", required=True)
    out = b.add_mutually_exclusive_group(required=True)
    out.add_argument("--zip", help="write a GTFS zip")
    out.add_argument("--dir", help="write the .txt files into a folder, e.g. raw-data/amman-gtfs-data")
    b.add_argument("--days", type=int, default=28, help="calendar validity window after snapshot (default 28)")
    b.add_argument("--overrides", help="CSV of date,run_as service overrides (holidays)")
    args = ap.parse_args()
    if args.cmd == "fetch":
        fetch(args.out, args.delay)
    else:
        build(args.raw, args.zip, args.days, args.overrides, args.dir)


if __name__ == "__main__":
    main()
