import { useEffect, useSyncExternalStore } from 'react';
import { useSession } from '../../auth/useSession';
import { forgetCards, getWallet, loadCards, subscribeToCards } from './cardsStore';

/**
 * Loads the wallet when there is an account to load it for, and drops it when
 * there is not.
 *
 * Keyed on the **account id**, not on `signedIn`. Signing out and straight back
 * in as somebody else is one transition the boolean cannot see, and the
 * consequence of missing it here is somebody else's balance on screen under
 * the new name.
 */
export function useLoadCards(): void {
  const { account, signedIn } = useSession();
  const accountId = account?.id ?? null;

  useEffect(() => {
    if (!signedIn || accountId === null) {
      forgetCards();
      return;
    }
    void loadCards();
  }, [accountId, signedIn]);
}

/**
 * The wallet, kept current.
 *
 * Subscribed rather than read: a balance changes from a control somewhere else
 * on the page, and the tile showing it has to agree without either causing the
 * other to render directly.
 */
export function useWallet(): ReturnType<typeof getWallet> {
  return useSyncExternalStore(subscribeToCards, getWallet);
}
