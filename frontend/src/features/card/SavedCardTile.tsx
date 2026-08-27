import { useEffect, useId, useRef, useState } from 'react';
import { lookupCard } from '../../api/card';
import { formatMoney, messageForApiError, useLocale } from '../../i18n';
import { formatCardNumber } from './cardNumber';
import { savedCardLabel, type SavedCard } from './savedCard';
import { removeSavedCard, renameSavedCard } from './savedCardsStore';
import type { TravelCard } from '../../types/card';

interface Props {
  card: SavedCard;
  currency: string | null;
  /** Focus lands here when the tile is removed, so it is never lost to body. */
  onRemoved: () => void;
}

type State = 'loading' | 'found' | 'failed';

/**
 * One saved card, as a tile that checks its own balance.
 *
 * Deliberately fetches on its own rather than being handed a balance from the
 * page — a balance is only ever true at the moment it was asked for, so a
 * page-level fetch shared across tiles would be reporting one card's staleness
 * as every other card's answer too.
 *
 * No stored balance, ever. What is kept is only the number and the nickname —
 * the same discipline `favouritesStorage.ts` applies to a stop's name: cache
 * what draws the tile before anything answers, never cache the thing that
 * would go stale in someone's pocket.
 */
export function SavedCardTile({ card, currency, onRemoved }: Props) {
  const { locale, strings, t } = useLocale();
  const [state, setState] = useState<State>('loading');
  const [balance, setBalance] = useState<TravelCard | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(card.nickname ?? '');
  const fieldRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLButtonElement>(null);

  const fieldId = useId();
  const formattedNumber = formatCardNumber(card.number);
  const title = savedCardLabel(card, formattedNumber);

  useEffect(() => {
    const controller = new AbortController();

    const load = () => {
      setState('loading');

      void lookupCard(card.number, { signal: controller.signal })
        .then((found) => {
          if (controller.signal.aborted) return;
          setBalance(found);
          setState('found');
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setBalance(null);
          setState('failed');
          setErrorMessage(t(messageForApiError(error, strings)));
        });
    };

    load();

    return () => controller.abort();
  }, [card.number, refreshToken, strings, t]);

  function commit() {
    renameSavedCard(card.number, draft);
    setEditing(false);
    nameRef.current?.focus();
  }

  function cancel() {
    setDraft(card.nickname ?? '');
    setEditing(false);
    nameRef.current?.focus();
  }

  return (
    /*
      The same surface, border, and text tokens the balance panel below uses —
      not the bar's own `chrome` — so a saved card is legible against both
      colour schemes using only pairs `check:contrast` already verifies rather
      than an alpha-blended shade of `on-chrome` invented for this one tile.
      The brand-coloured top edge is what still marks it as a card rather than
      a plain panel.
    */
    <li className="bg-surface-raised border-border border-t-brand-500 rounded-card shadow-card flex w-72 flex-none flex-col gap-3 border border-t-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {editing ? (
            <input
              ref={fieldRef}
              id={fieldId}
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
              placeholder={t(strings.card.renamePlaceholder)}
              aria-label={t(strings.card.rename)}
              className="rounded-control border-border-strong bg-surface text-content placeholder:text-content-muted focus-visible:outline-brand-500 w-full border px-1.5 py-0.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-1"
            />
          ) : (
            <button
              ref={nameRef}
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t(strings.card.renameNamed, { name: title })}
              className="rounded-control hover:decoration-content-muted focus-visible:outline-brand-500 cursor-text truncate text-start text-sm font-semibold underline decoration-transparent decoration-dotted underline-offset-4 transition-colors focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              {title}
            </button>
          )}

          {/*
            Only when a nickname is actually doing something. With none, the
            title above is already the number itself, and printing it again
            underneath would say the same thing twice for no reason.
          */}
          {card.nickname !== null && card.nickname.trim() !== '' && (
            <span dir="ltr" className="text-content-muted truncate text-xs tabular-nums">
              {formattedNumber}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            removeSavedCard(card.number);
            onRemoved();
          }}
          aria-label={t(strings.card.removeSaved)}
          className="rounded-control text-content-muted hover:text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex h-7 w-7 flex-none cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      <div className="border-border flex items-end justify-between gap-2 border-t pt-2.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-content-muted text-xs font-semibold tracking-wide uppercase">
            {t(strings.card.balance)}
          </span>
          {state === 'loading' && (
            <span className="text-content-muted text-sm">{t(strings.card.checking)}</span>
          )}
          {state === 'found' && balance !== null && (
            <span className="text-xl font-semibold tabular-nums">
              {formatMoney(balance.balance, currency, locale)}
            </span>
          )}
          {state === 'failed' && (
            <span className="text-danger text-xs">{errorMessage}</span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setRefreshToken((token) => token + 1)}
          disabled={state === 'loading'}
          aria-label={t(strings.card.refreshBalance)}
          className="rounded-control text-content-muted hover:text-content hover:bg-surface-muted focus-visible:outline-brand-500 flex h-7 w-7 flex-none cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 10a6 6 0 0110.5-3.9M16 10a6 6 0 01-10.5 3.9M14.5 4v3h-3M5.5 16v-3h3" />
          </svg>
        </button>
      </div>
    </li>
  );
}
