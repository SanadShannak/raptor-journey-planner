/**
 * Minimal HTTP layer over native `fetch`.
 *
 * Its only jobs are building the URL, applying a timeout, and turning every
 * failure mode into an {@link ApiError}. Endpoint-specific knowledge lives in
 * the modules next to this one.
 */

import { env } from '../config/env';
import { ApiError, parseApiErrorBody } from './errors';

/** Query values are serialised as strings; `undefined` entries are omitted. */
export type QueryParams = Record<string, string | number | undefined>;

interface RequestOptions {
  params?: QueryParams | undefined;
  /** Lets a caller cancel in-flight requests, e.g. when inputs change. */
  signal?: AbortSignal | undefined;
}

function buildUrl(path: string, params: QueryParams | undefined): string {
  const url = new URL(`${env.apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
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

/**
 * Times one call and prints it, mirroring the engine's own line.
 *
 * The backend already reports `[API]: Route Calculated in 12.34ms` from
 * `plannerApi.js`; this is the same measurement from the other end of the wire,
 * so the two can be read together — the gap between them is the network and the
 * parse, which is exactly what you want to see when a page starts feeling slow.
 *
 * Every request goes through `getJson`, so instrumenting here covers the whole
 * app without a call site having to remember. Failures are timed too: a request
 * that took four seconds to fail is the more interesting number.
 *
 * Development only. A production console filling with one line per departure
 * board refresh would be noise for a visitor, and this is a debugging aid.
 */
function logTiming(path: string, startedAt: number, outcome: string): void {
  if (!import.meta.env.DEV) return;
  const elapsed = (performance.now() - startedAt).toFixed(2);
  console.log(`[API]: GET ${path} ${outcome} in ${elapsed}ms`);
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
 * Performs a GET request and returns the parsed JSON body.
 *
 * The body is returned as `unknown`; callers are responsible for asserting the
 * shape they expect.
 */
export async function getJson(path: string, options: RequestOptions = {}): Promise<unknown> {
  const url = buildUrl(path, options.params);
  const timeout = AbortSignal.timeout(env.apiTimeoutMs);
  const signal = options.signal ? anySignal([options.signal, timeout]) : timeout;
  const startedAt = performance.now();

  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (cause) {
    if (timeout.aborted) {
      logTiming(path, startedAt, 'timed out');
      throw new ApiError('timeout', `Request to ${path} timed out.`, { cause });
    }
    // A caller-initiated abort is propagated untouched so `AbortError` checks
    // and React effect cleanups keep working as callers expect.
    if (options.signal?.aborted) {
      logTiming(path, startedAt, 'cancelled');
      throw cause;
    }
    logTiming(path, startedAt, 'failed');
    throw new ApiError('network', `Could not reach the server at ${env.apiBaseUrl}.`, {
      cause,
    });
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    logTiming(path, startedAt, `failed ${response.status}`);
    const errorBody = parseApiErrorBody(body);
    throw new ApiError('http', errorBody?.error ?? `Request to ${path} failed.`, {
      status: response.status,
      code: errorBody?.errorCode ?? null,
    });
  }

  if (body === null) {
    logTiming(path, startedAt, 'unreadable');
    throw new ApiError('malformed', `Server returned an unreadable body for ${path}.`, {
      status: response.status,
    });
  }

  logTiming(path, startedAt, 'ok');
  return body;
}
