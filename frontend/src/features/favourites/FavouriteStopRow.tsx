import { useEffect, useState } from 'react';
import { stopPath } from '../../app/routes';
import { useBackendHealth } from '../../app/useBackendHealth';
import { getStopBoard } from '../../api/stops';
import { useLocale } from '../../i18n';
import type { StopBoard } from '../../types/stop';
import { DepartureRow } from '../stops/DepartureRow';
import type { NetworkMoment } from '../stops/minutesUntil';
import { StopCode } from '../stops/StopFacts';
import { identity, type StopFavourite } from './favourite';
import { refreshFavourite } from './favouritesStore';
import { FavouriteRow } from './FavouriteRow';

interface Props {
  favourite: StopFavourite;
  now: NetworkMoment | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemoved: () => void;
}

/**
 * How often a saved stop's board is asked again.
 *
 * The same minute `StopInspector` uses, and for the same reason: a minute is
 * the resolution the times themselves have, so asking more often cannot
 * produce a different answer. The countdowns move on the page's own half-minute
 * tick in between.
 */
const REFRESH_MS = 60_000;

/**
 * How many departures a row shows.
 *
 * Far fewer than the inspector's forty. This is a glance — the next few — and
 * asking for forty per saved stop would be forty times the payload for rows
 * nobody scrolls.
 */
const SHOWN = 3;

/**
 * A saved stop, and what leaves it next.
 *
 * Deliberately the *same* request the stop page makes — `getStopBoard`, the
 * same polling cadence, the same `DepartureRow` — so a departure reads
 * identically here and there. Nothing about "next departures" is reimplemented.
 */
export function FavouriteStopRow({
  favourite,
  now,
  canMoveUp,
  canMoveDown,
  onRemoved,
}: Props) {
  const { strings, t } = useLocale();
  const { service } = useBackendHealth();

  const [board, setBoard] = useState<StopBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const { stopId } = favourite;
  const key = identity(favourite);

  useEffect(() => {
    const controller = new AbortController();

    const load = (quiet: boolean) => {
      if (!quiet) setLoading(true);
      void getStopBoard(stopId, { limit: SHOWN, signal: controller.signal })
        .then((answer) => {
          if (controller.signal.aborted) return;
          setBoard(answer);
          setFailed(false);
          /*
           * The stored name is a cache; the live answer is the record. This is
           * where a stop renamed since it was saved corrects itself.
           */
          refreshFavourite(key, { name: answer.stop.name, code: answer.stop.code });
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          // A failed *refresh* leaves the board on screen alone — it was true a
          // minute ago, and that beats replacing it with an error.
          if (!quiet) {
            setBoard(null);
            setFailed(true);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted && !quiet) setLoading(false);
        });
    };

    load(false);

    const timer = window.setInterval(() => load(true), REFRESH_MS);
    const onVisibility = () => {
      if (!document.hidden) load(true);
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      controller.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [stopId, key]);

  const departures = board?.departures ?? [];

  return (
    <FavouriteRow
      favourite={favourite}
      to={stopPath(stopId)}
      fallbackLabel={favourite.name}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onRemoved={onRemoved}
      subtitle={
        favourite.code === null ? null : <StopCode code={favourite.code} />
      }
    >
      <div className="ps-1">
        {service === 'down' || failed ? (
          <p className="text-content-muted text-sm">
            {t(strings.favourites.departuresUnavailable)}
          </p>
        ) : loading && board === null ? (
          <p className="text-content-muted text-sm">
            {t(strings.favourites.loadingDepartures)}
          </p>
        ) : departures.length === 0 ? (
          <p className="text-content-muted text-sm">{t(strings.favourites.noDepartures)}</p>
        ) : (
          <ul className="flex flex-col">
            {departures.map((departure, index) => (
              <DepartureRow
                key={`${departure.tripId ?? departure.lineId}-${departure.date}-${departure.time}-${index}`}
                departure={departure}
                now={now}
                viewedDate={board?.asOf.date ?? departure.date}
                countdown
              />
            ))}
          </ul>
        )}
      </div>
    </FavouriteRow>
  );
}
