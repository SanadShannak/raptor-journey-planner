import { useEffect, useRef, useState } from 'react';
import { PageContainer } from '../components/PageContainer';
import { usePageTitle } from '../app/usePageTitle';
import { getNetwork } from '../api/network';
import { nowInZone, useLocale } from '../i18n';
import type { Message } from '../i18n/dictionary';
import {
  FAVOURITES_PER_KIND,
  identity,
  type Favourite,
  type FavouriteKind,
} from '../features/favourites/favourite';
import { useFavourites } from '../features/favourites/useFavourites';
import { FavouriteStopRow } from '../features/favourites/FavouriteStopRow';
import { FavouriteRouteRow } from '../features/favourites/FavouriteRouteRow';
import { FavouriteJourneyRow } from '../features/favourites/FavouriteJourneyRow';
import { useNetworkNow } from '../features/stops/useNetworkNow';

/**
 * Everything saved, grouped by what it is.
 *
 * The three groups are drawn in a **fixed order** — stops, routes, journeys —
 * rather than largest first, so the page does not rearrange itself between
 * visits. A group with nothing in it is omitted entirely, heading and all:
 * printing "nothing saved" three times says less than one empty state does.
 *
 * The clock is read once here and handed down, so twenty rows share one ticker
 * rather than each running their own.
 */
export default function FavouritesPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.pages.favourites.documentTitle));

  const favourites = useFavourites();

  const [timezone, setTimezone] = useState<string | null>(null);
  const [networkToday, setNetworkToday] = useState<string | null>(null);
  const now = useNetworkNow(timezone);

  /*
   * The page's own heading, which is where focus goes when a row is removed —
   * otherwise focus falls to the body and a keyboard reader is dropped at the
   * top of the document with no idea what happened.
   */
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();

    void getNetwork({ signal: controller.signal })
      .then((info) => {
        if (controller.signal.aborted) return;
        setTimezone(info.timezone);
        setNetworkToday(nowInZone(info.timezone).date);
      })
      .catch(() => {
        /*
         * Swallowed, as elsewhere: each row reports its own failure, and what
         * is lost here is the countdowns rather than the list itself. A saved
         * list that still paints when the backend is down is most of its value.
         */
      });

    return () => controller.abort();
  }, []);

  const groups: { kind: FavouriteKind; heading: Message }[] = [
    { kind: 'stop', heading: strings.favourites.groupStops },
    { kind: 'route', heading: strings.favourites.groupRoutes },
    { kind: 'itinerary', heading: strings.favourites.groupItineraries },
  ];

  /** Focus the heading, so removing the last row of a group is not a dead end. */
  const afterRemove = () => headingRef.current?.focus();

  return (
    <PageContainer>
      <div className="flex flex-col gap-2">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="focus-visible:outline-brand-500 rounded-control text-3xl font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {t(strings.pages.favourites.title)}
        </h1>
        <p className="text-content-muted max-w-prose">{t(strings.favourites.intro)}</p>
        {/* Said plainly, because sign-in is inert: implying an account would be
            a promise this app cannot keep. */}
        <p className="text-content-muted text-sm">{t(strings.favourites.savedOnDevice)}</p>
      </div>

      {favourites.length === 0 ? (
        <div className="rounded-card border-border bg-surface-muted flex max-w-prose flex-col gap-1 border px-4 py-5">
          <p className="font-medium">{t(strings.favourites.empty)}</p>
          <p className="text-content-muted text-sm">{t(strings.favourites.emptyHint)}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(({ kind, heading }) => {
            const mine = favourites.filter((favourite) => favourite.kind === kind);
            if (mine.length === 0) return null;

            return (
              <section key={kind} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-lg font-semibold tracking-tight">{t(heading)}</h2>
                  <p className="text-content-muted text-xs tabular-nums">
                    {t(strings.favourites.countOfLimit, {
                      count: mine.length,
                      limit: FAVOURITES_PER_KIND,
                    })}
                  </p>
                </div>

                <ul className="flex flex-col">
                  {mine.map((favourite, index) => (
                    <Row
                      key={identity(favourite)}
                      favourite={favourite}
                      now={now}
                      networkToday={networkToday}
                      canMoveUp={index > 0}
                      canMoveDown={index < mine.length - 1}
                      onRemoved={afterRemove}
                    />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

/** Dispatches on the union, so each kind draws itself and its own live data. */
function Row({
  favourite,
  now,
  networkToday,
  canMoveUp,
  canMoveDown,
  onRemoved,
}: {
  favourite: Favourite;
  now: ReturnType<typeof useNetworkNow>;
  networkToday: string | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemoved: () => void;
}) {
  const shared = { now, canMoveUp, canMoveDown, onRemoved };

  switch (favourite.kind) {
    case 'stop':
      return <FavouriteStopRow favourite={favourite} {...shared} />;
    case 'route':
      return (
        <FavouriteRouteRow favourite={favourite} networkToday={networkToday} {...shared} />
      );
    case 'itinerary':
      return <FavouriteJourneyRow favourite={favourite} {...shared} />;
  }
}
