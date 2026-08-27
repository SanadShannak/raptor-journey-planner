import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LocaleProvider } from '../../i18n';
import { LineBrowser } from './LineBrowser';

/*
 * Whether a line runs today is worth more on a browse list than how many
 * patterns it has, so it takes over the same slot — and a line not running
 * today says nothing at all, rather than falling back to the variant count.
 */

const line = (over: Record<string, unknown> = {}) => ({
  lineId: 'tram-1',
  routeShortName: '1',
  routeType: 0,
  routeLongName: 'Eira - Käpylä',
  variantCount: 4,
  directions: [0, 1],
  activeToday: false,
  ...over,
});

function stubFetch(lines: unknown[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () =>
      new Response(JSON.stringify({ lines, totalLines: lines.length }), { status: 200 }),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function show() {
  return render(
    <MemoryRouter>
      <LocaleProvider>
        <LineBrowser availableModes={[0]} onOpen={() => {}} />
      </LocaleProvider>
    </MemoryRouter>,
  );
}

describe('LineBrowser', () => {
  it('shows "Active today" for a line running today', async () => {
    stubFetch([line({ activeToday: true })]);
    show();

    expect(await screen.findByText('Active today')).toBeTruthy();
    expect(screen.queryByText('4 variants')).toBeNull();
  });

  it('says nothing when it is not active today, regardless of variant count', async () => {
    stubFetch([line({ activeToday: false })]);
    show();

    await screen.findByText('Eira - Käpylä');
    expect(screen.queryByText('Active today')).toBeNull();
    expect(screen.queryByText(/variant/)).toBeNull();
  });
});
