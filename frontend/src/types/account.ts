/**
 * Who is signed in.
 *
 * Deliberately only the three fields every account response carries. The
 * session itself is **not** here and cannot be: it is an HTTP-only cookie, so
 * script never sees a token and there is nothing to model. "Signed in" is
 * therefore not a value this app holds — it is the answer to
 * `GET /api/auth/me`, which is why `AuthProvider` asks once on load rather
 * than reading anything back out of storage.
 *
 * `/api/auth/me` also returns the saved-item arrays on the same object. They
 * are left off this type on purpose: saved items have their own store with its
 * own loading and error states, and an `Account` that sometimes carried them
 * and sometimes did not — register and login return neither — would be a type
 * whose shape depended on which call produced it.
 */
export interface Account {
  /** Mongo `_id`, as a string. Never shown; it identifies nothing to a reader. */
  id: string;
  name: string;
  email: string;
  /**
   * Whether the address has been confirmed through the emailed link.
   *
   * Unverified accounts can do everything; this only decides whether the
   * banner asking them to confirm is shown. A server from before verification
   * existed sends no such field, and that reads as `true` — nobody should be
   * nagged about a link that was never sent.
   */
  emailVerified: boolean;
}
