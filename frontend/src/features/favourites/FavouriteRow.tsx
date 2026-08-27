import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useLocale } from '../../i18n';
import { favouriteLabel, identity, type Favourite } from './favourite';
import { moveFavourite, removeFavourite, renameFavourite } from './favouritesStore';

interface Props {
  favourite: Favourite;
  /** Where pressing the row goes — a stop's page, a route's page, the planner. */
  to: string;
  /** The name it came with, shown when there is no nickname. */
  fallbackLabel: string;
  /** Under the title: a stop's code, a route's headsign, a journey's ends. */
  subtitle: ReactNode;
  /** The mode badge or icon that identifies it at a glance. */
  emblem?: ReactNode | undefined;
  /** Live departures, or whatever this kind has to say for itself. */
  children?: ReactNode | undefined;
  /** False for the first of its kind, so the control can say so. */
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Focus lands here when this row is removed, so it is never lost to body. */
  onRemoved: () => void;
}

const CONTROL =
  'rounded-control text-content-muted hover:text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex h-8 w-8 flex-none cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40';

/**
 * One saved thing.
 *
 * The whole row leads somewhere — a stop opens its board, a route opens its
 * page, a journey runs itself — so the title is a `<Link>`. The controls are
 * **siblings of that link, never inside it**: a button nested in an anchor is
 * invalid, and the repo already learned the matching lesson the other way round
 * — a row that is a `<Link>` must not also navigate on click, or one press
 * pushes twice and back appears to do nothing.
 *
 * So the link covers the title and subtitle only, and everything that acts on
 * the favourite rather than opening it sits beside it.
 */
export function FavouriteRow({
  favourite,
  to,
  fallbackLabel,
  subtitle,
  emblem,
  children,
  canMoveUp,
  canMoveDown,
  onRemoved,
}: Props) {
  const { strings, t } = useLocale();
  const key = identity(favourite);
  const fieldId = useId();
  const hintId = useId();

  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(favourite.nickname ?? '');
  const fieldRef = useRef<HTMLInputElement>(null);
  const renameRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (renaming) fieldRef.current?.focus();
  }, [renaming]);

  function commitRename() {
    renameFavourite(key, draft);
    setRenaming(false);
    // Back to the control that opened the field, or focus falls to the body.
    renameRef.current?.focus();
  }

  function cancelRename() {
    setDraft(favourite.nickname ?? '');
    setRenaming(false);
    renameRef.current?.focus();
  }

  const title = favouriteLabel(favourite, fallbackLabel);

  return (
    <li className="border-border flex flex-col gap-2 border-b py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        {emblem}

        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Link
            to={to}
            className="rounded-control hover:text-brand-500 focus-visible:outline-brand-500 font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <span dir="auto" className="block truncate">
              {title}
            </span>
          </Link>
          <div className="text-content-muted min-w-0 text-sm">{subtitle}</div>
        </div>

        <div className="flex flex-none items-center gap-0.5">
          <button
            type="button"
            onClick={() => moveFavourite(key, -1)}
            disabled={!canMoveUp}
            className={CONTROL}
          >
            <span className="sr-only">{t(strings.favourites.moveUp)}</span>
            {/* Up and down are not sideways, so these do not mirror in RTL. */}
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 15V5M5 10l5-5 5 5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => moveFavourite(key, 1)}
            disabled={!canMoveDown}
            className={CONTROL}
          >
            <span className="sr-only">{t(strings.favourites.moveDown)}</span>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M10 5v10M5 10l5 5 5-5" />
            </svg>
          </button>

          <button
            ref={renameRef}
            type="button"
            onClick={() => setRenaming((was) => !was)}
            aria-expanded={renaming}
            aria-controls={renaming ? fieldId : undefined}
            className={CONTROL}
          >
            <span className="sr-only">{t(strings.favourites.rename)}</span>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M13.5 3.5l3 3L7 16H4v-3z" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => {
              removeFavourite(key);
              onRemoved();
            }}
            className={CONTROL}
          >
            <span className="sr-only">{t(strings.favourites.remove)}</span>
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </div>

      {renaming && (
        <div className="flex flex-col gap-1.5 ps-1">
          <label htmlFor={fieldId} className="text-content-muted text-xs font-medium">
            {t(strings.favourites.renameLabel)}
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fieldRef}
              id={fieldId}
              value={draft}
              aria-describedby={hintId}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitRename();
                }
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              placeholder={t(strings.favourites.renamePlaceholder)}
              className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 min-w-0 flex-1 border px-2.5 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
            />
            <button
              type="button"
              onClick={commitRename}
              className="rounded-control bg-action text-on-action hover:bg-action-hover hover:text-on-action-hover focus-visible:outline-brand-500 flex-none cursor-pointer px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(strings.favourites.save)}
            </button>
            <button
              type="button"
              onClick={cancelRename}
              className="rounded-control border-border-strong text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex-none cursor-pointer border px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              {t(strings.favourites.cancel)}
            </button>
          </div>
          <p id={hintId} className="text-content-muted text-xs">
            {t(strings.favourites.renameHint)}
          </p>
        </div>
      )}

      {children}
    </li>
  );
}
