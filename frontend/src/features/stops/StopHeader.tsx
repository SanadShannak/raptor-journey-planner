import { useLocale } from '../../i18n';
import type { Dictionary, Message } from '../../i18n/dictionary';
import type { ServingLine, StopIdentity } from '../../types/stop';
import { familyFor } from '../journey/modeVisuals';

interface Props {
  stop: StopIdentity;
  /**
   * Only to choose the noun for {@link StopIdentity.platform}. The lines
   * themselves are drawn by the filter below, which is the one place they
   * appear — listing them here as well put the same set on screen twice, and
   * the copy that could be pressed was the lower one.
   */
  servingLines: ServingLine[];
}

/**
 * What to call the number printed on the stop.
 *
 * GTFS gives a designation and never says what it names — a platform, a track,
 * a stand. The mode is the only honest guide, and it is the one the networks
 * themselves use: HSL prints *raide* on a train and *laituri* on a bus stand.
 *
 * The same rule as `platformLabel` in the itinerary, reading the modes off the
 * lines that call here rather than off a leg. Deliberately not shared with it:
 * that one asks a strip-map row what runs through it, this one asks a stop what
 * stops at it, and folding them together would mean a function that takes
 * either and understands neither.
 */
function platformLabel(lines: ServingLine[], strings: Dictionary): Message {
  return lines.some((line) => familyFor(line.routeType) === 'train')
    ? strings.planner.track
    : strings.planner.platform;
}

/**
 * Who this stop is.
 *
 * Everything the agency published about the place itself, before anything about
 * what leaves it.
 *
 * Accessibility is **tri-state and stays that way**. `null` means the agency
 * never published it, which is not a softer "no": telling a wheelchair user a
 * stop is unusable when the truth is unknown is worse than saying nothing.
 */
export function StopHeader({ stop, servingLines }: Props) {
  const { strings, t } = useLocale();

  const facts = [
    stop.code === null ? null : t(strings.stops.stopCode, { code: stop.code }),
    stop.platform === null
      ? null
      : t(platformLabel(servingLines, strings), { platform: stop.platform }),
    stop.fareZone === null
      ? null
      : t(strings.stops.fareZone, { zone: stop.fareZone }),
  ].filter((fact): fact is string => fact !== null);

  return (
    <header className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h1 dir="auto" className="text-2xl font-semibold tracking-tight text-balance">
          {stop.name}
        </h1>

        {stop.description !== null && (
          <p dir="auto" className="text-content-muted text-sm">
            {stop.description}
          </p>
        )}
      </div>

      {facts.length > 0 && (
        <ul className="text-content-muted flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {facts.map((fact) => (
            <li
              key={fact}
              className="rounded-control bg-surface-muted px-2 py-0.5 tabular-nums"
            >
              {fact}
            </li>
          ))}
        </ul>
      )}

      {/*
        Never colour alone: the icon says accessible or not, and the words say
        it again. A third state exists and is written out rather than left off,
        because a missing line reads as "fine" to anyone who needs the answer.
      */}
      <p className="flex items-center gap-1.5 text-sm">
        <AccessIcon state={stop.wheelchairAccessible} />
        <span
          className={
            stop.wheelchairAccessible === null ? 'text-content-muted' : 'text-content'
          }
        >
          {t(
            stop.wheelchairAccessible === true
              ? strings.stops.wheelchairAccessible
              : stop.wheelchairAccessible === false
                ? strings.stops.wheelchairNotAccessible
                : strings.stops.wheelchairUnknown,
          )}
        </span>
      </p>

    </header>
  );
}

/**
 * Three states, three shapes — a tick, a cross, and a question. Not three
 * colours: the words beside them carry the meaning, and these only make the
 * line findable at a glance.
 */
function AccessIcon({ state }: { state: boolean | null }) {
  const tone =
    state === true ? 'text-success' : state === false ? 'text-danger' : 'text-content-muted';

  return (
    <svg
      viewBox="0 0 20 20"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${tone} flex-none`}
    >
      {state === true ? (
        <path d="M4 10.5l4 4 8-8" />
      ) : state === false ? (
        <path d="M5 5l10 10M15 5L5 15" />
      ) : (
        <>
          <path d="M7.5 7.5a2.5 2.5 0 115 0c0 1.7-2.5 2-2.5 3.5" />
          <path d="M10 14.5v.01" />
        </>
      )}
    </svg>
  );
}
