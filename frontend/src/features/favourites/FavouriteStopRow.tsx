import { useEffect, useState } from 'react';
import { stopPath } from '../../app/routes';
import { useBackendHealth } from '../../app/useBackendHealth';
import { getStopBoard } from '../../api/stops';
import { useLocale } from '../../i18n';
import type { StopBoard } from '../../types/stop';
import { DepartureRow } from '../stops/DepartureRow';
import type { NetworkMoment } from '../stops/minutesUntil';
import { StopCode } from '../stops/StopFacts';
import type { StopFavourite } from './favourite';
import { DeparturePager, FavouriteCard } from './FavouriteCard';

interface Props {
  favourite: StopFavourite;
  now: NetworkMoment | null;
  onRemoved: () => void;
  dragging: boolean;
  canGoEarlier: boolean;
  canGoLater: boolean;
  someoneElseDragging: boolean;
  onDragStart: () => void;
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
 * How many departures fit on a card at once.
 *
 * Three, which is what the page has room for now that it carries no footer.
 * The rest are fetched alongside them and reached with the pager, so the
 * fourth departure is one press away rather than one scroll.
 */
const PAGE = 3;

/**
 * How deep the board is fetched.
 *
 * Enough to page through a while without ever asking again, and still a
 * fraction of the inspector's forty — a saved stop is a summary, and every one
 * of these is its own request on its own timer.
 */
const FETCHED = 15;

/**
 * A saved stop, and what leaves it next.
 *
 * Deliberately the *same* request the stop page makes — `getStopBoard`, the
 * same polling cadence, the same `DepartureRow` — so a departure reads
 * identically here and there. Nothing about "next departures" is reimplemented.
 *
 * **The stop's name and code come from that board**, not from the saved row.
 * The account stores only the `stopId`, so there is nothing to write a
 * correction back to any more — which removes a whole mechanism rather than
 * breaking one: the board is asked every minute regardless, and whatever it
 * says is by definition current. What covers the wait is the nickname, which
 * the server defaults to the stop's own name at the moment of saving, so the
 * card reads properly from its first paint and only the code badge arrives
 * late.
 */
export function FavouriteStopRow({
  favourite,
  now,
  onRemoved,
  dragging,
  canGoEarlier,
  canGoLater,
  someoneElseDragging,
  onDragStart,
}: Props) {
  const { strings, t } = useLocale();
  const { service } = useBackendHealth();

  const [board, setBoard] = useState<StopBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);

  const { stopId } = favourite;

  useEffect(() => {
    const controller = new AbortController();

    const load = (quiet: boolean) => {
      if (!quiet) setLoading(true);
      void getStopBoard(stopId, { limit: FETCHED, signal: controller.signal })
        .then((answer) => {
          if (controller.signal.aborted) return;
          setBoard(answer);
          setFailed(false);
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
  }, [stopId]);

  const departures = board?.departures ?? [];
  const pages = Math.max(1, Math.ceil(departures.length / PAGE));

  /*
   * The board is re-asked every minute and departures drop off the front as
   * they leave, so a page that was the last one can stop existing underneath
   * somebody. Clamped during render rather than in an effect, which would
   * paint one frame of an empty page first.
   */
  const shownPage = Math.min(page, pages - 1);
  if (shownPage !== page) setPage(shownPage);

  const visible = departures.slice(shownPage * PAGE, shownPage * PAGE + PAGE);

  return (
    <FavouriteCard
      favourite={favourite}
      to={stopPath(stopId)}
      /*
        Only reached when the row has no nickname at all, which the server's
        own default makes rare. The id is the last resort rather than a blank
        heading: it is at least the thing the card actually points at.
      */
      fallbackLabel={board?.stop.name ?? stopId}
      onRemoved={onRemoved}
      dragging={dragging}
      canGoEarlier={canGoEarlier}
      canGoLater={canGoLater}
      someoneElseDragging={someoneElseDragging}
      onDragStart={onDragStart}
      pager={<DeparturePager page={shownPage} pages={pages} onPage={setPage} />}
      subtitle={
        board?.stop.code == null ? null : <StopCode code={board.stop.code} />
      }
    >
      <div>
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
          <ul className="flex flex-col text-sm">
            {visible.map((departure, index) => (
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
    </FavouriteCard>
  );
}
