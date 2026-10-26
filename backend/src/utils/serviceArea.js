const calculateHaversine = require("../../raptor-engines/utils/calculateHaversine");
const logger = require("./logger");
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
 * That alone is not a shape anybody can read. It has holes in the middle of
 * the city wherever the nearest stop is a little over 2 km away, and deep bays
 * between bus corridors, so moving a pin a few hundred metres flipped a
 * journey from planned to refused for no reason a map could show. So the
 * reach is *closed*: every bay narrower than twice CLOSE_METERS is filled, and
 * every hole a town surrounds is filled, while towns further apart than that
 * stay separate. The result is the shape of each town the network serves.
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

/**
 * Morphological closing with a disc of `radius` cells, then every hole filled.
 *
 * Closing fills a bay or gap narrower than twice the radius and leaves the
 * outer edge where it was; it never joins two places further apart than that.
 * Filling holes then takes in anything the city surrounds completely.
 *
 * Answers as a byte per cell over the area's bounding box, which is a few
 * megabytes where a set of cell keys was several times that, and a lookup is
 * one array read.
 */
function closeCells(covered, radius) {
  let minRow = Infinity;
  let maxRow = -Infinity;
  let minCol = Infinity;
  let maxCol = -Infinity;
  const cells = [...covered].map((id) => id.split("_").map(Number));
  for (const [row, col] of cells) {
    minRow = Math.min(minRow, row);
    maxRow = Math.max(maxRow, row);
    minCol = Math.min(minCol, col);
    maxCol = Math.max(maxCol, col);
  }
  const pad = radius + 2;
  const rows = maxRow - minRow + 1 + 2 * pad;
  const cols = maxCol - minCol + 1 + 2 * pad;
  const at = (row, col) => (row - minRow + pad) * cols + (col - minCol + pad);

  const grid = new Uint8Array(rows * cols);
  for (const [row, col] of cells) grid[at(row, col)] = 1;

  const r2 = radius * radius;
  const toCovered = squaredDistanceTo(grid, rows, cols);
  const outside = new Uint8Array(rows * cols);
  for (let i = 0; i < outside.length; i++) outside[i] = toCovered[i] > r2 ? 1 : 0;
  const toOutside = squaredDistanceTo(outside, rows, cols);
  const closed = new Uint8Array(rows * cols);
  for (let i = 0; i < closed.length; i++) closed[i] = toOutside[i] > r2 ? 1 : 0;

  // Flood the open ground in from the border; whatever it cannot reach is a hole.
  const reached = new Uint8Array(rows * cols);
  const stack = [];
  for (let r = 0; r < rows; r++) stack.push(r * cols, r * cols + cols - 1);
  for (let c = 0; c < cols; c++) stack.push(c, (rows - 1) * cols + c);
  while (stack.length > 0) {
    const i = stack.pop();
    if (reached[i] || closed[i]) continue;
    reached[i] = 1;
    const r = Math.floor(i / cols);
    const c = i % cols;
    if (r > 0) stack.push(i - cols);
    if (r < rows - 1) stack.push(i + cols);
    if (c > 0) stack.push(i - 1);
    if (c < cols - 1) stack.push(i + 1);
  }

  for (let i = 0; i < closed.length; i++) {
    if (!reached[i]) closed[i] = 1;
  }
  const firstRow = minRow - pad;
  const firstCol = minCol - pad;
  return {
    rows,
    cols,
    firstRow,
    firstCol,
    has(row, col) {
      const r = row - firstRow;
      const c = col - firstCol;
      return r >= 0 && r < rows && c >= 0 && c < cols && closed[r * cols + c] === 1;
    },
  };
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

  const covered = closeCells(reached, Math.round(CLOSE_METERS / CELL_METERS));

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
