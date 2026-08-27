import { paths } from '../../app/routes';
import { formatDate, useLocale } from '../../i18n';
import { WALKING_PACES } from '../../config/journey';
import type { NetworkMoment } from '../stops/minutesUntil';
import type { ItineraryFavourite } from './favourite';
import { FavouriteCard, TEXT_INSET } from './FavouriteCard';
import { journeyFavouritePath } from './journeyFavouritePath';

interface Props {
  favourite: ItineraryFavourite;
  now: NetworkMoment | null;
  onRemoved: () => void;
  dragging: boolean;
  canGoEarlier: boolean;
  canGoLater: boolean;
  someoneElseDragging: boolean;
  onDragStart: () => void;
}

const PACE_LABEL = {
  slow: 'speedSlow',
  calm: 'speedCalm',
  average: 'speedAverage',
  fast: 'speedFast',
} as const;

/**
 * A saved journey: two ends and a pace, asked again from now.
 *
 * No live data of its own — it is a saved *question*, and the answer only
 * exists once somebody presses it. That is also why nothing here polls: there
 * is nothing to keep current until the planner is asked.
 *
 * Where the other two cards fill with departures, this one has only three
 * facts, so it **names them**. "Eira to Käpylä · walking calm · 3.5 km/h" run
 * together reads as one long label where a reader is actually looking for one
 * of three specific things; From, To and Walking down the side answer that at
 * a glance, and the two place names line up under each other where they can be
 * compared.
 */
export function FavouriteJourneyRow({
  favourite,
  now,
  onRemoved,
  dragging,
  canGoEarlier,
  canGoLater,
  someoneElseDragging,
  onDragStart,
}: Props) {
  const { locale, strings, t } = useLocale();

  const target = journeyFavouritePath(favourite, now);
  const pace = t(strings.planner[PACE_LABEL[favourite.pace]]);

  const field = (label: string, value: string, strong: boolean) => (
    <div className={`flex items-baseline gap-2 ${TEXT_INSET}`}>
      <span className="text-content-muted w-14 flex-none text-xs">{label}</span>
      {/*
        No `dir="auto"` on the value. It resolves from the first strong
        character, so on an Arabic page a Latin place name turned its own box
        left-to-right and sat against the far edge, while the pace beside it —
        being Arabic — stayed against the near one. Three values in a column,
        two of them flush left and one flush right. Inheriting the page's
        direction anchors all three where the labels are, and bidi still renders
        "Eira" left-to-right inside: the box follows the page, the text follows
        itself. The same rule the stop heading already documents.
      */}
      <span
        className={`min-w-0 flex-1 truncate text-sm ${
          strong ? 'text-content font-medium' : 'text-content-muted'
        }`}
      >
        {value}
      </span>
    </div>
  );

  return (
    <FavouriteCard
      favourite={favourite}
      /*
       * Until the clock is known there is nowhere honest to send anyone, so the
       * card points at the planner itself rather than at a search timed by the
       * browser's city. In practice `/api/network` answers well before anyone
       * presses.
       */
      to={target ?? paths.home}
      fallbackLabel={t(strings.favourites.journeyFallback)}
      onRemoved={onRemoved}
      dragging={dragging}
      canGoEarlier={canGoEarlier}
      canGoLater={canGoLater}
      someoneElseDragging={someoneElseDragging}
      onDragStart={onDragStart}
      emblem={
        <span
          aria-hidden="true"
          className="bg-brand-50 text-brand-700 rounded-control mt-0.5 flex h-8 w-8 flex-none items-center justify-center"
        >
          {/* Two ends and the route between them, in the brand's own colour so
              the card is as identifiable at a glance as a mode badge makes the
              other two. Not directional — a journey, not an arrow — so it does
              not mirror in RTL. */}
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="5" cy="5" r="2.2" />
            <circle cx="15" cy="15" r="2.2" />
            <path d="M5 7.5v3a2 2 0 002 2h6" strokeDasharray="1 2.6" />
          </svg>
        </span>
      }
      /*
        When it was saved, which on an unnamed card is the only thing that
        tells two similar journeys apart. Omitted rather than guessed for a
        journey saved before the date was recorded.
      */
      subtitle={
        favourite.savedOn === null ? null : (
          <span className="block">
            {t(strings.favourites.savedOn, {
              date: formatDate(favourite.savedOn, locale, {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              }),
            })}
          </span>
        )
      }
    >
      {/*
        The card carries three short facts where the others carry a list, so it
        can afford — and needs — the room the others spend on rows. Run tight
        together they read as one block of small print rather than as three
        separate answers.
      */}
      <div className="flex flex-col gap-2.5 py-1">
        {field(t(strings.favourites.fromLabel), favourite.origin.label, true)}
        {field(t(strings.favourites.toLabel), favourite.destination.label, true)}
        {/* The same weight as the two places: all three are facts about the
            saved search, and dimming one of them made it read as an aside. */}
        {field(
          t(strings.favourites.speedLabel),
          `${pace} · ${t(strings.planner.kmh, {
            value: (WALKING_PACES[favourite.pace] * 3.6).toFixed(1),
          })}`,
          true,
        )}
      </div>

      {/*
        Not a button: the whole card is already the link that runs this search,
        and a second control inside it pointing at the same place would be two
        answers to one press. It says what the card does.
      */}
      <p className="text-brand-500 mt-1 flex items-center gap-1 text-xs font-medium">
        <svg viewBox="0 0 20 20" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5" />
          <path d="M12.5 12.5L18 18" />
        </svg>
        {t(strings.favourites.openJourney)}
      </p>
    </FavouriteCard>
  );
}
