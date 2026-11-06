import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { TimeSelect } from './TimeSelect';

/**
 * Wired the way the form wires it: the value on the wire is always 24-hour,
 * and every change is counted, because in the planner a change *is* a search.
 */
function Field({ onChange = () => {} }: { onChange?: (time: string) => void }) {
  const [time, setTime] = useState('16:54');
  return (
    <LocaleProvider>
      <TimeSelect
        label="Time"
        value={time}
        onChange={(next) => {
          setTime(next);
          onChange(next);
        }}
      />
      <span data-testid="value">{time}</span>
    </LocaleProvider>
  );
}

/* By role: once the panel is open, the dialog carries the field's label too. */
const input = () => screen.getByRole('textbox', { name: 'Time' }) as HTMLInputElement;
const wire = () => screen.getByTestId('value').textContent;

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

/* A phone's number pad has no colon and no letters. */
describe('typing from a number pad', () => {
  const type = (text: string) => {
    fireEvent.focus(input());
    fireEvent.change(input(), { target: { value: text } });
  };
  const press = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));
  const leave = () => fireEvent.blur(input(), { target: { value: input().value } });

  it('puts the colon in by itself', () => {
    render(<Field />);
    type('930');
    expect(input().value).toBe('9:30');
    type('1430');
    expect(input().value).toBe('14:30');
    leave();
    expect(wire()).toBe('14:30');
  });

  it('applies PM when it is pressed beside the digits', () => {
    render(<Field />);
    type('930');
    press('PM');
    leave();
    expect(wire()).toBe('21:30');
  });

  it('reads the digits as they are when no half is pressed', () => {
    render(<Field />);
    type('930');
    leave();
    expect(wire()).toBe('09:30');
  });

  it('moves the same time to the other half with nothing typed', () => {
    render(<Field />);
    fireEvent.focus(input());
    press('AM');
    leave();
    expect(wire()).toBe('04:54');
  });

  it('ignores a pressed half on an hour past twelve', () => {
    render(<Field />);
    type('1430');
    press('AM');
    leave();
    expect(wire()).toBe('14:30');
  });

  it('reads the Arabic digits an Arabic number pad sends', () => {
    render(<Field />);
    type('٩٣٠');
    expect(input().value).toBe('9:30');
    leave();
    expect(wire()).toBe('09:30');
  });

  it('shows the buttons only while typing', () => {
    render(<Field />);
    expect(screen.queryByRole('radio', { name: 'PM' })).toBeNull();
    fireEvent.focus(input());
    expect(screen.getByRole('radio', { name: 'PM' })).toBeTruthy();
    leave();
    expect(screen.queryByRole('radio', { name: 'PM' })).toBeNull();
  });

  it('keeps focus in the field when a half is pressed', () => {
    render(<Field />);
    fireEvent.focus(input());
    // `fireEvent` returns false when the default was prevented.
    expect(fireEvent.mouseDown(screen.getByRole('radio', { name: 'PM' }))).toBe(false);
  });
});

describe('the typed time', () => {
  it('shows the time the way it is displayed, not the way it is sent', () => {
    render(<Field />);
    expect(input().value).toBe('4:54 PM');

    // Clicking in empties it, so a phone's first digit starts afresh, and keeps
    // the displayed time as the hint rather than the 24-hour value behind it.
    fireEvent.focus(input());
    expect(input().value).toBe('');
    expect(input().placeholder).toBe('4:54 PM');
  });

  it('leaves the value alone when nothing was typed', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    fireEvent.focus(input());
    fireEvent.blur(input(), { target: { value: input().value } });

    expect(wire()).toBe('16:54');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reads back a twelve-hour time it printed', () => {
    render(<Field />);

    fireEvent.focus(input());
    fireEvent.blur(input(), { target: { value: '5:30 PM' } });

    expect(wire()).toBe('17:30');
  });
});

/*
 * Three columns make one time between them. Reporting each as it moves means
 * the hour lands first and a search runs for a time nobody asked for on the
 * way to the one they did.
 */
describe('the picker', () => {
  function open() {
    fireEvent.click(screen.getByRole('button', { name: 'Choose a time' }));
  }

  it('reports nothing while the columns are being moved', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    open();
    fireEvent.click(screen.getByRole('option', { name: '5' }));
    fireEvent.click(screen.getByRole('option', { name: '30' }));

    expect(onChange).not.toHaveBeenCalled();
    // The field still shows the choice as it is made, though.
    expect(input().value).toBe('5:30 PM');
    expect(wire()).toBe('16:54');
  });

  it('hands the time over once, on Done', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    open();
    fireEvent.click(screen.getByRole('option', { name: '5' }));
    fireEvent.click(screen.getByRole('option', { name: '30' }));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(wire()).toBe('17:30');
  });

  it('hands it over when the panel is closed by pressing Escape', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    open();
    fireEvent.click(screen.getByRole('option', { name: '9' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(wire()).toBe('21:54');
  });

  // Nothing moved, nothing to report — closing an untouched panel is not a
  // change, and in this form a change costs a search.
  it('reports nothing when the panel is opened and closed again', () => {
    const onChange = vi.fn();
    render(<Field onChange={onChange} />);

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
