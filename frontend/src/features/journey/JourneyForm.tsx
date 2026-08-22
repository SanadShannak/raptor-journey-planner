import { useId, useState, type FormEvent } from 'react';
import { useLocale } from '../../i18n';
import {
  WALKING_PACE_ORDER,
  type WalkingPace,
} from '../../config/journey';
import type { Place } from '../../types/place';
import { PlaceInput } from './PlaceInput';
import { UseMyLocationButton } from './UseMyLocationButton';

export interface JourneyFormValues {
  origin: Place | null;
  destination: Place | null;
  date: string;
  time: string;
  pace: WalkingPace;
}

interface Props {
  values: JourneyFormValues;
  onChange: (values: JourneyFormValues) => void;
  onSubmit: () => void;
  /** Dates the loaded timetable covers, used to bound the date field. */
  validDates: string[];
  busy: boolean;
}

/**
 * The journey search form.
 *
 * Both ends must be *chosen* rather than typed: a journey is planned from
 * coordinates, and only a picked suggestion carries them. The form says which
 * end is missing rather than guessing at free text.
 */
export function JourneyForm({
  values,
  onChange,
  onSubmit,
  validDates,
  busy,
}: Props) {
  const locale = useLocale();
  const { strings, t } = locale;
  const [errors, setErrors] = useState<Record<string, string>>({});
  const dateId = useId();
  const timeId = useId();
  const paceId = useId();

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

  function swap() {
    onChange({ ...values, origin: values.destination, destination: values.origin });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const found: Record<string, string> = {};
    if (values.origin === null) found['origin'] = t(strings.planner.chooseOrigin);
    if (values.destination === null) {
      found['destination'] = t(strings.planner.chooseDestination);
    }
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    onSubmit();
  }

  const fieldClass =
    'rounded-control border-border-strong bg-surface text-content focus-visible:outline-brand-500 border px-3 py-2 focus-visible:outline-2 focus-visible:outline-offset-2';

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <div className="flex flex-col gap-1">
          <PlaceInput
            label={t(strings.planner.origin)}
            value={values.origin}
            onChange={(place) => set('origin', place)}
            action={
              <UseMyLocationButton onLocated={(place) => set('origin', place)} />
            }
          />
          {errors['origin'] !== undefined && (
            <p className="text-danger text-sm">{errors['origin']}</p>
          )}
        </div>

        {/*
          A vertical arrow rather than a horizontal one: it means "these two
          exchange places", which is true in either reading direction, so it
          must not be mirrored the way a directional arrow would be.
        */}
        <button
          type="button"
          onClick={swap}
          aria-label={t(strings.planner.swap)}
          className="rounded-control border-border-strong text-content-muted hover:text-content focus-visible:outline-brand-500 mb-1 hidden h-10 w-10 cursor-pointer items-center justify-center border focus-visible:outline-2 focus-visible:outline-offset-2 sm:inline-flex"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M7 4v16M7 4L4 7M7 4l3 3M17 20V4M17 20l3-3M17 20l-3-3" />
          </svg>
        </button>

        <div className="flex flex-col gap-1">
          <PlaceInput
            label={t(strings.planner.destination)}
            value={values.destination}
            onChange={(place) => set('destination', place)}
          />
          {errors['destination'] !== undefined && (
            <p className="text-danger text-sm">{errors['destination']}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={dateId} className="text-sm font-medium">
            {t(strings.planner.date)}
          </label>
          <input
            id={dateId}
            type="date"
            value={values.date}
            /*
             * Bounded by what the timetable actually covers, so an out-of-range
             * date is unreachable rather than something the engine has to
             * reject. The list arrives sorted.
             */
            min={validDates[0]}
            max={validDates[validDates.length - 1]}
            onChange={(event) => set('date', event.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={timeId} className="text-sm font-medium">
            {t(strings.planner.time)}
          </label>
          <input
            id={timeId}
            type="time"
            value={values.time}
            onChange={(event) => set('time', event.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={paceId} className="text-sm font-medium">
            {t(strings.planner.walkingSpeed)}
          </label>
          <select
            id={paceId}
            value={values.pace}
            onChange={(event) => set('pace', event.target.value as WalkingPace)}
            className={fieldClass}
          >
            {WALKING_PACE_ORDER.map((pace) => (
              <option key={pace} value={pace}>
                {paceLabels[pace]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-control bg-brand-fill text-on-brand focus-visible:outline-brand-500 cursor-pointer px-5 py-2.5 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-progress disabled:opacity-70"
        >
          {busy ? t(strings.planner.searching) : t(strings.planner.submit)}
        </button>
      </div>
    </form>
  );
}
