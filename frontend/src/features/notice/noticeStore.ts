/**
 * Whether the independence notice is open, and whether it is holding.
 *
 * A module-level store with listeners, the same shape as the tour's: it is
 * opened from the header, drawn by a host in the layout, and waited on by the
 * tour, and none of those is the parent of the others.
 *
 * **It is held in memory only, and that is what makes it show on every load.**
 * A module-level value survives navigation inside the app, so moving between
 * pages does not bring it back, and does not survive a reload or a new visit,
 * so each of those opens on it.
 */

interface NoticeState {
  open: boolean;
  /** The opening showing, which cannot be dismissed for a few seconds. */
  hold: boolean;
}

const ON_LOAD: NoticeState = { open: true, hold: true };

let state: NoticeState = ON_LOAD;

const listeners = new Set<() => void>();

function commit(next: NoticeState): void {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribeToNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNoticeState(): NoticeState {
  return state;
}

/** Rereading it, from the header. Somebody who asked for it is not held. */
export function openNotice(): void {
  commit({ open: true, hold: false });
}

export function closeNotice(): void {
  commit({ open: false, hold: false });
}

/** For tests: back to how a new page load starts. */
export function reloadNotice(): void {
  commit(ON_LOAD);
}
