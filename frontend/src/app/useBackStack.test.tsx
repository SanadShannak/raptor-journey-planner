import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router';
import { forgetDepth } from './navigationDepth';
import { useGoBack, useTrackNavigationDepth } from './useBackStack';

/*
 * A back control that walks the stack.
 *
 * The property worth pinning is the one a single-step test cannot show: going
 * several levels in and pressing back repeatedly unwinds the way you came, one
 * entry at a time, rather than jumping to a section index — or to whoever first
 * sent you, which is the same mistake wearing a better name.
 */

function Page({ name, next }: { name: string; next?: string }) {
  const back = useGoBack('/root');

  return (
    <div>
      <h1>{name}</h1>
      {next !== undefined && <Link to={next}>deeper</Link>}
      <button type="button" onClick={back.go}>
        {back.stepping ? 'Back' : 'Root'}
      </button>
    </div>
  );
}

function Track() {
  useTrackNavigationDepth();
  return null;
}

function show(at: string) {
  return render(
    <MemoryRouter initialEntries={[at]}>
      <Track />
      <Routes>
        <Route path="/root" element={<Page name="root" next="/one" />} />
        <Route path="/one" element={<Page name="one" next="/two" />} />
        <Route path="/two" element={<Page name="two" next="/three" />} />
        <Route path="/three" element={<Page name="three" />} />
      </Routes>
    </MemoryRouter>,
  );
}

const at = () => screen.getByRole('heading', { level: 1 }).textContent;
const back = () => screen.getByRole('button');

beforeEach(forgetDepth);

describe('the back stack', () => {
  it('unwinds one level at a time, however deep it went', () => {
    show('/root');

    fireEvent.click(screen.getByRole('link', { name: 'deeper' }));
    fireEvent.click(screen.getByRole('link', { name: 'deeper' }));
    fireEvent.click(screen.getByRole('link', { name: 'deeper' }));
    expect(at()).toBe('three');

    fireEvent.click(back());
    expect(at()).toBe('two');

    fireEvent.click(back());
    expect(at()).toBe('one');

    fireEvent.click(back());
    expect(at()).toBe('root');
  });

  /*
   * A page opened cold — a pasted link, or the first page of a session. The
   * entry behind it is somebody else's, and stepping onto it means leaving.
   */
  it('goes to the section root when nothing of ours is behind', () => {
    show('/three');

    expect(back().textContent).toBe('Root');
    fireEvent.click(back());
    expect(at()).toBe('root');
  });

  it('says it is stepping back only once there is somewhere to step', () => {
    show('/root');
    expect(back().textContent).toBe('Root');

    fireEvent.click(screen.getByRole('link', { name: 'deeper' }));
    expect(back().textContent).toBe('Back');
  });

  /* Down to the bottom and back out again, twice, without drifting. */
  it('can be walked down and up more than once', () => {
    show('/root');

    fireEvent.click(screen.getByRole('link', { name: 'deeper' }));
    fireEvent.click(screen.getByRole('link', { name: 'deeper' }));
    fireEvent.click(back());
    fireEvent.click(back());
    expect(at()).toBe('root');
    expect(back().textContent).toBe('Root');

    fireEvent.click(screen.getByRole('link', { name: 'deeper' }));
    expect(back().textContent).toBe('Back');
    fireEvent.click(back());
    expect(at()).toBe('root');
  });
});
