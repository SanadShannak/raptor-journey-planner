import { describe, expect, it } from 'vitest';
import { ApiError, isNoRouteFound } from '../api/errors';
import { messageForApiError } from './apiError';
import { en } from './en';
import { ar } from './ar';

const httpError = (code: string | null, status = 404) =>
  new ApiError('http', 'developer-facing text', { status, code });

describe('messageForApiError', () => {
  it('maps every code the backend documents to its own message', () => {
    const codes = [
      'MISSING_ORIGIN',
      'MISSING_DESTINATION',
      'BAD_DATE',
      'BAD_TIME',
      'SAME_ORIGIN_TARGET',
      'NO_ACTIVE_SERVICES',
      'ORIGIN_OUT_OF_BOUNDS',
      'ORIGIN_STOP_NOT_FOUND',
      'DESTINATION_OUT_OF_BOUNDS',
      'DESTINATION_STOP_NOT_FOUND',
    ];

    const messages = codes.map((code) => messageForApiError(httpError(code), en));

    // Each is a real message, and none silently collapsed into the generic one.
    for (const message of messages) {
      expect(typeof message).toBe('string');
      expect(message).not.toBe(en.errors.generic);
    }
    expect(new Set(messages).size).toBe(codes.length);
  });

  it('distinguishes how the request failed, not just why', () => {
    expect(messageForApiError(new ApiError('network', 'x'), en)).toBe(en.errors.network);
    expect(messageForApiError(new ApiError('timeout', 'x'), en)).toBe(en.errors.timeout);
    expect(messageForApiError(new ApiError('malformed', 'x'), en)).toBe(en.errors.malformed);
  });

  /*
   * The backend is free to add codes without the frontend shipping at the same
   * time, so an unknown one must degrade rather than render blank.
   */
  it('falls back for an unrecognised code', () => {
    expect(messageForApiError(httpError('BRAND_NEW_CODE'), en)).toBe(en.errors.generic);
    expect(messageForApiError(httpError(null), en)).toBe(en.errors.generic);
    expect(messageForApiError(httpError('WHATEVER', 500), en)).toBe(en.errors.serverError);
  });

  it('never shows the API developer text', () => {
    const error = httpError('BRAND_NEW_CODE');
    expect(messageForApiError(error, en)).not.toContain('developer-facing');
  });

  it('handles a rejection that is not an ApiError at all', () => {
    expect(messageForApiError(new TypeError('boom'), en)).toBe(en.errors.generic);
    expect(messageForApiError(undefined, en)).toBe(en.errors.generic);
  });

  /*
   * The load-bearing one. NO_ROUTE_FOUND is a search that worked and found
   * nothing — an empty state. If it ever reaches the error path it must be a
   * visible generic failure, not a specific message that would make rendering
   * it as an error look intentional.
   */
  it('treats NO_ROUTE_FOUND as an empty state, not an error message', () => {
    const error = httpError('NO_ROUTE_FOUND');
    expect(isNoRouteFound(error)).toBe(true);
    expect(messageForApiError(error, en)).toBe(en.errors.generic);
  });

  it('is not fooled by a different code or a non-error', () => {
    expect(isNoRouteFound(httpError('BAD_DATE'))).toBe(false);
    expect(isNoRouteFound(new TypeError('boom'))).toBe(false);
    expect(isNoRouteFound(null)).toBe(false);
  });

  it('resolves in Arabic too', () => {
    const message = messageForApiError(httpError('BAD_DATE'), ar);
    expect(message).toBe(ar.errors.badDate);
    expect(message).not.toBe(en.errors.badDate);
  });
});
