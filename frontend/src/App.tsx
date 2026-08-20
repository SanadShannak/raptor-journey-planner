import { useEffect, useState } from 'react';
import { getValidDates } from './api/journey';
import { isApiError } from './api/errors';
import type { IsoDate } from './types/journey';
import { LOCALES, LOCALE_NAMES, formatDate, useLocale } from './i18n';
import { ThemeSwitcher } from './theme';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; dates: IsoDate[] }
  | { status: 'error'; message: string };

/**
 * Placeholder screen for the foundation phase. It exists to prove the API
 * layer, environment configuration, design tokens, and localisation work end
 * to end, and is expected to be replaced entirely once the real UI is built.
 */
export default function App() {
  const { locale, strings, t, setLocale } = useLocale();
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();

    getValidDates({ signal: controller.signal })
      .then((dates) => setState({ status: 'ready', dates }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: 'error',
          message: isApiError(error) ? error.message : String(error),
        });
      });

    return () => controller.abort();
  }, []);

  return (
    <main className="min-h-viewport mx-auto flex max-w-xl flex-col justify-center gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{t(strings.app.title)}</h1>

        <div className="flex flex-wrap items-center gap-4">
          <ThemeSwitcher />

          <div
            className="flex gap-1"
            role="group"
            aria-label={t(strings.language.switcherLabel)}
          >
            {LOCALES.map((option) => (
              <button
                key={option}
                type="button"
                lang={option}
                onClick={() => setLocale(option)}
                aria-current={option === locale}
                className="rounded-control border-border-strong focus-visible:outline-brand-500 aria-[current=true]:bg-brand-500 aria-[current=true]:border-brand-500 border px-3 py-1 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 aria-[current=true]:text-white"
              >
                {LOCALE_NAMES[option]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/*
        Results replace each other asynchronously, so the region is announced
        politely rather than leaving screen-reader users on stale content.
      */}
      <div
        aria-live="polite"
        className="rounded-card border-border bg-surface-raised shadow-card border p-4"
      >
        {state.status === 'loading' && (
          <p className="text-content-muted">{t(strings.status.checkingBackend)}</p>
        )}

        {state.status === 'ready' && (
          <>
            <p className="text-success font-medium">
              {t(strings.status.backendReachable)}
            </p>
            <p className="text-content-muted mt-1 text-sm">
              {t(strings.status.availableDates, {
                count: state.dates.length,
                first: formatDate(state.dates.at(0) ?? '', locale),
                last: formatDate(state.dates.at(-1) ?? '', locale),
              })}
            </p>
          </>
        )}

        {state.status === 'error' && (
          <>
            <p className="text-danger font-medium">
              {t(strings.status.backendUnreachable)}
            </p>
            <p className="text-content-muted mt-1 text-sm">{state.message}</p>
          </>
        )}
      </div>
    </main>
  );
}
