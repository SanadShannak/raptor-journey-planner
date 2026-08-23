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

/** Error envelope the backend returns alongside a non-2xx status. */
export interface ApiErrorBody {
  /** Stable machine-readable code, e.g. `MISSING_ORIGIN`, `NO_ACTIVE_SERVICES`. */
  errorCode: string;
  /** Human-readable English explanation intended for developers, not end users. */
  error: string;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** HTTP status, present when `kind` is `'http'`. */
  readonly status: number | null;
  /** Backend `errorCode`, present when the server sent a structured error body. */
  readonly code: string | null;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number | null; code?: string | null; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.kind = kind;
    this.status = options.status ?? null;
    this.code = options.code ?? null;
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

/** True when a *rejection* is the "no journey exists" empty state. */
export function isNoRouteFound(value: unknown): boolean {
  return isApiError(value) && value.code === NO_ROUTE_FOUND;
}

/** Narrows an unknown caught value to {@link ApiError}. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/**
 * Reads the backend's `{ errorCode, error }` envelope if it is present.
 * Returns `null` for non-JSON bodies (an HTML 404 page, an empty body, …).
 */
export function parseApiErrorBody(value: unknown): ApiErrorBody | null {
  if (typeof value !== 'object' || value === null) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.errorCode !== 'string' || typeof body.error !== 'string') {
    return null;
  }
  return { errorCode: body.errorCode, error: body.error };
}
