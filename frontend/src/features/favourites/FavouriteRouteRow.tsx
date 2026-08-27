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
import { identity, type RouteFavourite } from './favourite';
import { refreshFavourite } from './favouritesStore';
import { FavouriteRow } from './FavouriteRow';

interface Props {
  favourite: RouteFavourite;
  now: NetworkMoment | null;
  /** Today on the network's clock. Null until `/api/network` answers. */
  networkToday: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemoved: () => void;
}

/** How many departures a row shows. A glance, not a timetable. */
const SHOWN = 3;

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
 */
export function FavouriteRouteRow({
  favourite,
  now,
  networkToday,
  canMoveUp,
  canMoveDown,
  onRemoved,
}: Props) {
  const { locale, strings, t } = useLocale();
  const { service } = useBackendHealth();

  const [timetable, setTimetable] = useState<VariantTimetable | null>(null);
  const [loading, setLoading] = useState(true);
  const [gone, setGone] = useState(false);
  const [failed, setFailed] = useState(false);

  const { lineId, patternId } = favourite;
  const key = identity(favourite);

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
        // The stored labels are a cache; the live answer is the record.
        refreshFavourite(key, {
          routeShortName: answer.routeShortName,
          routeType: answer.routeType,
          routeLongName: answer.routeLongName,
          headsign: answer.headsign,
          directionId: answer.directionId,
        });
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
  }, [lineId, patternId, networkToday, key]);

  /*
   * Departures from the line's own origin — the first stop of the pattern —
   * which is what "when does this line next run" means. Measured anywhere else
   * it would answer a question about a stop rather than about the line.
   */
  const originSequence = timetable?.stops[0]?.sequence ?? null;
  const upcoming: NextCall[] =
    timetable === null || originSequence === null
      ? []
      : nextCallsAt(timetable.trips, originSequence, now, SHOWN);

  const destination = favourite.headsign ?? favourite.routeLongName;

  return (
    <FavouriteRow
      favourite={favourite}
      to={lineVariantPath(lineId, patternId)}
      fallbackLabel={favourite.routeLongName ?? favourite.routeShortName}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onRemoved={onRemoved}
      emblem={
        <LineBadge
          lineId={lineId}
          routeShortName={favourite.routeShortName}
          routeType={favourite.routeType}
        />
      }
      subtitle={
        destination === null ? null : (
          <span dir="auto" className="block truncate">
            {t(strings.routes.towards, { destination })}
          </span>
        )
      }
    >
      <div className="ps-1">
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
          <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {upcoming.map((next) => (
              <li
                key={`${next.call.date}-${next.call.time}`}
                className="text-content text-sm font-medium tabular-nums"
              >
                {formatClockTime(next.call.time, locale)}
                {next.minutes !== null && next.minutes <= 60 && (
                  <span className="text-content-muted ms-1.5 font-normal">
                    {t(strings.units.minutes, { minutes: next.minutes })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </FavouriteRow>
  );
}
