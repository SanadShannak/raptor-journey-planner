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
  /** Under the name: a stop's code, a route's headsign. */
  subtitle: ReactNode;
  /** The badge or icon that identifies it at a glance. */
  emblem?: ReactNode | undefined;
  /** Live departures, or whatever this kind has to say for itself. */
  children?: ReactNode | undefined;
  /** Paging controls for {@link children}, drawn in the footer. */
  pager?: ReactNode | undefined;
  /** Focus lands here when the card is removed, so it is never lost to body. */
  onRemoved: () => void;
  /** True while this card is the one being dragged, so it can dim. */
  dragging: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
}

const CONTROL =
  'pointer-events-auto relative rounded-control text-content-muted hover:text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex h-7 w-7 flex-none cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-30';

/**
 * One saved thing, as a card in its category's row.
 *
 * **The whole card leads somewhere**, so the link is an overlay stretched
 * underneath the content rather than wrapped around the name — a button cannot
 * live inside an anchor, and the card carries several. The content is
 * `pointer-events-none` so presses fall through to the overlay, and each
 * control turns pointers back on for itself.
 *
 * **The name is the rename control.** Pressing it turns it into a field in
 * place; there is no pencil to find first.
 *
 * **Reordering is a drag**, which is the gesture the arrangement actually
 * wants — dropping the fifth card at the front is one movement rather than
 * four presses. A drag alone is not operable by keyboard, though, so the same
 * move is on `Alt` with the arrow keys, and the card says so. The arrows are
 * read *visually*: in Arabic the row runs the other way, so `ArrowRight` moves
 * a card earlier, which is what "earlier" looks like on that screen.
 */
export function FavouriteCard({
  favourite,
  to,
  fallbackLabel,
  subtitle,
  emblem,
  children,
  pager,
  onRemoved,
  dragging,
  onDragStart,
  onDragEnter,
  onDragEnd,
}: Props) {
  const { direction, strings, t } = useLocale();
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
    <li
      /*
       * Not draggable while a name is being edited: a drag would steal the
       * pointer from selecting text inside the field.
       */
      draggable={!editing}
      onDragStart={(event) => {
        // Firefox refuses to start a drag without data on the transfer.
        event.dataTransfer.setData('text/plain', key);
        event.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(event) => event.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(event) => {
        event.preventDefault();
        onDragEnd();
      }}
      className={`border-border bg-surface-raised rounded-card relative flex w-80 flex-none cursor-grab flex-col border transition-opacity active:cursor-grabbing ${
        dragging ? 'opacity-40' : ''
      }`}
    >
      <Link
        to={to}
        onKeyDown={(event) => {
          if (!event.altKey) return;
          const earlier = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
          const later = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
          if (event.key !== earlier && event.key !== later) return;
          event.preventDefault();
          moveFavourite(key, event.key === earlier ? -1 : 1);
        }}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight"
        className="rounded-card focus-visible:outline-brand-500 absolute inset-0 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="sr-only">{t(strings.favourites.openNamed, { name: title })}</span>
      </Link>

      <div className="pointer-events-none relative flex flex-1 flex-col gap-1.5 p-2.5">
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

            {subtitle !== null && (
              <div className="text-content-muted min-w-0 text-xs">{subtitle}</div>
            )}
          </div>
        </div>

        {children}

        <div className="border-border -mx-0.5 mt-auto flex items-center justify-between gap-1 border-t pt-1">
          {/* The pager belongs to the list above it, so it sits at the start. */}
          <div className="flex items-center gap-0.5">{pager}</div>

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

/**
 * Steps a card's own departure list, three at a time.
 *
 * The card shows a glance, but the glance runs out — the next three at a stop
 * is often "nothing for twenty minutes, then three at once". These walk the
 * rest of what was already fetched, so paging costs no request at all, and
 * stop at the end rather than wrapping: there is nothing after the last one.
 */
export function DeparturePager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (next: number) => void;
}) {
  const { strings, t } = useLocale();
  if (pages <= 1) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className={CONTROL}
      >
        <span className="sr-only">{t(strings.favourites.showEarlier)}</span>
        {/* Along the list, so directional: mirrored in Arabic. */}
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
          <path d="M12 4l-6 6 6 6" />
        </svg>
      </button>

      <button
        type="button"
        onClick={() => onPage(page + 1)}
        disabled={page >= pages - 1}
        className={CONTROL}
      >
        <span className="sr-only">{t(strings.favourites.showMore)}</span>
        <svg viewBox="0 0 20 20" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="rtl:-scale-x-100">
          <path d="M8 4l6 6-6 6" />
        </svg>
      </button>
    </>
  );
}
