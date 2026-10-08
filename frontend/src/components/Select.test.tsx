import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LocaleProvider } from '../i18n';
import { Select } from './Select';

const OPTIONS = [
  { value: 'standard', label: 'Standard' },
  { value: 'student', label: 'Student' },
  { value: 'elderly', label: 'Senior' },
] as const;

function show(value: string = 'standard', onChange = vi.fn()) {
  render(
    <LocaleProvider>
      <Select
        label="Type"
        value={value}
        options={[...OPTIONS]}
        onChange={onChange}
      />
    </LocaleProvider>,
  );
  return onChange;
}

describe('Select', () => {
  /*
   * The whole point of not using a native `<select>` is that this is our
   * markup — so the test that matters first is that it *is* ours.
   */
  it('is a listbox of our own, not a native select', () => {
    show();
    expect(document.querySelector('select')).toBeNull();
    expect(screen.getByRole('button')).toBeTruthy();
  });

  /*
   * The trigger is a button, so a `<label for>` would not associate with it.
   * It names itself from the label *and* its current value, which is what
   * makes a screen reader read "Type, Standard" rather than either alone.
   */
  it('names itself with its label and its value', () => {
    show();
    expect(screen.getByRole('button', { name: 'Type Standard' })).toBeTruthy();
  });

  it('opens on press and marks the current option as selected', () => {
    show('student');

    const trigger = screen.getByRole('button');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const list = within(screen.getByRole('listbox'));
    expect(list.getByRole('option', { name: 'Student' }).getAttribute('aria-selected')).toBe('true');
    expect(list.getByRole('option', { name: 'Standard' }).getAttribute('aria-selected')).toBe('false');
  });

  it('reports a choice and closes', () => {
    const onChange = show();

    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('option', { name: 'Senior' }));

    expect(onChange).toHaveBeenCalledWith('elderly');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  /*
   * Focus has to come back: the option that was pressed unmounts with the
   * panel, so without this a keyboard reader is dropped on the body.
   */
  it('returns focus to the trigger after choosing', () => {
    show();
    const trigger = screen.getByRole('button');

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Student' }));

    expect(document.activeElement).toBe(trigger);
  });

  /* Escape is the way out of any popover in this app, and it also restores
     focus — both come from the shared `Popover`. */
  it('closes on Escape, back on the trigger', () => {
    show();
    const trigger = screen.getByRole('button');

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when something outside it is pressed', () => {
    show();

    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
