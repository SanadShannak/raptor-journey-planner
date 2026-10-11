/**
 * Minimal HTTP layer over native `fetch`.
 *
 * Its only jobs are building the URL, carrying the session cookie, applying a
 * timeout, and turning every failure mode into an {@link ApiError}.
 * Endpoint-specific knowledge lives in the modules next to this one.
 */

import { env } from '../config/env';
import { ApiError, parseApiErrorBody } from './errors';

/** Query values are serialised as strings; `undefined` entries are omitted. */
export type QueryParams = Record<string, string | number | undefined>;

/** The methods this app actually uses. */
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  params?: QueryParams | undefined;
  /** Lets a caller cancel in-flight requests, e.g. when inputs change. */
  signal?: AbortSignal | undefined;
}

interface WriteOptions extends RequestOptions {
  /** Serialised as JSON. Omitted entirely rather than sent as `null`. */
  body?: unknown;
}

/**
 * Resolves a path against the configured base.
 *
 * The base may be an absolute origin (`http://localhost:3000`) or empty, which
 * means **this page's own origin** — see `config/env.ts` for why same-origin is
 * the configuration that actually works with a cookie session. `URL`'s second
 * argument handles both: an absolute base wins outright, and an empty one
 * leaves the document's origin in place.
 */
function buildUrl(path: string, params: QueryParams | undefined): string {
  const base = env.apiBaseUrl === '' ? documentOrigin() : env.apiBaseUrl;
  const url = new URL(`${base}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * Where a relative base resolves to.
 *
 * `location` is absent in a non-browser context — a unit test that imports an
 * API module without jsdom — and a thrown `ReferenceError` there would read as
 * a bug in the module under test rather than as a missing environment.
 */
function documentOrigin(): string {
  return typeof location === 'undefined' ? 'http://localhost' : location.origin;
}

/**
 * Combines abort signals.
 *
 * `AbortSignal.any` is the newest platform API this app relies on (Safari 17.4,
 * March 2024), so it is feature-detected. The fallback wires the sources up by
 * hand and behaves identically for our purposes.
 */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') {
    return AbortSignal.any(signals);
  }

  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), {
      once: true,
      signal: controller.signal,
    });
  }
  return controller.signal;
}

/** Reads the body as JSON, tolerating servers that reply with HTML or nothing. */
async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * Performs one request and returns the parsed JSON body.
 *
 * **Every call sends credentials.** The session is an HTTP-only cookie, which
 * means it is not readable from script and cannot be attached by hand — the
 * only way it travels is `credentials: 'include'`, and a protected endpoint
 * called without it answers 401 no matter who is signed in. Set here rather
 * than per call site so no endpoint module can forget it.
 *
 * The body is returned as `unknown`; callers are responsible for asserting the
 * shape they expect.
 */
async function request(
  method: Method,
  path: string,
  options: WriteOptions = {},
): Promise<unknown> {
  const url = buildUrl(path, options.params);
  const timeout = AbortSignal.timeout(env.apiTimeoutMs);
  const signal = options.signal ? anySignal([options.signal, timeout]) : timeout;

  const headers: Record<string, string> = { Accept: 'application/json' };
  const hasBody = options.body !== undefined;
  if (hasBody) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers,
      credentials: 'include',
      ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
    });
  } catch (cause) {
    if (timeout.aborted) {
      throw new ApiError('timeout', `Request to ${path} timed out.`, { cause });
    }
    // A caller-initiated abort is propagated untouched so `AbortError` checks
    // and React effect cleanups keep working as callers expect.
    if (options.signal?.aborted) {
      throw cause;
    }
    throw new ApiError('network', `Could not reach the server at ${url}.`, {
      cause,
    });
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    const errorBody = parseApiErrorBody(body);
    throw new ApiError('http', errorBody?.error ?? `Request to ${path} failed.`, {
      status: response.status,
      code: errorBody?.errorCode ?? null,
      fieldErrors: errorBody?.fieldErrors,
    });
  }

  if (body === null) {
    throw new ApiError('malformed', `Server returned an unreadable body for ${path}.`, {
      status: response.status,
    });
  }

  return body;
}

export function getJson(path: string, options: RequestOptions = {}): Promise<unknown> {
  return request('GET', path, options);
}

export function postJson(path: string, options: WriteOptions = {}): Promise<unknown> {
  return request('POST', path, options);
}

export function patchJson(path: string, options: WriteOptions = {}): Promise<unknown> {
  return request('PATCH', path, options);
}

export function deleteJson(path: string, options: WriteOptions = {}): Promise<unknown> {
  return request('DELETE', path, options);
}
