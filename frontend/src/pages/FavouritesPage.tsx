import { useEffect, useRef, useState } from 'react';
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
import { reorderFavourite } from '../features/favourites/favouritesStore';
import { useFavourites } from '../features/favourites/useFavourites';
import { FavouriteStopRow } from '../features/favourites/FavouriteStopRow';
import { FavouriteRouteRow } from '../features/favourites/FavouriteRouteRow';
import { FavouriteJourneyRow } from '../features/favourites/FavouriteJourneyRow';
import { useNetworkNow } from '../features/stops/useNetworkNow';

/**
 * Everything saved, a row per kind.
 *
 * Full width with the app bar's own gutters rather than the narrow column
 * `PageContainer` gives a page of prose — these are rows meant to run as far as
 * the window does, and a capped column wasted the space a fourth card could
 * have used before anyone had to scroll.
 *
 * Laid out to fit a laptop screen without scrolling: three rows, each one card
 * deep, with the page's own furniture kept to two lines. Rows are drawn in a
 * fixed order so the page does not rearrange itself between visits, and a kind
 * with nothing saved is omitted entirely — printing "nothing saved" three times
 * says less than one empty state does.
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

  /**
   * Which card is being dragged.
   *
   * Held in a **ref** as well as in state, and the ref is what the drop logic
   * reads. `dragenter` can arrive in the same tick as `dragstart` — a fast
   * pointer, or a synthetic event — and state committed in `dragstart` is not
   * visible to a handler running before React has re-rendered, so a drag that
   * started and moved in one frame silently did nothing. The state exists only
   * so the card being carried can dim, which is a render concern.
   */
  const draggedRef = useRef<string | null>(null);
  const [dragged, setDragged] = useState<string | null>(null);

  const startDrag = (key: string) => {
    draggedRef.current = key;
    setDragged(key);
  };

  const endDrag = () => {
    draggedRef.current = null;
    setDragged(null);
  };

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
    <div className="flex w-full flex-col gap-2.5 px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-0.5">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="focus-visible:outline-brand-500 rounded-control text-xl font-semibold tracking-tight"
        >
          {t(strings.pages.favourites.title)}
        </h1>
        {/*
          One line rather than two. The page's own explanation and the honesty
          about where favourites live are both worth saying, and neither is
          worth a row of cards' worth of height to say.
        */}
        <p className="text-content-muted text-xs">
          {t(strings.favourites.intro)} {t(strings.favourites.savedOnDevice)}
        </p>
      </div>

      {favourites.length === 0 ? (
        <div className="rounded-card border-border bg-surface-muted flex max-w-prose flex-col gap-1 border px-4 py-5">
          <p className="font-medium">{t(strings.favourites.empty)}</p>
          <p className="text-content-muted text-sm">{t(strings.favourites.emptyHint)}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rows.map(({ kind, heading }) => {
            const mine = favourites.filter((favourite) => favourite.kind === kind);
            if (mine.length === 0) return null;

            return (
              <section key={kind} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-semibold tracking-tight">{t(heading)}</h2>
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

                  The negative margins let a row bleed to the page's own gutters,
                  so a card scrolling out does not appear to stop short of the
                  edge — the padding puts the first card back where the heading
                  above it starts.
                */}
                {/*
                  Said once for the row rather than on every card in it: a
                  screen reader working along five saved stops does not need to
                  hear how to reorder them five times.
                */}
                <p className="sr-only">{t(strings.favourites.dragHint)}</p>

                <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
                  <ul className="flex items-stretch gap-3">
                    {mine.map((favourite) => {
                      const key = identity(favourite);
                      return (
                        <Card
                          key={key}
                          favourite={favourite}
                          now={now}
                          networkToday={networkToday}
                          onRemoved={afterRemove}
                          dragging={dragged === key}
                          onDragStart={() => startDrag(key)}
                          /*
                           * Reordered as the pointer passes rather than on
                           * drop, so the row shows the arrangement being made
                           * instead of rearranging once at the end.
                           */
                          onDragEnter={() => {
                            const moving = draggedRef.current;
                            if (moving !== null && moving !== key) {
                              reorderFavourite(moving, key);
                            }
                          }}
                          onDragEnd={endDrag}
                        />
                      );
                    })}
                  </ul>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Dispatches on the union, so each kind draws itself and its own live data. */
function Card({
  favourite,
  now,
  networkToday,
  onRemoved,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: {
  favourite: Favourite;
  now: ReturnType<typeof useNetworkNow>;
  networkToday: string | null;
  onRemoved: () => void;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}) {
  const shared = { now, onRemoved, dragging, onDragStart, onDragEnter, onDragEnd };

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
