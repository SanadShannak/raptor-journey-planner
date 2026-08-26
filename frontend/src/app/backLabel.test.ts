import { describe, expect, it } from 'vitest';
import { backLabel } from './backLabel';
import { en } from '../i18n/en';
import { translate } from '../i18n/translate';

/*
 * The bug this fixes: the label used to be chosen from whether a return address
 * *existed*, and the planner was the first thing that ever set one — so a run
 * opened from a stop's departure board announced "Back to the journey" for a
 * journey nobody was on.
 */
const said = (to: string | null) => translate(backLabel(to, en), 'en');

describe('backLabel', () => {
  it('names a stop when a stop is what is behind', () => {
    expect(said('/stops/1020444')).toBe('Back to the stop');
  });

  it('names a line when a line is what is behind', () => {
    expect(said('/routes/tram-1')).toBe('Back to the route');
    // A variant or a followed run is still a line.
    expect(said('/routes/tram-1?variant=0&trip=abc&date=2026-09-10')).toBe(
      'Back to the route',
    );
  });

  it('names the journey only when the planner is what is behind', () => {
    expect(said('/')).toBe('Back to the journey');
    expect(said('/?from=Kamppi&fromLat=60.1&fromLon=24.9')).toBe('Back to the journey');
  });

  /* The indexes name themselves, in the same words a control uses when it has
     nowhere to step back to and goes there instead. */
  it('names an index as the index', () => {
    expect(said('/routes')).toBe('All routes');
    expect(said('/stops')).toBe('Back to stops');
  });

  /* Nothing sent us, or somewhere with no name worth saying. "Back" is more
     honest than a place it is not. */
  it('says the plain word for anything else', () => {
    expect(said(null)).toBe('Back');
    expect(said('/card')).toBe('Back');
  });
});
