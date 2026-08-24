import { formatClockTime, useLocale } from '../../i18n';
import type { StopBoard } from '../../types/stop';
import { DepartureRow } from './DepartureRow';
import { keepSelected } from './keepSelected';
import type { NetworkMoment } from './minutesUntil';

interface Props {
  board: StopBoard;
  now: NetworkMoment | null;
  selectedLines: ReadonlySet<string>;
}

/**
 * What leaves next.
 *
 * The board is resolved on the network's clock by the backend, and `asOf` says
 * when — which is the only thing that makes a tab left open all afternoon
 * legible rather than quietly wrong. The countdowns beside each row are
 * recomputed locally against the same clock, so they keep moving between
 * refreshes instead of freezing at whatever the last answer said.
 *
 * An empty board is a real answer. Service ends; the honest response is to say
 * so and point at the timetable for another day, not to show an error.
 */
export function UpcomingBoard({ board, now, selectedLines }: Props) {
  const { locale, strings, t } = useLocale();

  const departures = keepSelected(board.departures, selectedLines);

  if (board.departures.length === 0) {
    return (
      <div className="rounded-card border-border bg-surface-muted flex flex-col gap-1 border px-4 py-5">
        <p className="font-medium">{t(strings.stops.noUpcoming)}</p>
        <p className="text-content-muted text-sm">{t(strings.stops.noUpcomingHint)}</p>
      </div>
    );
  }

  // The reader's own filter emptied it, which needs different words from the
  // end of service — one is something they did and can undo.
  if (departures.length === 0) {
    return (
      <p className="text-content-muted rounded-card border-border border px-4 py-5 text-sm">
        {t(strings.stops.noMatchingLines)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {board.asOf.time !== '' && (
        <p className="text-content-muted text-xs tabular-nums">
          {t(strings.stops.asOf, {
            time: formatClockTime(board.asOf.time, locale),
          })}
        </p>
      )}

      <ul className="flex flex-col">
        {departures.map((departure, index) => (
          <DepartureRow
            /*
             * `tripId` is not unique on this board: a loop route calls at the
             * same stop twice on one trip, and both calls are listed. The time
             * disambiguates them, and the index is the backstop.
             */
            key={`${departure.tripId ?? departure.lineId}-${departure.date}-${departure.time}-${index}`}
            departure={departure}
            now={now}
            viewedDate={board.asOf.date}
            countdown
          />
        ))}
      </ul>
    </div>
  );
}
