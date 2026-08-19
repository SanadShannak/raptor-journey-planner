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
} as const;
