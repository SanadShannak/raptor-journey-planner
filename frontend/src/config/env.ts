/**
 * Typed, validated access to build-time environment configuration.
 *
 * Vite inlines `import.meta.env.*` at build time, so this module is the single
 * place where raw env strings are read and checked. Everything else imports
 * `env` and gets values that are known to be present.
 */

function required(name: string, value: string | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(
      `Missing environment variable ${name}. ` +
        `Copy .env.example to .env.local and set it before starting the app.`,
    );
  }
  return trimmed;
}

/** Reads a variable that is allowed to be absent. */
function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Strips any trailing slash so callers can always join with a leading `/`. */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export const env = {
  /** Origin of the journey-planning backend, e.g. `http://localhost:3000`. */
  apiBaseUrl: normalizeBaseUrl(
    required('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  ),
  /** How long a single API request may take before it is aborted. */
  apiTimeoutMs: 30_000,

  /*
   * Subscription key for Digitransit's geocoder. Optional on purpose: without
   * one the app uses Photon, which needs no key and covers every network, so a
   * missing key costs Helsinki its stop suggestions rather than breaking
   * search. Free registration at https://portal-api.digitransit.fi.
   *
   * A key in a browser bundle is public. Digitransit's is issued for exactly
   * that use and is rate-limited per key rather than kept secret, but it does
   * mean the quota belongs to whoever deploys this.
   */
  digitransitKey: optional(import.meta.env.VITE_DIGITRANSIT_SUBSCRIPTION_KEY),

  /*
   * CARTO's basemap tiles. Optional in the same shape as the Digitransit key
   * above: without one the map still renders, on whatever CARTO's anonymous
   * tier currently allows, which has grown less reliable than the "no key
   * needed" it once was — see `map/tileSource.ts`.
   */
  cartoKey: optional(import.meta.env.VITE_CARTO_API_KEY),
} as const;
