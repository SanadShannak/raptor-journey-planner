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

describe('the typed time', () => {
  it('shows the time the way it is displayed, not the way it is sent', () => {
    render(<Field />);
    expect(input().value).toBe('4:54 PM');

    // Clicking in used to hand over the 24-hour value behind it, which looked
    // like the field had changed the time on its own.
    fireEvent.focus(input());
    expect(input().value).toBe('4:54 PM');
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
