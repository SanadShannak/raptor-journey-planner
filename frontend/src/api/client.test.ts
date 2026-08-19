import { afterEach, describe, expect, it, vi } from 'vitest';
import { getJson } from './client';
import { ApiError } from './errors';

function respondWith(body: string, init: ResponseInit = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(body, { status: 200, ...init })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getJson', () => {
  it('builds the URL from the configured base and query params', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await getJson('/api/route', { params: { a: 'x', n: 2 } });

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.origin).toBe('http://api.test');
    expect(url.pathname).toBe('/api/route');
    expect(url.searchParams.get('a')).toBe('x');
    expect(url.searchParams.get('n')).toBe('2');
  });

  it('omits undefined params rather than sending "undefined"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetchMock);

    await getJson('/api/route', { params: { kept: 'yes', dropped: undefined } });

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.has('dropped')).toBe(false);
    expect(url.searchParams.get('kept')).toBe('yes');
  });

  it('surfaces the backend errorCode on a structured error response', async () => {
    respondWith(
      JSON.stringify({ errorCode: 'NO_ROUTE_FOUND', error: 'No route.' }),
      { status: 404 },
    );

    const error = await getJson('/api/route').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('http');
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).code).toBe('NO_ROUTE_FOUND');
  });

  // Unknown paths return an Express HTML page, not JSON.
  it('still produces an ApiError when an error body is not JSON', async () => {
    respondWith('<html>Cannot GET /api/nope</html>', { status: 404 });

    const error = await getJson('/api/nope').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('http');
    expect((error as ApiError).code).toBeNull();
  });

  it('reports a network failure as kind "network"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await getJson('/api/valid-dates').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('network');
  });

  it('reports an unreadable success body as kind "malformed"', async () => {
    respondWith('not json at all', { status: 200 });

    const error = await getJson('/api/valid-dates').catch((e: unknown) => e);

    expect((error as ApiError).kind).toBe('malformed');
  });

  /*
   * A caller aborting is not an API failure — React effect cleanup relies on
   * the original AbortError propagating untouched.
   */
  it('propagates a caller abort rather than wrapping it', async () => {
    const controller = new AbortController();
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        controller.abort();
        return Promise.reject(abortError);
      }),
    );

    const error = await getJson('/api/valid-dates', {
      signal: controller.signal,
    }).catch((e: unknown) => e);

    expect(error).toBe(abortError);
    expect(error).not.toBeInstanceOf(ApiError);
  });
});
