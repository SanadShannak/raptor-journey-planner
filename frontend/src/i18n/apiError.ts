/**
 * Turns an API failure into something a person can read.
 *
 * The backend's own `error` string is developer-facing English and is never
 * shown; only the stable `errorCode` is mapped. Anything unrecognised — a new
 * code, a proxy error page, a network fault — falls through to a generic
 * message rather than leaking internals or rendering blank.
 *
 * This is the one place `i18n` is allowed to reach into `api`, and it points
 * that way round: the API layer knows nothing about language.
 */

import { isApiError } from '../api/errors';
import type { Dictionary, Message } from './dictionary';

/**
 * Every `errorCode` the backend can send, mapped to a dictionary key.
 *
 * Typed against `Dictionary['errors']` so a renamed message is a compile
 * error rather than a silent fallback to the generic text.
 *
 * `NO_ROUTE_FOUND` is deliberately absent: it is an empty state, and callers
 * branch on `isNoRouteFound` from the API layer before they get here.
 */
const MESSAGE_FOR_CODE: Record<string, keyof Dictionary['errors']> = {
  MISSING_ORIGIN: 'missingOrigin',
  MISSING_DESTINATION: 'missingDestination',
  BAD_DATE: 'badDate',
  BAD_TIME: 'badTime',
  SAME_ORIGIN_TARGET: 'sameOriginTarget',
  NO_ACTIVE_SERVICES: 'noActiveServices',
  ORIGIN_OUT_OF_BOUNDS: 'originOutOfBounds',
  ORIGIN_STOP_NOT_FOUND: 'originStopNotFound',
  DESTINATION_OUT_OF_BOUNDS: 'destinationOutOfBounds',
  DESTINATION_STOP_NOT_FOUND: 'destinationStopNotFound',
  STOP_NOT_FOUND: 'originStopNotFound',
  LINE_NOT_FOUND: 'generic',
  PATTERN_NOT_FOUND: 'generic',
  INTERNAL_SERVER_ERROR: 'serverError',
};

/**
 * The message to show for a rejected API call.
 *
 * How the request failed is decided first: a request that never reached the
 * server needs different advice from one the server rejected, and no
 * `errorCode` exists in that case anyway.
 */
export function messageForApiError(error: unknown, strings: Dictionary): Message {
  if (!isApiError(error)) return strings.errors.generic;

  switch (error.kind) {
    case 'network':
      return strings.errors.network;
    case 'timeout':
      return strings.errors.timeout;
    case 'malformed':
      return strings.errors.malformed;
    case 'http':
      break;
  }

  const key = error.code === null ? undefined : MESSAGE_FOR_CODE[error.code];
  if (key !== undefined) return strings.errors[key];

  // An unrecognised code from a newer backend, or an unstructured body.
  return error.status !== null && error.status >= 500
    ? strings.errors.serverError
    : strings.errors.generic;
}
