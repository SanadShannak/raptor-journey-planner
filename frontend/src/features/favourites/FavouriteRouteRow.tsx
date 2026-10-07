import { useEffect, useState } from 'react';
import { lineVariantPath } from '../../app/routes';
import { useBackendHealth } from '../../app/useBackendHealth';
import { getVariantTimetable } from '../../api/routes';
import { ApiError } from '../../api/errors';
import { formatClockTime, useLocale } from '../../i18n';
import type { VariantTimetable } from '../../types/route';
import { LineBadge } from '../stops/LineBadge';
import type { NetworkMoment } from '../stops/minutesUntil';
import { nextCallsAt, type NextCall } from '../routes/nextCallAt';
import type { RouteFavourite } from './favourite';
import { DeparturePager, FavouriteCard } from './FavouriteCard';

interface Props {
  favourite: RouteFavourite;
  now: NetworkMoment | null;
  /** Today on the network's clock. Null until `/api/network` answers. */
  networkToday: string | null;
  onRemoved: () => void;
  dragging: boolean;
  canGoEarlier: boolean;
  canGoLater: boolean;
  someoneElseDragging: boolean;
  onDragStart: () => void;
}

/** Three at a time, matching the stop card and for the same reason. */
const PAGE = 3;

/**
 * How far down the day the card can page.
 *
 * The whole service day is already in hand — this costs no extra request, it
 * only bounds how much arithmetic is done over trips nobody will page to.
 */
const REACHABLE = 15;

/**
 * A saved line, in the direction it was saved in, and what leaves next.
 *
 * The same request the line's own page makes — `getVariantTimetable` for one
 * service day — and the same arithmetic over it, `nextCallsAt`, which
 * `nextCallAt` on the route page is a one-result call of. Nothing about "next
 * departures" is computed differently here.
 *
 * **It is not polled.** A service day's timetable cannot change while it is
 * being looked at, so it is fetched once and the countdowns move on the page's
 * own clock tick. Polling a whole day — up to ~440 kB on the largest pattern —
 * once a minute would be absurd for an answer that is already in hand.
 *
 * The saved direction is a `patternId`, which is stable for the life of a
 * dataset but **not across a pipeline re-run**. When it no longer resolves the
 * row says so plainly, rather than falling back to another direction and
 * showing times for a vehicle going the other way.
 *
 * **The mode comes from that timetable, not from the saved row.** The account
 * keeps the designation and the long name — enough for the card to read
 * properly straight away — but not the `routeType`, which is what gives the
 * badge its colour and its silhouette. So the badge waits for the one request
 * this row was always going to make, and until then the designation stands on
 * its own. A badge drawn in a guessed mode's colour would be worse than a
 * badge that arrives a moment late: it would be telling somebody to look for
 * the wrong vehicle.
 */
export function FavouriteRouteRow({
  favourite,
  now,
  networkToday,
  onRemoved,
  dragging,
  canGoEarlier,
  canGoLater,
  someoneElseDragging,
  onDragStart,
}: Props) {
  const { locale, strings, t } = useLocale();
  const { service } = useBackendHealth();

  const [timetable, setTimetable] = useState<VariantTimetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState(0);

  const { lineId, patternId } = favourite;

  /*
   * A different day or a different direction is a different subject, so nothing
   * from the last one should be on screen while this one loads.
   *
   * Adjusted during render rather than in an effect — the same idiom
   * `useNetworkNow` uses for a changed zone. An effect would paint one frame of
   * the previous answer under the new heading and then re-render to correct it,
   * and that correction is not a synchronisation with anything: it is simply
   * what this state *is* for these props.
   */
  const request = `${lineId}|${patternId}|${networkToday ?? ''}`;
  const [lastRequest, setLastRequest] = useState(request);
  if (request !== lastRequest) {
    setLastRequest(request);
    setTimetable(null);
    setLoading(true);
    setGone(false);
    setFailed(false);
  }

  useEffect(() => {
    if (networkToday === null) return;

    const controller = new AbortController();

    void getVariantTimetable(lineId, patternId, networkToday, {
      signal: controller.signal,
    })
      .then((answer) => {
        if (controller.signal.aborted) return;
        setTimetable(answer);
        setGone(false);
        setFailed(false);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setTimetable(null);
        /*
         * A 404 here is not a failure to report as one: the line or the exact
         * direction is no longer in this dataset, which is a fact about the
         * favourite rather than about the request.
         */
        const missing =
          error instanceof ApiError &&
          (error.code === 'PATTERN_NOT_FOUND' || error.code === 'LINE_NOT_FOUND');
        setGone(missing);
        setFailed(!missing);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [lineId, patternId, networkToday]);

  /*
   * Departures from the line's own origin — the first stop of the pattern —
   * which is what "when does this line next run" means. Measured anywhere else
   * it would answer a question about a stop rather than about the line.
   */
  const originSequence = timetable?.stops[0]?.sequence ?? null;
  const upcoming: NextCall[] =
    timetable === null || originSequence === null
      ? []
      : nextCallsAt(timetable.trips, originSequence, now, REACHABLE);

  const pages = Math.max(1, Math.ceil(upcoming.length / PAGE));

  /*
   * The list shortens as the day goes on — a departure that has gone is no
   * longer "next" — so a page can stop existing underneath somebody. Clamped
   * during render, which is what this value simply *is* for this list.
   */
  const shownPage = Math.min(page, pages - 1);
  if (shownPage !== page) setPage(shownPage);

  const visible = upcoming.slice(shownPage * PAGE, shownPage * PAGE + PAGE);

  /*
   * Where it is heading. The live headsign is the better answer and the stored
   * long name is what stands in until it arrives — the headsign is per
   * direction and so is exactly what a saved direction wants to say, while the
   * long name describes the whole line and is merely true.
   */
  const destination = timetable?.headsign ?? favourite.routeLongName;

  /*
   * The designation, preferring the live one. They agree in almost every case;
   * when they do not, the feed has been rebuilt since this was saved and the
   * live answer is the one that matches the times underneath it.
   */
  const shortName = timetable?.routeShortName ?? favourite.routeShortName;
  const routeType = timetable?.routeType ?? null;

  return (
    <FavouriteCard
      favourite={favourite}
      to={lineVariantPath(lineId, patternId)}
      fallbackLabel={favourite.routeLongName ?? shortName ?? lineId}
      onRemoved={onRemoved}
      dragging={dragging}
      canGoEarlier={canGoEarlier}
      canGoLater={canGoLater}
      someoneElseDragging={someoneElseDragging}
      onDragStart={onDragStart}
      pager={<DeparturePager page={shownPage} pages={pages} onPage={setPage} />}
      emblem={
        /*
          Both halves or neither. `LineBadge` pairs a designation with its
          mode's colour and icon, and it is the pairing that carries the
          meaning — a number in an arbitrary colour would be a claim about
          which vehicle to board.
        */
        shortName === null || routeType === null ? undefined : (
          <LineBadge lineId={lineId} routeShortName={shortName} routeType={routeType} />
        )
      }
      subtitle={
        destination === null ? null : (
          <span className="block truncate [unicode-bidi:plaintext] ltr:text-left rtl:text-right">
            {t(strings.routes.towards, { destination })}
          </span>
        )
      }
    >
      <div>
        {gone ? (
          <p className="text-content-muted text-sm">
            {t(strings.favourites.directionUnavailable)}
          </p>
        ) : service === 'down' || failed ? (
          <p className="text-content-muted text-sm">
            {t(strings.favourites.departuresUnavailable)}
          </p>
        ) : loading || networkToday === null ? (
          <p className="text-content-muted text-sm">
            {t(strings.favourites.loadingDepartures)}
          </p>
        ) : upcoming.length === 0 ? (
          <p className="text-content-muted text-sm">{t(strings.favourites.noDepartures)}</p>
        ) : (
          /*
            The countdown sits at the far end rather than beside the time. It
            is the part that moves, and a number that changes in the middle of
            a row drags the eye off the column of times it belongs to — the
            same arrangement a stop's own departure row uses.
          */
          <ul className="flex flex-col">
            {visible.map((next) => (
              <li
                key={`${next.call.date}-${next.call.time}`}
                className="border-border flex items-center justify-between gap-2 border-b py-1.5 text-sm tabular-nums last:border-b-0"
              >
                {/*
                  The countdown leads and the clock time closes, which is the
                  order a stop's own departure row already uses — and being DOM
                  order rather than a placement, it reverses with the page: the
                  time sits at the right in English and at the left in Arabic,
                  always at the line's end.
                */}
                {next.minutes !== null && next.minutes <= 60 ? (
                  <span className="bg-surface-muted text-content-muted rounded-control flex-none px-1.5 py-0.5 text-xs font-medium">
                    {t(strings.units.minutes, { minutes: next.minutes })}
                  </span>
                ) : (
                  <span />
                )}
                <span className="text-content font-medium">
                  {formatClockTime(next.call.time, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FavouriteCard>
  );
}
