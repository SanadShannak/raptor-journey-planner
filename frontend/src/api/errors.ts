/**
 * A single error type for every way an API call can fail, so callers handle one
 * shape instead of branching on `TypeError` vs. status codes vs. parse errors.
 */

export type ApiErrorKind =
  /** The request never produced a response: offline, DNS, CORS, connection refused. */
  | 'network'
  /** The request was aborted by the caller or by the client timeout. */
  | 'timeout'
  /** The server responded with a non-2xx status. */
  | 'http'
  /** The server responded with a body that could not be read as expected JSON. */
  | 'malformed';

/**
 * Error envelope the backend returns alongside a non-2xx status.
 *
 * **Two envelopes exist, and only one of them carries a code.** The
 * feed-backed endpoints — the planner, stops, routes, the network manifest —
 * answer with `{ errorCode, error }`. The database-backed ones added with
 * accounts (`/api/auth`, `/api/user`, `/api/cards`) answer with `{ message }`,
 * or with express-validator's `{ errors: [...] }` when a field is rejected.
 *
 * So `errorCode` here is **null for anything account-shaped**, and that is the
 * whole reason {@link fieldErrors} and the per-endpoint mapping in `auth.ts`,
 * `cards.ts` and `savedItems.ts` exist: those modules know which call they
 * made and therefore what a bare 400 or 422 from it means, and they synthesise
 * the stable code the rest of the app reads. Nothing downstream has to know
 * which half of the API it was talking to.
 */
export interface ApiErrorBody {
  /** Stable machine-readable code, or null when the endpoint sends none. */
  errorCode: string | null;
  /** Human-readable English explanation intended for developers, not end users. */
  error: string;
  /** Per-field complaints, when the server rejected individual fields. */
  fieldErrors: FieldErrors;
}

/**
 * Which fields the server rejected, keyed by field name.
 *
 * The values are the server's own English and are **never shown** — a form
 * uses the presence of a key to mark its field invalid and prints its own
 * localised message. Kept at all because "which field" is information the
 * dictionary cannot supply and the form genuinely needs.
 */
export type FieldErrors = Readonly<Record<string, string>>;

const NO_FIELD_ERRORS: FieldErrors = {};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, present when `kind` is `'http'`. */
  readonly status: number | null;
  /** Backend `errorCode`, or one synthesised by the calling API module. */
  readonly code: string | null;
  /** Fields the server rejected by name. Empty for every other failure. */
  readonly fieldErrors: FieldErrors;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: {
      status?: number | null;
      code?: string | null;
      cause?: unknown;
      fieldErrors?: FieldErrors | undefined;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.code = options.code ?? null;
    this.fieldErrors = options.fieldErrors ?? NO_FIELD_ERRORS;
  }

  /**
   * The same error carrying a stable code.
   *
   * How an API module turns "a 400 from the fare endpoint" into
   * `INSUFFICIENT_BALANCE` without losing the status or the field errors that
   * came with it. Returns a new instance; `ApiError` is treated as immutable.
   */
  withCode(code: string): ApiError {
    return new ApiError(this.kind, this.message, {
      status: this.status,
      code,
      cause: this.cause,
      fieldErrors: this.fieldErrors,
    });
  }
}

/**
 * Backend `errorCode` for a search that ran fine and found nothing.
 *
 * This is an **empty state, not a failure**. It can arrive either way — inside
 * a 200 body, where the engine reports its own outcome, or as a 404 — so
 * `planJourney` unwraps both. Callers must branch on it before reaching any
 * error path: a rider who asked for an impossible journey has not encountered
 * a problem with the app.
 */
export const NO_ROUTE_FOUND = 'NO_ROUTE_FOUND';

/**
 * No usable session — the cookie is absent, expired, or names a deleted user.
 *
 * Synthesised from a 401 by {@link unauthorized} rather than sent by the
 * server, which says only `{ message: "Not authorized. Please log in." }`.
 * Every protected endpoint can answer this way at any moment, because a JWT
 * expires on its own schedule rather than when anybody is looking.
 */
export const UNAUTHORIZED = 'UNAUTHORIZED';

/** True when a *rejection* is the "no journey exists" empty state. */
export function isNoRouteFound(value: unknown): boolean {
  return isApiError(value) && value.code === NO_ROUTE_FOUND;
}

/**
 * True when the session is gone.
 *
 * Keyed on the status rather than on the synthesised code, so it is also true
 * for a 401 nothing has mapped yet — a new protected endpoint added later
 * cannot forget to be recognised here.
 */
export function isUnauthorized(value: unknown): boolean {
  return isApiError(value) && value.status === 401;
}

/** Narrows an unknown caught value to {@link ApiError}. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Reads express-validator's `errors` array into a field map.
 *
 * Its entries are `{ type, value, msg, path, location }`. Only `path` and
 * `msg` are of any use here, and an entry missing either is dropped rather
 * than stored under a made-up key. The **first** complaint about a field wins:
 * the rules run in order, so the earliest is the most fundamental one — "not
 * an email" before "too short".
 */
function parseFieldErrors(value: unknown): FieldErrors {
  if (!Array.isArray(value)) return NO_FIELD_ERRORS;

  const found: Record<string, string> = {};
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const { path, msg } = entry;
    if (typeof path !== 'string' || path === '') continue;
    if (typeof msg !== 'string') continue;
    if (found[path] === undefined) found[path] = msg;
  }
  return found;
}

/**
 * Reads whichever error envelope the server sent.
 *
 * Returns `null` only for a body that is no envelope at all — an HTML 404
 * page, an empty body — so a caller can tell "the server explained itself" from
 * "something else answered".
 */
export function parseApiErrorBody(value: unknown): ApiErrorBody | null {
  if (!isRecord(value)) return null;

  // The feed-backed envelope, which is the only one with a stable code.
  if (typeof value['errorCode'] === 'string' && typeof value['error'] === 'string') {
    return {
      errorCode: value['errorCode'],
      error: value['error'],
      fieldErrors: NO_FIELD_ERRORS,
    };
  }

  const fieldErrors = parseFieldErrors(value['errors']);
  const message = value['message'];

  if (Object.keys(fieldErrors).length > 0) {
    return {
      errorCode: null,
      // Developer-facing, like every `error` string here, and never shown.
      error: typeof message === 'string' ? message : 'Request was rejected.',
      fieldErrors,
    };
  }

  if (typeof message === 'string') {
    return { errorCode: null, error: message, fieldErrors: NO_FIELD_ERRORS };
  }

  return null;
}
