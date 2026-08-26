import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LocaleProvider } from '../i18n';
import { ThemeProvider } from '../theme';
import * as health from '../api/health';
import { AppHeader } from './AppHeader';
import { checkService, forgetService } from './backendHealth';

/*
 * The one thing worth pinning here that a glance at the component cannot
 * verify: the alert tracks the shared store rather than a probe of its own,
 * and it is gone the moment that store says the service answered again.
 */

beforeEach(() => {
  localStorage.clear();
  forgetService();
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

function show() {
  return render(
    <LocaleProvider>
      <ThemeProvider>
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </ThemeProvider>
    </LocaleProvider>,
  );
}

describe('AppHeader', () => {
  it('says nothing while the service has not been found down', () => {
    show();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('names the service unreachable once the probe says so', async () => {
    vi.spyOn(health, 'checkHealth').mockResolvedValue(false);
    show();

    checkService();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Routing service unavailable.');
  });

  it('clears once a retry finds the service answering again', async () => {
    const spy = vi.spyOn(health, 'checkHealth');
    spy.mockResolvedValueOnce(false);
    show();
    checkService();
    await screen.findByRole('alert');

    spy.mockResolvedValueOnce(true);
    screen.getByRole('button', { name: 'Try again' }).click();

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});
