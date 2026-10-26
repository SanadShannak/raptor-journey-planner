"""Built-up land around a network's stops, from OpenStreetMap -> GeoJSON.

The backend's service area (backend/src/utils/serviceArea.js) is where a journey can start or end. Walking reach
of the stops alone leaves most of a town outside it wherever the town has one terminal and no stops of its own --
Ma'an, Tafila, Karak. This extracts the towns themselves, so the area can take in the whole of each town a bus
reaches. Which towns that is, is decided by the backend, against the compiled stops; this only extracts.

From the repository root, after the feed is in raw-data/<network>-gtfs-data/:

    python3 scripts/urban-areas/urban_areas.py --network amman

Writes raw-data/<network>-urban-areas/urban-areas.geojson, which pipeline component 11 compiles. The download is
kept beside it and reused; pass --refresh to fetch a newer one.

Data source: Geofabrik's daily OpenStreetMap extract of the network's country, as shapefiles, from which the land
use layer's residential, commercial, retail and industrial polygons -- the built-up fabric of a town -- within
URBAN_SEARCH_KM of any stop are kept. One file download rather than a query service: Overpass, the obvious
alternative, refuses heavy queries outright whenever it is busy, which is often. Python 3.9+, standard library only.
"""

import argparse
import csv
import json
import math
import os
import struct
import sys
import urllib.request
import zipfile

USER_AGENT = "journey-planner-urban-areas/0.2 (personal journey planner; contact via github)"
# Geofabrik region per network. A network missing here has no built-up land, and its service area is the walking
# reach alone -- right for Helsinki, whose stops are dense enough that it gains little, and whose country extract is
# 1.5 GB against Jordan's 60 MB.
REGIONS = {"amman": "asia/jordan"}
# How far from a stop built-up land is worth keeping. The backend keeps less than this; see serviceArea.js.
URBAN_SEARCH_KM = 9
LANDUSE_LAYER = "gis_osm_landuse_a_free_1"
BUILT_UP = {"residential", "commercial", "retail", "industrial"}
# Grid used only to decide quickly whether a polygon is near some stop.
CELL_DEGREES = 0.05


def near_stops(stops_path):
    """Grid cells within URBAN_SEARCH_KM of some stop."""
    cells = set()
    with open(stops_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            lat, lon = float(row["stop_lat"]), float(row["stop_lon"])
            dlat = URBAN_SEARCH_KM / 111.0
            dlon = URBAN_SEARCH_KM / (111.0 * math.cos(math.radians(lat)))
            for r in range(math.floor((lat - dlat) / CELL_DEGREES), math.floor((lat + dlat) / CELL_DEGREES) + 1):
                for c in range(math.floor((lon - dlon) / CELL_DEGREES), math.floor((lon + dlon) / CELL_DEGREES) + 1):
                    cells.add((r, c))
    return cells


def download(region, dest, refresh):
    if os.path.exists(dest) and not refresh:
        print(f"using {dest} (pass --refresh for a newer extract)")
        return
    url = f"https://download.geofabrik.de/{region}-latest-free.shp.zip"
    print(f"downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    partial = dest + ".part"
    with urllib.request.urlopen(req, timeout=120) as resp, open(partial, "wb") as out:
        while True:
            chunk = resp.read(1 << 20)
            if not chunk:
                break
            out.write(chunk)
    os.replace(partial, dest)


def read_dbf(data):
    """Rows of a dBase III table as dicts of stripped strings."""
    count, header_len, record_len = struct.unpack("<IHH", data[4:12])
    fields, pos = [], 32
    while data[pos] != 0x0D:
        name = data[pos:pos + 11].split(b"\0")[0].decode("ascii")
        fields.append((name, data[pos + 16]))
        pos += 32
    rows = []
    for i in range(count):
        offset = header_len + i * record_len + 1  # skip the deletion flag
        row = {}
        for name, length in fields:
            row[name] = data[offset:offset + length].decode("utf-8", "replace").strip()
            offset += length
        rows.append(row)
    return rows


def read_polygons(data):
    """Each record of a polygon shapefile as a list of rings of (lon, lat), or None for a null shape."""
    shapes, pos = [], 100
    while pos < len(data):
        _, length = struct.unpack(">ii", data[pos:pos + 8])
        content = data[pos + 8:pos + 8 + length * 2]
        pos += 8 + length * 2
        if struct.unpack("<i", content[:4])[0] != 5:
            shapes.append(None)
            continue
        num_parts, num_points = struct.unpack("<ii", content[36:44])
        parts = list(struct.unpack(f"<{num_parts}i", content[44:44 + 4 * num_parts])) + [num_points]
        base = 44 + 4 * num_parts
        points = struct.unpack(f"<{2 * num_points}d", content[base:base + 16 * num_points])
        shapes.append([[(points[2 * k], points[2 * k + 1]) for k in range(parts[p], parts[p + 1])]
                       for p in range(num_parts)])
    return shapes


def is_outer(ring):
    """Shapefile outer rings run clockwise, holes anticlockwise."""
    area = sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(ring, ring[1:]))
    return area < 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--network", required=True, help="e.g. amman; reads raw-data/<network>-gtfs-data/stops.txt")
    ap.add_argument("--refresh", action="store_true", help="download a newer extract even if one is kept")
    args = ap.parse_args()

    region = REGIONS.get(args.network)
    if region is None:
        sys.exit(f"no Geofabrik region for {args.network!r}; add one to REGIONS, or skip this step")

    out_dir = os.path.join("raw-data", f"{args.network}-urban-areas")
    os.makedirs(out_dir, exist_ok=True)
    archive = os.path.join(out_dir, region.replace("/", "-") + "-latest-free.shp.zip")
    download(region, archive, args.refresh)

    with zipfile.ZipFile(archive) as zf:
        shapes = read_polygons(zf.read(f"{LANDUSE_LAYER}.shp"))
        rows = read_dbf(zf.read(f"{LANDUSE_LAYER}.dbf"))
    if len(shapes) != len(rows):
        sys.exit(f"{LANDUSE_LAYER}: {len(shapes)} shapes but {len(rows)} attribute rows")

    near = near_stops(os.path.join("raw-data", f"{args.network}-gtfs-data", "stops.txt"))
    features = []
    for shape, row in zip(shapes, rows):
        if shape is None or row.get("fclass") not in BUILT_UP:
            continue
        for ring in shape:
            if len(ring) < 4 or not is_outer(ring):
                continue
            lon, lat = ring[0]
            if (math.floor(lat / CELL_DEGREES), math.floor(lon / CELL_DEGREES)) not in near:
                continue
            features.append({
                "type": "Feature",
                "properties": {"landuse": row["fclass"], "osm": row.get("osm_id")},
                "geometry": {"type": "Polygon", "coordinates": [[[round(x, 5), round(y, 5)] for x, y in ring]]},
            })

    dest = os.path.join(out_dir, "urban-areas.geojson")
    with open(dest, "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "attribution": "© OpenStreetMap contributors, ODbL",
                   "features": features}, f)
    print(f"wrote {dest}: {len(features)} built-up areas near the stops, of {len(shapes)} land use polygons")


if __name__ == "__main__":
    main()
