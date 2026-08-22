import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('stays hidden until the control is hovered or focused', () => {
    render(
      <Tooltip text="Switch to dark theme">
        <button type="button">theme</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
  });

  /*
   * A keyboard user reaches the control without a pointer ever touching it. A
   * hover-only tooltip is invisible to them, which is the whole point of the
   * hint being there.
   */
  it('appears on keyboard focus, not only on hover', () => {
    render(
      <Tooltip text="Switch to dark theme">
        <button type="button">theme</button>
      </Tooltip>,
    );

    fireEvent.focus(screen.getByRole('button'));
    expect(screen.getByRole('tooltip', { hidden: true }).textContent).toBe(
      'Switch to dark theme',
    );

    fireEvent.blur(screen.getByRole('button'));
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
  });

  it('appears on pointer hover and goes away when the pointer leaves', () => {
    render(
      <Tooltip text="Switch to dark theme">
        <button type="button">theme</button>
      </Tooltip>,
    );
    const wrapper = screen.getByRole('button').parentElement as HTMLElement;

    fireEvent.pointerEnter(wrapper);
    expect(screen.getByRole('tooltip', { hidden: true })).toBeTruthy();

    fireEvent.pointerLeave(wrapper);
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
  });

  /*
   * Content that appears on hover or focus has to be dismissible without
   * moving either — otherwise a tooltip can sit over something the visitor is
   * trying to read with no way to get rid of it.
   */
  it('dismisses on Escape while focus stays on the control', () => {
    render(
      <Tooltip text="Switch to dark theme">
        <button type="button">theme</button>
      </Tooltip>,
    );
    const button = screen.getByRole('button');

    // Real focus, not a dispatched focus event: the point of this test is that
    // focus is still on the control afterwards, which a synthetic event would
    // never have moved in the first place.
    // A real focus() updates state outside React's event batching.
    act(() => button.focus());
    expect(screen.getByRole('tooltip', { hidden: true })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip', { hidden: true })).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  /*
   * On an icon-only control the tooltip says exactly what the accessible name
   * already says. Exposing it as a description as well would have a screen
   * reader announce the same sentence twice.
   */
  it('hides itself from assistive technology when it only repeats the name', () => {
    render(
      <Tooltip text="Switch to dark theme">
        <button type="button" aria-label="Switch to dark theme" />
      </Tooltip>,
    );

    fireEvent.focus(screen.getByRole('button'));
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip.getAttribute('aria-hidden')).toBe('true');
    expect(tip.id).toBe('');
  });

  /* When it adds something the name does not say, it becomes the description. */
  it('describes the control when given an id', () => {
    render(
      <Tooltip text="Switch to العربية" describedById="lang-tip">
        <button type="button" aria-describedby="lang-tip">
          بالعربية
        </button>
      </Tooltip>,
    );

    fireEvent.focus(screen.getByRole('button'));
    const tip = screen.getByRole('tooltip');
    expect(tip.id).toBe('lang-tip');
    expect(tip.getAttribute('aria-hidden')).toBeNull();
    expect(screen.getByRole('button').getAttribute('aria-describedby')).toBe(
      'lang-tip',
    );
  });
});
