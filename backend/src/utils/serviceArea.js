const calculateHaversine = require("../../raptor-engines/utils/calculateHaversine");
const logger = require("./logger");
const { getCache } = require("../../memoryCache");

const cache = getCache();

/*
 * How far from a stop a coordinate may be and still be planned from.
 *
 * Mirrors `getNearbyStops.js`, which answers ORIGIN_OUT_OF_BOUNDS and
 * DESTINATION_OUT_OF_BOUNDS when no stop passes this test:
 *
 *   Math.round((haversine * DETOUR_FACTOR) / 10) * 10 <= MAX_WALKING_DISTANCE_METERS
 *
 * which holds for any straight-line distance under 2500.5 / 1.2 m. Copied
 * rather than imported because the engine keeps them private; if either
 * changes there, change it here too, or the outline drawn on the map stops
 * meaning what it says.
 */
const MAX_WALKING_DISTANCE_METERS = 2500;
const DETOUR_FACTOR = 1.2;
const REACH_METERS = (MAX_WALKING_DISTANCE_METERS + 5) / DETOUR_FACTOR;

/*
 * The area is drawn as a union of grid cells, so its edge is a staircase
 * that is then smoothed. Both steps can only ever pull the edge *inwards*
 * once these margins are taken: a cell is counted only when it lies wholly
 * inside a stop's reach, and smoothing moves the line by less than the
 * margin left for it. A point inside the outline therefore always has a stop
 * in reach — the promise the outline exists to make. The cost is that the
 * outline sits up to ~150 m inside the true edge, which is invisible at the
 * zooms it is read at.
 */
const CELL_METERS = 100;
const SIMPLIFY_TOLERANCE_METERS = 50;
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
 * Where on the ground a journey can start or end: everywhere within walking
 * reach of a stop that something calls at, as a GeoJSON MultiPolygon.
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

  /*
   * A cell is inside when its centre is within reach less half its own
   * diagonal (so its corners are too) less the smoothing margin. The
   * diagonal is measured at the stop's own latitude, where a degree of
   * longitude is a different length from the mean one used for the grid.
   */
  const covered = new Set();
  const key = (row, col) => `${row}_${col}`;

  for (const stop of stops) {
    const lonScale = Math.cos((stop.lat * Math.PI) / 180);
    const cellWidthMeters = cellLon * METERS_PER_DEGREE_LAT * lonScale;
    const halfDiagonal = Math.hypot(CELL_METERS, cellWidthMeters) / 2;
    const reach = REACH_METERS - halfDiagonal - SIMPLIFY_TOLERANCE_METERS;

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
        if (covered.has(id)) continue;
        const centreLon = (col + 0.5) * cellLon;
        if (calculateHaversine(stop.lat, stop.lon, centreLat, centreLon) <= reach) {
          covered.add(id);
        }
      }
    }
  }

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

  for (const id of covered) {
    const [row, col] = id.split("_").map(Number);
    if (!covered.has(key(row - 1, col))) addEdge([col, row], [col + 1, row]);
    if (!covered.has(key(row, col + 1))) addEdge([col + 1, row], [col + 1, row + 1]);
    if (!covered.has(key(row + 1, col))) addEdge([col + 1, row + 1], [col, row + 1]);
    if (!covered.has(key(row, col - 1))) addEdge([col, row + 1], [col, row]);
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

  const area = {
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
  return area;
}

let serviceArea;

/** The service area, computed on first use and kept: the feed cannot change while the server runs. */
function getServiceArea() {
  if (serviceArea === undefined) serviceArea = computeServiceArea();
  return serviceArea;
}

module.exports = { getServiceArea };
