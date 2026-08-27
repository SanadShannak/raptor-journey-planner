import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useLocale } from '../../i18n';
import { favouriteLabel, identity, type Favourite } from './favourite';
import { moveFavourite, removeFavourite, renameFavourite } from './favouritesStore';

interface Props {
  favourite: Favourite;
  /** Where the card leads — a stop's page, a route's page, the planner. */
  to: string;
  /** The name it came with, shown whenever there is no nickname. */
  fallbackLabel: string;
  /** Under the name: a stop's code, a route's headsign, a journey's ends. */
  subtitle: ReactNode;
  /** The badge or icon that identifies it at a glance. */
  emblem?: ReactNode | undefined;
  /** Live departures, or whatever this kind has to say for itself. */
  children?: ReactNode | undefined;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  /** Focus lands here when the card is removed, so it is never lost to body. */
  onRemoved: () => void;
}

const CONTROL =
  'pointer-events-auto relative rounded-control text-content-muted hover:text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex h-7 w-7 flex-none cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-30';

/**
 * One saved thing, as a card in its category's row.
 *
 * **The whole card leads somewhere**, so the link is an overlay stretched
 * across it rather than wrapped around the name — a button cannot live inside
 * an anchor, and the card carries four of them. The overlay sits underneath the
 * content, which is `pointer-events-none` so presses fall through to it, and
 * each control turns pointers back on for itself. The link keeps a real
 * accessible name of its own ("Open Bulevardi") because the visible name beside
 * it belongs to the rename control instead.
 *
 * **The name is the rename control.** Pressing it turns it into a field —
 * there is no pencil to find, which is the whole point: the thing you want to
 * change is the thing you press. Its accessible name still contains the
 * visible text, so it satisfies label-in-name rather than replacing it.
 */
export function FavouriteCard({
  favourite,
  to,
  fallbackLabel,
  subtitle,
  emblem,
  children,
  canMoveEarlier,
  canMoveLater,
  onRemoved,
}: Props) {
  const { strings, t } = useLocale();
  const key = identity(favourite);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(favourite.nickname ?? '');
  const fieldRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) fieldRef.current?.select();
  }, [editing]);

  const title = favouriteLabel(favourite, fallbackLabel);

  function commit() {
    renameFavourite(key, draft);
    setEditing(false);
    // Back to the name that opened the field, or focus falls to the body.
    nameRef.current?.focus();
  }

  function cancel() {
    setDraft(favourite.nickname ?? '');
    setEditing(false);
    nameRef.current?.focus();
  }

  return (
    <li className="border-border bg-surface-raised rounded-card relative flex w-80 flex-none flex-col border">
      {/*
        Underneath everything, covering the card. `rounded-card` on it too, so
        the focus ring traces the card's own corners rather than a rectangle
        sitting proud of them.
      */}
      <Link
        to={to}
        className="rounded-card focus-visible:outline-brand-500 absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="sr-only">{t(strings.favourites.openNamed, { name: title })}</span>
      </Link>

      <div className="pointer-events-none relative flex flex-col gap-2 p-3">
        <div className="flex items-start gap-2">
          {emblem}

          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {editing ? (
              <input
                ref={fieldRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commit();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancel();
                  }
                }}
                placeholder={t(strings.favourites.renamePlaceholder)}
                aria-label={t(strings.favourites.rename)}
                className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 pointer-events-auto relative w-full border px-1.5 py-0.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-1"
              />
            ) : (
              <button
                ref={nameRef}
                type="button"
                onClick={() => setEditing(true)}
                aria-label={t(strings.favourites.renameNamed, { name: title })}
                className="rounded-control hover:decoration-content-muted focus-visible:outline-brand-500 pointer-events-auto relative cursor-text text-start text-sm font-medium underline decoration-transparent decoration-dotted underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
              >
                <span dir="auto" className="block truncate">
                  {title}
                </span>
              </button>
            )}

            <div className="text-content-muted min-w-0 text-xs">{subtitle}</div>
          </div>
        </div>

        {children}

        <div className="border-border -mx-1 flex items-center justify-end gap-0.5 border-t pt-1.5">
          <button
            type="button"
            onClick={() => moveFavourite(key, -1)}
            disabled={!canMoveEarlier}
            className={CONTROL}
          >
            <span className="sr-only">{t(strings.favourites.moveEarlier)}</span>
            {/* Along the row, so these are directional and mirror in RTL. */}
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
              <path d="M12 4l-6 6 6 6" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => moveFavourite(key, 1)}
            disabled={!canMoveLater}
            className={CONTROL}
          >
            <span className="sr-only">{t(strings.favourites.moveLater)}</span>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
              <path d="M8 4l6 6-6 6" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => {
              removeFavourite(key);
              onRemoved();
            }}
            className={`${CONTROL} hover:text-danger`}
          >
            <span className="sr-only">{t(strings.favourites.remove)}</span>
            <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </div>
      </div>
    </li>
  );
}
