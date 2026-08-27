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
 * Everything saved, a row per kind.
 *
 * Each category is a horizontal row of cards that scrolls sideways when there
 * are more than fit — which keeps all three kinds visible at once rather than
 * pushing journeys below the fold behind a column of stops. The rows are drawn
 * in a **fixed order** so the page does not rearrange itself between visits,
 * and a kind with nothing in it is omitted entirely: printing "nothing saved"
 * three times says less than one empty state does.
 *
 * The clock is read once here and handed down, so every card shares one ticker
 * rather than each running its own.
 */
export default function FavouritesPage() {
  const { strings, t } = useLocale();
  usePageTitle(t(strings.pages.favourites.documentTitle));

  const favourites = useFavourites();

  const [timezone, setTimezone] = useState<string | null>(null);
  const [networkToday, setNetworkToday] = useState<string | null>(null);
  const now = useNetworkNow(timezone);

  /*
   * Where focus goes when a card is removed — otherwise it falls to the body
   * and a keyboard reader is dropped at the top of the document with no idea
   * what happened.
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
         * Swallowed, as elsewhere: each card reports its own failure, and what
         * is lost here is the countdowns rather than the list itself. A saved
         * list that still paints when the backend is down is most of its value.
         */
      });

    return () => controller.abort();
  }, []);

  const rows: { kind: FavouriteKind; heading: Message }[] = [
    { kind: 'stop', heading: strings.favourites.groupStops },
    { kind: 'route', heading: strings.favourites.groupRoutes },
    { kind: 'itinerary', heading: strings.favourites.groupItineraries },
  ];

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
        <div className="flex flex-col gap-7">
          {rows.map(({ kind, heading }) => {
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

                {/*
                  Scrolls sideways when the cards outrun the row. No `tabindex`
                  on the scroller: every card holds links and buttons, so tabbing
                  through them scrolls the row into view by itself, and adding one
                  would only put an extra stop in the way of that.

                  The negative margin lets a row bleed to the page's own gutters,
                  so a card scrolling out does not appear to stop short of the
                  edge — the padding puts the first card back where the heading
                  above it starts.
                */}
                <div className="-mx-4 overflow-x-auto px-4 pb-1">
                  <ul className="flex items-stretch gap-3">
                    {mine.map((favourite, index) => (
                      <Card
                        key={identity(favourite)}
                        favourite={favourite}
                        now={now}
                        networkToday={networkToday}
                        canMoveEarlier={index > 0}
                        canMoveLater={index < mine.length - 1}
                        onRemoved={afterRemove}
                      />
                    ))}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

/** Dispatches on the union, so each kind draws itself and its own live data. */
function Card({
  favourite,
  now,
  networkToday,
  canMoveEarlier,
  canMoveLater,
  onRemoved,
}: {
  favourite: Favourite;
  now: ReturnType<typeof useNetworkNow>;
  networkToday: string | null;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onRemoved: () => void;
}) {
  const shared = { now, canMoveEarlier, canMoveLater, onRemoved };

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
