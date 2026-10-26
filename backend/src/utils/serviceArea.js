const fs = require("fs");
const path = require("path");
const calculateHaversine = require("../../raptor-engines/utils/calculateHaversine");
const logger = require("./logger");
const serverConfig = require("../serverConfig");
const { getCache } = require("../../memoryCache");

const cache = getCache();

/*
 * The service area: where a journey can start or end.
 *
 * It begins as everywhere within walking reach of a served stop — the test
 * `getNearbyStops.js` applies:
 *
 *   Math.round((haversine * DETOUR_FACTOR) / 10) * 10 <= MAX_WALKING_DISTANCE_METERS
 *
 * which holds for any straight-line distance under 2500.5 / 1.2 m. Copied
 * rather than imported because the engine keeps them private; if either
 * changes there, change it here too.
 *
 * That alone is not a shape anybody can read, and it is not the town. It has
 * holes in the middle of a city wherever the nearest stop is a little over
 * 2 km away, deep bays between bus corridors, and in a town with one terminal
 * — Ma'an, Tafila — it is a circle around the terminal with most of the town
 * outside it. So two things are added:
 *
 * 1. **The towns a bus reaches.** OpenStreetMap's built-up land (fetched by
 *    `scripts/urban-areas/urban_areas.py`, compiled by pipeline component 11)
 *    is joined into towns, and every town the walking reach touches is taken
 *    in whole — as far as URBAN_MAX_METERS beyond the reach, so a sprawl of
 *    villages cannot carry the area across the country.
 * 2. **Closing.** Every bay narrower than twice CLOSE_METERS is filled, and
 *    every hole a town surrounds, while towns further apart than that stay
 *    separate.
 *
 * The result is the shape of each town the network serves. Without the
 * built-up land — a network that never fetched it — it is step 2 alone.
 *
 * The area is the rule, not a picture of one. `getNearbyStops.js` asks
 * {@link isInServiceArea} when it finds no stop in reach, and a point inside
 * is then planned from its nearest few stops, however far the walk. So
 * everything inside the line drawn on the map can be planned from, and
 * everything outside is out of the network.
 */
const MAX_WALKING_DISTANCE_METERS = 2500;
const DETOUR_FACTOR = 1.2;
const REACH_METERS = (MAX_WALKING_DISTANCE_METERS + 5) / DETOUR_FACTOR;
const CLOSE_METERS = 2500;
// How far beyond the walking reach a town the reach touches is taken in
const URBAN_MAX_METERS = 4000;
// Gaps narrower than this between built-up patches are streets and parks:
// the patches are one town
const URBAN_JOIN_METERS = 500;

const urbanAreasPath = path.join(
  __dirname,
  `../../../processed-data/${serverConfig.ACTIVE_NETWORK}-processed-data/urban-areas.processed.json`,
);

/** The built-up land's outer rings, or none — optional, like translations. */
function loadUrbanAreas() {
  if (!fs.existsSync(urbanAreasPath)) {
    logger.info("serviceArea: urban-areas.processed.json not present for this network");
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(urbanAreasPath));
  } catch (error) {
    logger.warn(`serviceArea: urban-areas.processed.json unreadable — ${error.message}`);
    return [];
  }
}

/*
 * The area is a set of 100 m grid cells. Its drawn edge is that set's
 * staircase smoothed by at most SIMPLIFY_TOLERANCE_METERS, which can move the
 * line *outwards* by that much; {@link isInServiceArea} answers yes for a
 * cell's neighbours too, a full cell further, so a point inside the drawn
 * line is always inside the area.
 */
const CELL_METERS = 100;
const SIMPLIFY_TOLERANCE_METERS = 80;
const METERS_PER_DEGREE_LAT = 111320;

/** Stops something calls at; the same rule `/api/stops` applies. */
function servedStops() {
  return cache.stops.filter(
    (stop) => stop && (cache.stopToRoutes[stop.id] ?? []).length > 0,
  );
}

/** Perpendicular distance from p to the segment a–b, in the cell grid's units. */
function distanceToSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker on a closed ring (first point not repeated). */
function simplifyRing(ring, tolerance) {
  if (ring.length < 4) return ring;

  const keep = new Array(ring.length).fill(false);
  // A closed ring has no natural ends, so it is split at its first point and
  // the point furthest from it, and each half simplified on its own.
  let far = 0;
  let farDistance = -1;
  for (let i = 1; i < ring.length; i++) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farDistance) {
      farDistance = d;
      far = i;
    }
  }
  keep[0] = true;
  keep[far] = true;

  const stack = [
    [0, far],
    [far, ring.length],
  ];
  while (stack.length > 0) {
    const [start, end] = stack.pop();
    const a = ring[start];
    const b = ring[end % ring.length];
    let worst = -1;
    let worstDistance = 0;
    for (let i = start + 1; i < end; i++) {
      const d = distanceToSegment(ring[i], a, b);
      if (d > worstDistance) {
        worstDistance = d;
        worst = i;
      }
    }
    if (worst !== -1 && worstDistance > tolerance) {
      keep[worst] = true;
      stack.push([start, worst], [worst, end]);
    }
  }

  return ring.filter((_, i) => keep[i]);
}

/** Twice the signed area: positive for anticlockwise, which is an outer ring here. */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum;
}

function containsPoint(ring, [x, y]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Exact squared Euclidean distance transform in one dimension (Felzenszwalb
 * and Huttenlocher), in place: f[i] becomes min over j of (i-j)^2 + f[j].
 */
function distanceTransform1d(f, n, scratch) {
  const { v, z, d } = scratch;
  const parabola = (q, p) => (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s = parabola(q, v[k]);
    // Never below 0: z[0] is -Infinity.
    while (s <= z[k]) {
      k--;
      s = parabola(q, v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const p = v[k];
    d[q] = (q - p) * (q - p) + f[p];
  }
  for (let q = 0; q < n; q++) f[q] = d[q];
}

/** Squared distance, in cells, from every cell to the nearest `true` one. */
function squaredDistanceTo(grid, rows, cols) {
  const big = 1e12;
  const dist = new Float64Array(rows * cols);
  for (let i = 0; i < grid.length; i++) dist[i] = grid[i] ? 0 : big;
  const longest = Math.max(rows, cols);
  const scratch = {
    v: new Int32Array(longest),
    z: new Float64Array(longest + 1),
    d: new Float64Array(longest),
  };
  const line = new Float64Array(longest);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) line[r] = dist[r * cols + c];
    distanceTransform1d(line, rows, scratch);
    for (let r = 0; r < rows; r++) dist[r * cols + c] = line[r];
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) line[c] = dist[r * cols + c];
    distanceTransform1d(line, cols, scratch);
    for (let c = 0; c < cols; c++) dist[r * cols + c] = line[c];
  }
  return dist;
}

/** Morphological closing with a disc of `radius` cells. */
function closeGrid(grid, rows, cols, radius) {
  const r2 = radius * radius;
  const toGrid = squaredDistanceTo(grid, rows, cols);
  const outside = new Uint8Array(rows * cols);
  for (let i = 0; i < outside.length; i++) outside[i] = toGrid[i] > r2 ? 1 : 0;
  const toOutside = squaredDistanceTo(outside, rows, cols);
  const closed = new Uint8Array(rows * cols);
  for (let i = 0; i < closed.length; i++) closed[i] = toOutside[i] > r2 ? 1 : 0;
  return closed;
}

/** Marks every cell of `grid` connected to a `seed` cell, through `grid`. */
function connectedTo(grid, seed, rows, cols) {
  const kept = new Uint8Array(rows * cols);
  const stack = [];
  for (let i = 0; i < grid.length; i++) if (grid[i] && seed[i]) stack.push(i);
  while (stack.length > 0) {
    const i = stack.pop();
    if (kept[i] || !grid[i]) continue;
    kept[i] = 1;
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (r > 0) stack.push(i - cols);
    if (r < rows - 1) stack.push(i + cols);
    if (c > 0) stack.push(i - 1);
    if (c < cols - 1) stack.push(i + 1);
  }
  return kept;
}

/** Sets every cell the border cannot reach through open ground: the holes. */
function fillHoles(grid, rows, cols) {
  const open = new Uint8Array(rows * cols);
  const stack = [];
  for (let r = 0; r < rows; r++) stack.push(r * cols, r * cols + cols - 1);
  for (let c = 0; c < cols; c++) stack.push(c, (rows - 1) * cols + c);
  while (stack.length > 0) {
    const i = stack.pop();
    if (open[i] || grid[i]) continue;
    open[i] = 1;
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (r > 0) stack.push(i - cols);
    if (r < rows - 1) stack.push(i + cols);
    if (c > 0) stack.push(i - 1);
    if (c < cols - 1) stack.push(i + 1);
  }
  for (let i = 0; i < grid.length; i++) if (!open[i]) grid[i] = 1;
}

/**
 * The area, from the cells in walking reach and the cells of built-up land.
 *
 * Built-up land is first joined into towns (closing by URBAN_JOIN_METERS);
 * a town is kept when the walking reach touches it, and only as far as
 * URBAN_MAX_METERS beyond the reach. Then the whole is closed by
 * CLOSE_METERS and its holes filled — see the top of this file.
 *
 * Answers as a byte per cell over the area's bounding box, which is a few
 * megabytes where a set of cell keys was several times that, and a lookup is
 * one array read.
 */
function buildArea(reached, urban) {
  const closeRadius = Math.round(CLOSE_METERS / CELL_METERS);
  const urbanRadius = Math.round(URBAN_MAX_METERS / CELL_METERS);
  const joinRadius = Math.round(URBAN_JOIN_METERS / CELL_METERS);

  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  const cells = [...reached].map((id) => id.split("_").map(Number));
  for (const [row, col] of cells) {
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
  }
  // Room for a town beyond the reach, and for closing around it.
  const pad = urbanRadius + closeRadius + joinRadius + 2;
  const rows = maxRow - minRow + 1 + 2 * pad;
  const cols = maxCol - minCol + 1 + 2 * pad;
  const firstRow = minRow - pad;
  const firstCol = minCol - pad;
  const at = (row, col) => {
    const r = row - firstRow;
    const c = col - firstCol;
    return r >= 0 && r < rows && c >= 0 && c < cols ? r * cols + c : -1;
  };

  const area = new Uint8Array(rows * cols);
  for (const [row, col] of cells) area[at(row, col)] = 1;

  if (urban.size > 0) {
    const built = new Uint8Array(rows * cols);
    for (const id of urban) {
      const [row, col] = id.split("_").map(Number);
      const i = at(row, col);
      if (i !== -1) built[i] = 1;
    }
    const towns = closeGrid(built, rows, cols, joinRadius);
    const served = connectedTo(towns, area, rows, cols);
    const fromReach = squaredDistanceTo(area, rows, cols);
    const limit = urbanRadius * urbanRadius;
    for (let i = 0; i < area.length; i++) {
      if (served[i] && fromReach[i] <= limit) area[i] = 1;
    }
  }

  const closed = closeGrid(area, rows, cols, closeRadius);
  fillHoles(closed, rows, cols);

  return {
    rows,
    cols,
    firstRow,
    firstCol,
    has(row, col) {
      const i = at(row, col);
      return i !== -1 && closed[i] === 1;
    },
  };
}

/** The cells whose centres lie inside any ring, plus each ring's own corners. */
function rasteriseRings(rings, cellLat, cellLon) {
  const cells = new Set();
  for (const ring of rings) {
    let minLat = Infinity;
    let maxLat = -Infinity;
    for (const [lon, lat] of ring) {
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      // A patch smaller than a cell still marks the cell it is in
      cells.add(`${Math.floor(lat / cellLat)}_${Math.floor(lon / cellLon)}`);
    }
    for (let row = Math.floor(minLat / cellLat); row <= Math.floor(maxLat / cellLat); row++) {
      const y = (row + 0.5) * cellLat;
      const crossings = [];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y) crossings.push(xi + ((y - yi) * (xj - xi)) / (yj - yi));
      }
      crossings.sort((a, b) => a - b);
      for (let k = 0; k + 1 < crossings.length; k += 2) {
        const first = Math.ceil(crossings[k] / cellLon - 0.5);
        const last = Math.floor(crossings[k + 1] / cellLon - 0.5);
        for (let col = first; col <= last; col++) cells.add(`${row}_${col}`);
      }
    }
  }
  return cells;
}

/**
 * The service area as cells, and as a GeoJSON MultiPolygon to draw.
 *
 * Computed once from the stops in memory, so it always matches the loaded
 * feed. Being inside it means the planner will not answer OUT_OF_BOUNDS; it
 * does not promise a vehicle runs at every hour — NO_ROUTE_FOUND is still a
 * real answer at three in the morning.
 */
function computeServiceArea() {
  const startedAt = performance.now();
  const stops = servedStops();
  if (stops.length === 0) return null;

  const meanLat = stops.reduce((sum, stop) => sum + stop.lat, 0) / stops.length;
  const cellLat = CELL_METERS / METERS_PER_DEGREE_LAT;
  const cellLon = cellLat / Math.cos((meanLat * Math.PI) / 180);

  // A cell is in reach when its centre is.
  const reached = new Set();
  const key = (row, col) => `${row}_${col}`;

  for (const stop of stops) {
    const lonScale = Math.cos((stop.lat * Math.PI) / 180);
    const reach = REACH_METERS;

    const latSpan = reach / METERS_PER_DEGREE_LAT;
    const lonSpan = reach / (METERS_PER_DEGREE_LAT * lonScale);
    const firstRow = Math.floor((stop.lat - latSpan) / cellLat);
    const lastRow = Math.floor((stop.lat + latSpan) / cellLat);
    const firstCol = Math.floor((stop.lon - lonSpan) / cellLon);
    const lastCol = Math.floor((stop.lon + lonSpan) / cellLon);

    for (let row = firstRow; row <= lastRow; row++) {
      const centreLat = (row + 0.5) * cellLat;
      for (let col = firstCol; col <= lastCol; col++) {
        const id = key(row, col);
        if (reached.has(id)) continue;
        const centreLon = (col + 0.5) * cellLon;
        if (calculateHaversine(stop.lat, stop.lon, centreLat, centreLon) <= reach) {
          reached.add(id);
        }
      }
    }
  }

  const urban = rasteriseRings(loadUrbanAreas(), cellLat, cellLon);
  const covered = buildArea(reached, urban);

  /*
   * The edge of the union: every cell side with an uncovered neighbour,
   * directed so the covered cell is on its left. Outer rings then run
   * anticlockwise and holes clockwise, which is the orientation GeoJSON asks
   * for. Vertices are grid corners as [col, row], exact integers, so edges
   * join up by equality.
   */
  const outgoing = new Map();
  const addEdge = (from, to) => {
    const id = `${from[0]}_${from[1]}`;
    if (!outgoing.has(id)) outgoing.set(id, []);
    outgoing.get(id).push(to);
  };

  for (let row = covered.firstRow; row < covered.firstRow + covered.rows; row++) {
    for (let col = covered.firstCol; col < covered.firstCol + covered.cols; col++) {
      if (!covered.has(row, col)) continue;
      if (!covered.has(row - 1, col)) addEdge([col, row], [col + 1, row]);
      if (!covered.has(row, col + 1)) addEdge([col + 1, row], [col + 1, row + 1]);
      if (!covered.has(row + 1, col)) addEdge([col + 1, row + 1], [col, row + 1]);
      if (!covered.has(row, col - 1)) addEdge([col, row + 1], [col, row]);
    }
  }

  const rings = [];
  for (const [startId, targets] of outgoing) {
    while (targets.length > 0) {
      const start = startId.split("_").map(Number);
      const ring = [start];
      let current = targets.pop();
      while (`${current[0]}_${current[1]}` !== startId) {
        ring.push(current);
        // Where two cells touch only at a corner, two edges leave the same
        // vertex; either choice closes a ring, so the last one is taken.
        current = outgoing.get(`${current[0]}_${current[1]}`).pop();
      }
      rings.push(ring);
    }
  }

  // Smoothed in metres, then turned into degrees.
  const toleranceCells = SIMPLIFY_TOLERANCE_METERS / CELL_METERS;
  const smoothed = rings
    .map((ring) => simplifyRing(ring, toleranceCells))
    .filter((ring) => ring.length >= 3);

  const outers = [];
  const holes = [];
  for (const ring of smoothed) {
    (signedArea(ring) > 0 ? outers : holes).push(ring);
  }

  // Smallest first, so a hole inside an island inside another area's hole is
  // given to the island rather than to the area around both.
  const polygons = outers
    .sort((a, b) => signedArea(a) - signedArea(b))
    .map((ring) => [ring]);
  for (const hole of holes) {
    const owner = polygons.find((polygon) => containsPoint(polygon[0], hole[0]));
    if (owner) owner.push(hole);
  }

  const toLonLat = ([col, row]) => [
    Number((col * cellLon).toFixed(5)),
    Number((row * cellLat).toFixed(5)),
  ];
  // GeoJSON rings repeat their first point at the end.
  const close = (ring) => {
    const points = ring.map(toLonLat);
    return [...points, points[0]];
  };

  const feature = {
    type: "Feature",
    properties: {
      stopCount: stops.length,
      walkingDistanceMeters: MAX_WALKING_DISTANCE_METERS,
    },
    geometry: {
      type: "MultiPolygon",
      coordinates: polygons.map((polygon) => polygon.map(close)),
    },
  };

  logger.info(
    `serviceArea: ${polygons.length} areas from ${stops.length} stops in ${(performance.now() - startedAt).toFixed(0)}ms`,
  );
  return { feature, cells: covered, cellLat, cellLon };
}

/*
 * Computed at startup, with the rest of the network, because the engine asks
 * about it: a planner request must never be the one that pays for it.
 */
const serviceArea = computeServiceArea();

/** The service area as GeoJSON, or null for a feed with no served stops. */
function getServiceArea() {
  return serviceArea?.feature ?? null;
}

/**
 * Whether a point is inside the service area. One lookup of a 3×3 block of
 * cells — the neighbours being the margin the smoothed drawing needs, see
 * CELL_METERS — so it costs nothing next to a route search.
 */
function isInServiceArea(lat, lon) {
  if (serviceArea === null) return false;
  const { cells, cellLat, cellLon } = serviceArea;
  const row = Math.floor(lat / cellLat);
  const col = Math.floor(lon / cellLon);
  for (let dRow = -1; dRow <= 1; dRow++) {
    for (let dCol = -1; dCol <= 1; dCol++) {
      if (cells.has(row + dRow, col + dCol)) return true;
    }
  }
  return false;
}

module.exports = { getServiceArea, isInServiceArea };
