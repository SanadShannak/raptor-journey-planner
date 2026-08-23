import type {
  ClockTime,
  Journey,
  JourneyLeg,
  Stop,
} from '../../types/journey';
import { familyFor } from './modeVisuals';
import { legTimings } from './journeyTiming';

/**
 * An itinerary rewritten as the alternating nodes and segments a strip map is
 * actually made of.
 *
 * The API gives legs, and a leg is a *segment* — it has no place to put the
 * moment you arrive somewhere as distinct from the moment you leave it. Drawn
 * straight from legs, a change reads as one point in space and time, when what
 * really happens is that you get off a bus at 18:24, stand on the pavement for
 * six minutes, and get on a tram at 18:30. Two events, one stop.
 *
 * So the journey is expanded here: every leg contributes a segment, and a stop
 * appears **twice** — once as an arrival and once as a departure — whenever
 * there is a wait between them, with the wait drawn as its own segment in
 * between. Where the wait is zero the two events coincide and the stop is one
 * node, which is also the truth.
 *
 * The result alternates strictly, node → segment → node → …, beginning and
 * ending with a node. That invariant is what lets the drawing be simple: each
 * node knows the segment above and below it, so the coloured line can run from
 * one circle to the next without a gap or an overlap at either end.
 */

/** How a stretch of the spine is drawn between two nodes. */
export type Spine =
  | { kind: 'transit'; family: string }
  | { kind: 'walk' }
  | { kind: 'wait' };

export interface NodeRow {
  type: 'node';
  key: string;
  name: string;
  /** The service date this moment falls on; an itinerary may cross midnight. */
  date: string;
  /**
   * The line under the name.
   *
   * For a stop that is the code printed on the pole, which is what tells six
   * stops called "Pasila" apart. The two ends of the journey are not stops at
   * all but the traveller's own pins, so there it is where the place they
   * chose actually is — the geocoder's own second line, the same one they read
   * when they picked it out of the suggestions.
   */
  detail: string | null;
  time: ClockTime;
  role: 'origin' | 'via' | 'destination';
  /** The segment arriving at this node; null at the origin. */
  above: Spine | null;
  /** The segment leaving it; null at the destination. */
  below: Spine | null;
}

export interface SegmentRow {
  type: 'segment';
  key: string;
  spine: Spine;
  leg: JourneyLeg;
  /**
   * How long it takes, measured between the node above and the node below.
   *
   * Not the leg's own reported duration: that is rounded to the nearest minute
   * while the two times either side of it are rounded outward, so printing it
   * here put "9 min" between a pair of times ten minutes apart. See
   * {@link legTimings}.
   */
  minutes: number;
  isFirst: boolean;
  isLast: boolean;
}

export interface WaitRow {
  type: 'wait';
  key: string;
  spine: Spine;
  /** The gap between the arrival above and the departure below, in minutes. */
  minutes: number;
  /** The stop being waited at, named so the row stands on its own. */
  place: string;
}

export type ItineraryRow = NodeRow | SegmentRow | WaitRow;

/**
 * The synthetic stops the engine uses for a dropped pin.
 *
 * `name` is the literal `"ORIGIN"` / `"TARGET"`, which is a placeholder rather
 * than a place — showing it to a traveller would be worse than showing
 * nothing. The `code` is the reliable tell, per the API contract.
 */
const PIN_CODES = new Set(['ORIGIN_PIN', 'TARGET_PIN']);

function isPin(stop: Stop): boolean {
  return stop.code !== null && PIN_CODES.has(stop.code);
}

/** The traveller's own words for their pin, falling back to the engine's stop. */
function placeName(stop: Stop, chosenLabel: string | null): string {
  if (!isPin(stop)) return stop.name;
  return chosenLabel ?? stop.name;
}

function spineFor(leg: JourneyLeg): Spine {
  return leg.mode === 'TRANSIT'
    ? { kind: 'transit', family: familyFor(leg.routeType) }
    : { kind: 'walk' };
}

/**
 * One end of the journey as the traveller chose it.
 *
 * Both halves come from the place they picked, not from the engine: it answers
 * with `ORIGIN` and `TARGET`, which are placeholders for a coordinate rather
 * than names of anywhere.
 */
export interface JourneyEnd {
  /** What they called it. Null when they dropped a pin and named nothing. */
  name: string | null;
  /** Where it is, in the geocoder's words. Null when it offered none. */
  context: string | null;
}

interface Labels {
  origin: JourneyEnd;
  destination: JourneyEnd;
  /** Stands in for a pin nobody named — "Selected location". */
  fallback: string;
}

/**
 * The name and second line for a node.
 *
 * A real stop speaks for itself. A pin cannot — its name is a placeholder and
 * its code is the tell that identifies it as one — so both lines come from
 * what the traveller chose instead.
 */
function endOf(stop: Stop, end: JourneyEnd, fallback: string) {
  if (!isPin(stop)) return { name: stop.name, detail: stop.code };
  return { name: end.name ?? fallback, detail: end.context };
}

export function itineraryRows(journey: Journey, labels: Labels): ItineraryRow[] {
  const rows: ItineraryRow[] = [];
  /*
   * Every duration below is measured between the times this puts on the page,
   * rather than taken from the leg's own reported figure. The two are rounded
   * for different purposes and can disagree by up to two minutes, which is
   * what produced "arrive 01:49, wait 1 minute, leave 01:49".
   */
  const timings = legTimings(journey);
  const lastIndex = timings.length - 1;

  timings.forEach((timing, index) => {
    const { leg } = timing;
    const isFirst = index === 0;
    const isLast = index === lastIndex;

    if (isFirst) {
      rows.push({
        type: 'node',
        key: `start-${timing.start.time}`,
        ...endOf(leg.fromStop, labels.origin, labels.fallback),
        date: timing.start.date,
        time: timing.start.time,
        role: 'origin',
        above: null,
        below: null,
      });
    } else if (timing.waitMinutes > 0) {
      /*
       * The stop splits in two. The node already pushed carries the arrival;
       * this adds the wait and a second node for the departure, so both times
       * are on the page at the place they belong to.
       *
       * A wait of zero leaves it as one node, which is the truth whenever the
       * rounding closed the gap — and the only reading that does not
       * contradict the clock printed beside it.
       */
      rows.push({
        type: 'wait',
        key: `wait-${index}-${timing.start.time}`,
        spine: { kind: 'wait' },
        minutes: timing.waitMinutes,
        place: placeName(leg.fromStop, null),
      });
      rows.push({
        type: 'node',
        key: `depart-${index}-${timing.start.time}`,
        name: placeName(leg.fromStop, null),
        detail: isPin(leg.fromStop) ? null : leg.fromStop.code,
        date: timing.start.date,
        time: timing.start.time,
        role: 'via',
        above: null,
        below: null,
      });
    }

    rows.push({
      type: 'segment',
      key: `leg-${index}-${timing.start.time}`,
      spine: spineFor(leg),
      leg,
      minutes: timing.minutes,
      isFirst,
      isLast,
    });

    rows.push({
      type: 'node',
      key: `arrive-${index}-${timing.end.time}`,
      ...(isLast
        ? endOf(leg.toStop, labels.destination, labels.fallback)
        : {
            name: placeName(leg.toStop, null),
            detail: isPin(leg.toStop) ? null : leg.toStop.code,
          }),
      date: timing.end.date,
      time: timing.end.time,
      role: isLast ? 'destination' : 'via',
      above: null,
      below: null,
    });
  });

  /*
   * Neighbours resolved in one pass afterwards rather than guessed at while
   * building: a node cannot know what follows it until the next leg has been
   * looked at, and the alternation guarantees the neighbours are exactly the
   * adjacent entries.
   */
  return rows.map((row, index) => {
    if (row.type !== 'node') return row;
    const before = rows[index - 1];
    const after = rows[index + 1];
    return {
      ...row,
      above: before !== undefined && before.type !== 'node' ? before.spine : null,
      below: after !== undefined && after.type !== 'node' ? after.spine : null,
    };
  });
}
