/**
 * `GET /api/health` — is the routing service answering at all?
 *
 * Its own module rather than a flag on another call, because the question is
 * about the *service*, not about one endpoint: the planner, the valid dates,
 * and the network manifest all fail together when the backend is down, and the
 * UI should say so once rather than three times.
 *
 * Deliberately short-tempered. The shared timeout is thirty seconds, which is
 * right for a RAPTOR search and far too long for a liveness probe — a visitor
 * would sit in front of a form that looks broken. A probe that has not answered
 * in a few seconds has answered.
 */

import { env } from '../config/env';

interface CallOptions {
  signal?: AbortSignal | undefined;
}

/** How long the probe waits before calling the service unreachable. */
const PROBE_TIMEOUT_MS = 5_000;

/**
 * Resolves true when the service answered, false when it did not.
 *
 * **This never rejects, for any reason** — including a caller-initiated abort,
 * which is where it deliberately parts company with `getJson`.
 *
 * Elsewhere an abort is re-thrown so a caller can tell "you cancelled this"
 * from "this failed", because those lead to different handling. Here there is
 * nothing to tell apart: the question is whether the service answered, and if
 * the asking was cancelled then it did not — as far as anyone still waiting is
 * concerned. Every call site is a fire-and-forget probe inside an effect, so
 * re-throwing produced an unhandled rejection on every unmount rather than
 * information anybody used.
 */
export async function checkHealth(options: CallOptions = {}): Promise<boolean> {
  const timeout = AbortSignal.timeout(PROBE_TIMEOUT_MS);
  const signal = options.signal
    ? combineSignals([options.signal, timeout])
    : timeout;

  try {
    const response = await fetch(`${env.apiBaseUrl}/api/health`, {
      signal,
      headers: { Accept: 'application/json' },
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Same feature detection as `client.ts`'s `anySignal`.
 *
 * Duplicated rather than shared because `client.ts` exports a request
 * function, not its plumbing, and one small helper in two places is cheaper
 * than a third module that exists only to hold it. If a fourth caller appears,
 * that is the moment to extract it.
 */
function combineSignals(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);

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
