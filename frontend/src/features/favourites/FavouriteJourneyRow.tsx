import { paths } from '../../app/routes';
import { useLocale } from '../../i18n';
import { WALKING_PACES } from '../../config/journey';
import type { NetworkMoment } from '../stops/minutesUntil';
import type { ItineraryFavourite } from './favourite';
import { FavouriteRow } from './FavouriteRow';
import { journeyFavouritePath } from './journeyFavouritePath';

interface Props {
  favourite: ItineraryFavourite;
  now: NetworkMoment | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onRemoved: () => void;
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
 */
export function FavouriteJourneyRow({
  favourite,
  now,
  canMoveUp,
  canMoveDown,
  onRemoved,
}: Props) {
  const { strings, t } = useLocale();

  const target = journeyFavouritePath(favourite, now);
  const pace = t(strings.planner[PACE_LABEL[favourite.pace]]);

  const summary = t(strings.favourites.journeyRoute, {
    origin: favourite.origin.label,
    destination: favourite.destination.label,
  });

  return (
    <FavouriteRow
      favourite={favourite}
      /*
       * Until the clock is known there is nowhere honest to send anyone, so the
       * row points at the planner itself rather than at a search timed by the
       * browser's city. In practice `/api/network` answers well before anyone
       * presses.
       */
      to={target ?? paths.home}
      fallbackLabel={summary}
      canMoveUp={canMoveUp}
      canMoveDown={canMoveDown}
      onRemoved={onRemoved}
      emblem={
        <span
          aria-hidden="true"
          className="text-content-muted mt-0.5 flex h-6 w-6 flex-none items-center justify-center"
        >
          {/* Two ends and the line between them. Not directional — it is a
              journey, not an arrow — so it does not mirror in RTL. */}
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="5" cy="5" r="2.2" />
            <circle cx="15" cy="15" r="2.2" />
            <path d="M5 7.5v3a2 2 0 002 2h6" strokeDasharray="1 2.6" />
          </svg>
        </span>
      }
      subtitle={
        <div className="flex flex-col gap-0.5">
          {/*
            When the row has a nickname the ends are no longer in the title, so
            they are said here — a favourite called "Home" still has to show
            which two points it means.
          */}
          {favourite.nickname !== null && (
            <span dir="auto" className="block truncate">
              {summary}
            </span>
          )}
          <span className="text-xs">
            {t(strings.favourites.paceLabel, { pace: pace.toLowerCase() })}
            {' · '}
            {t(strings.planner.kmh, {
              value: (WALKING_PACES[favourite.pace] * 3.6).toFixed(1),
            })}
          </span>
        </div>
      }
    >
      <p className="text-content-muted ps-1 text-sm">{t(strings.favourites.openJourney)}</p>
    </FavouriteRow>
  );
}
