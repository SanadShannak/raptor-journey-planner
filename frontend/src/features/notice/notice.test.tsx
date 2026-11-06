import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { LocaleProvider } from '../../i18n';
import { useTour } from '../tour';
import { TourHost } from '../tour/TourHost';
import { forgetTours } from '../tour/tourStore';
import { NoticeButton, NoticeHost } from '.';
import { closeNotice, reloadNotice } from './noticeStore';

const HOLD_MS = 4000;
const CLOSE_MS = 450;

const renderHost = () =>
  render(
    <LocaleProvider>
      <NoticeButton />
      <NoticeHost />
    </LocaleProvider>,
  );

const acknowledge = () => screen.getByRole('button', { name: 'I understand' });
/*
 * In small steps, with React flushing between them: the countdown sets its next
 * timer only after rendering the last tick, so one long jump would fire one tick.
 */
const pass = (ms: number) => {
  for (let left = ms; left > 0; left -= 100) {
    act(() => {
      vi.advanceTimersByTime(Math.min(left, 100));
    });
  }
};

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  reloadNotice();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('the independence notice', () => {
  it('names every body it is independent of', () => {
    renderHost();
    const text = screen.getByRole('dialog').textContent;
    expect(text).toContain('Amman Vision Bus');
    expect(text).toContain('Greater Amman Municipality');
    expect(text).toContain('Ministry of Transport');
  });

  it('cannot be dismissed by its button during the hold, then can', () => {
    renderHost();

    fireEvent.click(acknowledge());
    pass(HOLD_MS - 1);
    fireEvent.click(acknowledge());
    pass(0);
    expect(screen.getByRole('dialog')).toBeTruthy();

    pass(1);
    fireEvent.click(acknowledge());
    pass(CLOSE_MS);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('stays on screen while it animates away', () => {
    renderHost();
    pass(HOLD_MS);
    fireEvent.click(acknowledge());

    pass(CLOSE_MS - 100);
    expect(screen.getByRole('dialog')).toBeTruthy();
    pass(100);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('skips the animation for somebody who asked for less movement', () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query) => ({ matches: true, media: query, addEventListener: () => {}, removeEventListener: () => {} }) as unknown as MediaQueryList,
    );
    renderHost();
    pass(HOLD_MS);
    fireEvent.click(acknowledge());
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses Escape during the hold and accepts it afterwards', () => {
    renderHost();
    const cancel = () => fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));

    cancel();
    pass(CLOSE_MS);
    expect(screen.getByRole('dialog')).toBeTruthy();

    pass(HOLD_MS);
    cancel();
    pass(CLOSE_MS);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  /* Chrome closes on a second Escape whatever `cancel` said. */
  it('reopens if the browser closes it during the hold', () => {
    renderHost();
    const dialog = screen.getByRole<HTMLDialogElement>('dialog');

    act(() => dialog.close());

    expect(dialog.open).toBe(true);
  });

  it('shows again, with its hold, on the next load', () => {
    renderHost();
    pass(HOLD_MS);
    fireEvent.click(acknowledge());
    pass(CLOSE_MS);

    act(() => reloadNotice());

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(acknowledge().getAttribute('aria-disabled')).toBe('true');
  });

  it('does not hold somebody who asked to reread it', () => {
    act(() => closeNotice());
    renderHost();
    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'About this site' }));
    fireEvent.click(acknowledge());
    pass(CLOSE_MS);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('changes language in place, without starting the hold again', () => {
    renderHost();
    pass(HOLD_MS - 1000);

    fireEvent.click(screen.getByRole('button', { name: /بالعربية/ }));

    expect(screen.getByRole('heading', { name: 'تطبيق مستقل وغير رسمي' })).toBeTruthy();
    expect(screen.getByRole('dialog').textContent).toContain('باص رؤية عمان');
    pass(1000);
    expect(screen.getByRole('button', { name: 'فهمت' }).getAttribute('aria-disabled')).toBeNull();
  });
});

/*
 * A tour gives up after a few looks if another dialog is open, and the notice is
 * open for as long as somebody reads it, so without this a new visitor's first
 * page would lose its tour.
 */
describe('the tour behind it', () => {
  function Page() {
    useTour('routes');
    return (
      <div
        data-tour="routes-list"
        ref={(element) => {
          if (element === null) return;
          element.getBoundingClientRect = () =>
            ({ top: 100, left: 100, width: 200, height: 50, right: 300, bottom: 150, x: 100, y: 100 }) as DOMRect;
        }}
      />
    );
  }

  const renderPage = () =>
    render(
      <MemoryRouter>
        <LocaleProvider>
          <Page />
          <TourHost />
          <NoticeHost />
        </LocaleProvider>
      </MemoryRouter>,
    );

  beforeEach(() => {
    forgetTours();
  });

  it('waits however long the notice is read for, then starts', () => {
    renderPage();
    pass(60_000);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: /independent/i })).toBeTruthy();

    fireEvent.click(acknowledge());
    pass(CLOSE_MS);
    expect(screen.queryByRole('dialog')).toBeNull();

    pass(1000);
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /independent/i })).toBeNull();
  });
});
