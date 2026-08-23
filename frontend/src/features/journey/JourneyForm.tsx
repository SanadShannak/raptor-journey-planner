import { useEffect, useRef, useState } from 'react';
import { formatNumber, useLocale } from '../../i18n';
import {
  WALKING_PACES,
  WALKING_PACE_ORDER,
  type WalkingPace,
} from '../../config/journey';
import type { GeoBounds } from '../../config/geocoding';
import { isReady, searchSignature, type JourneyFormValues } from './journeySearch';
import { PlaceInput } from './PlaceInput';
import { UseMyLocationButton } from './UseMyLocationButton';
import { DateSelect } from './DateSelect';
import { TimeSelect } from './TimeSelect';
import { WalkIcon } from './modeIcons';

interface Props {
  values: JourneyFormValues;
  onChange: (values: JourneyFormValues) => void;
  /** Runs whenever the form is complete and something in it changed. */
  onSearch: () => void;
  /**
   * Sets the date and time to the network's own clock. Null while the network
   * has not said what that clock is — there is nothing honest to set it to,
   * and the browser's own "now" is a different city's.
   */
  onLeaveNow: (() => void) | null;
  validDates: string[];
  /** Today on the network's clock, for the relative date labels. */
  today: string | null;
  /** Keeps place search inside the network's area. */
  bounds: GeoBounds | null;
  /** Turned off while the routing service is unreachable. */
  disabled?: boolean | undefined;
}

/**
 * The journey search.
 *
 * There is no submit button: a complete form searches itself, and changing any
 * field searches again. The button existed only to say "I have finished
 * filling this in", and with four discrete controls — two of which are chosen
 * from a list — that moment is already unambiguous. Nothing here fires on a
 * keystroke; a place only counts once it has been picked.
 */
export function JourneyForm({
  values,
  onChange,
  onSearch,
  onLeaveNow,
  validDates,
  today,
  bounds,
  disabled,
}: Props) {
  const locale = useLocale();
  const { strings, t } = locale;

  const lastSearched = useRef<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isReady(values)) return;
    const current = searchSignature(values);
    if (current === lastSearched.current) return;
    lastSearched.current = current;
    onSearch();
  }, [values, onSearch]);

  const paceLabels: Record<WalkingPace, string> = {
    slow: t(strings.planner.speedSlow),
    calm: t(strings.planner.speedCalm),
    average: t(strings.planner.speedAverage),
    fast: t(strings.planner.speedFast),
  };

  function set<K extends keyof JourneyFormValues>(
    key: K,
    value: JourneyFormValues[K],
  ) {
    onChange({ ...values, [key]: value });
  }

  const off = disabled ?? false;

  return (
    /*
     * Still a <form>: it gives the fields a group, and Enter behaves. Submit is
     * swallowed because the search has already happened.
     */
    <form onSubmit={(event) => event.preventDefault()} className="flex flex-col gap-3">
      {/*
        The two fields and the swap sit in two columns, so the swap has its own
        gutter rather than stacking under whatever the origin field puts at its
        end.
      */}
      <div className="flex items-stretch gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <PlaceInput
            label={t(strings.planner.origin)}
            role="origin"
            bounds={bounds}
            value={values.origin}
            disabled={off}
            onChange={(place) => set('origin', place)}
            action={
              <UseMyLocationButton
                disabled={off}
                onLocated={(place) => set('origin', place)}
                onMessage={setLocationMessage}
              />
            }
            note={
              locationMessage !== null && (
                <p role="status" className="text-danger text-sm">
                  {locationMessage}
                </p>
              )
            }
          />
          <PlaceInput
            label={t(strings.planner.destination)}
            role="destination"
            bounds={bounds}
            value={values.destination}
            disabled={off}
            onChange={(place) => set('destination', place)}
          />
        </div>

        {/*
          A vertical exchange arrow: it means "these two swap", which holds in
          either reading direction, so it must not mirror the way a directional
          arrow would.
        */}
        <button
          type="button"
          disabled={off}
          onClick={() =>
            onChange({
              ...values,
              origin: values.destination,
              destination: values.origin,
            })
          }
          aria-label={t(strings.planner.swap)}
          className="rounded-control border-border-strong bg-surface text-content-muted hover:text-brand-500 hover:border-brand-500 focus-visible:outline-brand-500 mt-5 flex h-9 w-9 flex-none cursor-pointer items-center justify-center self-center border focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M8 4v16M8 20l-3-3M8 20l3-3M16 20V4M16 4l-3 3M16 4l3 3" />
          </svg>
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <DateSelect
          label={t(strings.planner.date)}
          value={values.date}
          disabled={off}
          onChange={(date) => set('date', date)}
          options={validDates}
          today={today}
        />
        <TimeSelect
          label={t(strings.planner.time)}
          value={values.time}
          disabled={off}
          onChange={(time) => set('time', time)}
        />
      </div>

      {/*
        Setting both fields at once is the single most common thing anyone
        wants from them, and doing it by hand means two dropdowns. Absent
        rather than disabled while the network's clock is unknown: a control
        that cannot answer honestly should not be offered.
      */}
      {onLeaveNow !== null && (
        <button
          type="button"
          onClick={onLeaveNow}
          disabled={off}
          className="rounded-control border-border-strong bg-surface-muted text-content hover:border-brand-500 hover:text-brand-500 focus-visible:outline-brand-500 inline-flex cursor-pointer items-center gap-1.5 self-start border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <svg
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5V12l3 2" />
          </svg>
          {t(strings.planner.leaveNow)}
        </button>
      )}

      <fieldset disabled={off} className="flex flex-col disabled:opacity-60">
        <legend className="text-content-muted mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <WalkIcon size={15} />
          {t(strings.planner.walkingSpeed)}
        </legend>
        {/*
          Radios that look like radios.

          They were cards before — four filled tiles, each carrying its own
          icon — which gave a secondary preference the visual weight of the
          origin and destination fields, and made the selected one look like a
          button that had been pressed rather than an option that had been
          chosen. A ring and a dot is the control every visitor already knows,
          and it leaves the pace names as the thing being read.

          The dot follows React's own state rather than a `peer-checked:`
          rule, because the state is right here; `peer-focus-visible` still
          comes off the input, which is the one thing CSS has to answer for.
        */}
        <div className="-mx-2 grid grid-cols-2 gap-x-2 gap-y-1 sm:grid-cols-4">
          {WALKING_PACE_ORDER.map((pace) => {
            const chosen = values.pace === pace;
            return (
              <label
                key={pace}
                /*
                  The whole row lights up, not just the dot. Four dots at
                  arm's length are hard to tell apart at a glance, and the
                  selection is worth seeing without looking for it.
                */
                className={`group rounded-control flex cursor-pointer items-center gap-2 px-2 py-1.5 ${
                  chosen ? 'bg-brand-50' : 'hover:bg-surface-muted'
                }`}
              >
                <input
                  type="radio"
                  name="pace"
                  value={pace}
                  checked={chosen}
                  onChange={() => set('pace', pace)}
                  className="peer sr-only"
                />
                <span
                  aria-hidden="true"
                  className={`peer-focus-visible:outline-brand-500 flex h-4.5 w-4.5 flex-none items-center justify-center rounded-full border-2 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${
                    chosen
                      ? 'border-brand-500'
                      : 'border-border-strong group-hover:border-brand-500'
                  }`}
                >
                  {chosen && <span className="bg-brand-500 h-2 w-2 rounded-full" />}
                </span>

                {/* Name over speed, so a longer word never reflows the row. */}
                <span className="min-w-0">
                  <span
                    className={`block text-sm leading-tight ${
                      chosen ? 'text-brand-700 font-semibold' : 'font-medium'
                    }`}
                  >
                    {paceLabels[pace]}
                  </span>
                  <span className="text-content-muted block text-xs leading-tight tabular-nums">
                    {t(strings.planner.kmh, {
                      value: formatNumber(
                        Math.round(WALKING_PACES[pace] * 3.6 * 10) / 10,
                        locale.locale,
                        { maximumFractionDigits: 1 },
                      ),
                    })}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </form>
  );
}
