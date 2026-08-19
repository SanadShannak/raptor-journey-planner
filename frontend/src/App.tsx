import { useEffect, useState } from 'react';
import { getValidDates } from './api/journey';
import { isApiError } from './api/errors';
import type { IsoDate } from './types/journey';
import { format, strings } from './i18n';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; dates: IsoDate[] }
  | { status: 'error'; message: string };

/**
 * Placeholder screen for the foundation phase. It exists to prove the API
 * layer, environment configuration, and design tokens work end to end, and is
 * expected to be replaced entirely once the real UI is built.
 */
export default function App() {
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
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">{strings.app.title}</h1>

      <div className="rounded-card border border-border bg-surface-raised p-4 shadow-card">
        {state.status === 'loading' && (
          <p className="text-content-muted">{strings.status.checkingBackend}</p>
        )}

        {state.status === 'ready' && (
          <>
            <p className="text-success font-medium">{strings.status.backendReachable}</p>
            <p className="text-content-muted mt-1 text-sm">
              {format(strings.status.availableDates, {
                count: state.dates.length,
                first: state.dates.at(0) ?? '—',
                last: state.dates.at(-1) ?? '—',
              })}
            </p>
          </>
        )}

        {state.status === 'error' && (
          <>
            <p className="text-danger font-medium">{strings.status.backendUnreachable}</p>
            <p className="text-content-muted mt-1 text-sm">{state.message}</p>
          </>
        )}
      </div>
    </main>
  );
}
