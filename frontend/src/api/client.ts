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
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  } catch (cause) {
    if (timeout.aborted) {
      throw new ApiError('timeout', `Request to ${path} timed out.`, { cause });
    }
    // A caller-initiated abort is propagated untouched so `AbortError` checks
    // and React effect cleanups keep working as callers expect.
    if (options.signal?.aborted) throw cause;
    throw new ApiError('network', `Could not reach the server at ${env.apiBaseUrl}.`, {
      cause,
    });
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    const errorBody = parseApiErrorBody(body);
    throw new ApiError('http', errorBody?.error ?? `Request to ${path} failed.`, {
      status: response.status,
      code: errorBody?.errorCode ?? null,
    });
  }

  if (body === null) {
    throw new ApiError('malformed', `Server returned an unreadable body for ${path}.`, {
      status: response.status,
    });
  }

  return body;
}
