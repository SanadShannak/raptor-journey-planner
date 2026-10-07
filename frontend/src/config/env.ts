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

/**
 * Strips any trailing slash so callers can always join with a leading `/`.
 *
 * A base of `/` therefore normalises to the empty string, which is how
 * **same-origin** is spelled throughout this app: `buildUrl` resolves a
 * relative base against the page's own origin. A lone `/` is still a value,
 * so {@link required} keeps failing fast when the variable is genuinely unset
 * — "same origin, deliberately" and "nobody configured this" stay distinct.
 */
function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export const env = {
  /*
   * Where the backend is, and why the answer is normally "here".
   *
   * Either an absolute origin (`http://localhost:3000`) or a same-origin path
   * prefix, of which `/` — the empty string once normalised — is the usual
   * one. **Same-origin is the configuration that works**, and that is a
   * consequence of the session being a cookie rather than a preference:
   *
   * The server answers `Access-Control-Allow-Origin: *` together with
   * `Access-Control-Allow-Credentials: true`, and the Fetch standard requires
   * a browser to reject exactly that pairing for any request carrying
   * credentials — a wildcard cannot be the origin that was *trusted* with a
   * cookie. So an absolute base pointed at a different origin gets a CORS
   * failure on every authenticated call, with the cookie never sent. The dev
   * server proxies `/api` to the backend instead (see `vite.config.ts`), which
   * removes the cross-origin hop rather than trying to negotiate it, and the
   * same arrangement — one origin, a reverse proxy in front of both — is what
   * a deployment wants anyway.
   *
   * An absolute origin is still accepted, because it is right for the
   * unauthenticated feed endpoints and for pointing a local frontend at a
   * shared backend. Expect anything under `/api/auth`, `/api/user` or
   * `/api/cards` to fail when it is set.
   */
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
