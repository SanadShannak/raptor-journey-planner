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
}
