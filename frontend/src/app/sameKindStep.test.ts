import { describe, expect, it } from 'vitest';
import { sameKindStep } from './sameKindStep';
import { paths } from './routes';

/*
 * The bug this encodes: reading a stop, pressing its neighbour on the map,
 * then another, then another — and finding the way back out was one press per
 * stop, in reverse, through every one of them.
 *
 * Nothing threw and nothing looked broken, which is why it is worth a test:
 * the only symptom is a back button that has quietly become a queue.
 */
describe('stepping to another of the same kind', () => {
  it('records the way back when stepping in from a list', () => {
    const step = sameKindStep({
      inside: false,
      cameFrom: null,
      here: paths.stops,
      index: paths.stops,
    });

    expect(step).toEqual({ state: { back: paths.stops }, replace: false });
  });

  /* The hop itself: same depth, and the original sender kept. */
  it('stays at the same depth when hopping between siblings', () => {
    const step = sameKindStep({
      inside: true,
      cameFrom: paths.stops,
      here: '/stops/1020444',
      index: paths.stops,
    });

    expect(step.replace).toBe(true);
    expect(step.state.back).toBe(paths.stops);
  });

  /*
   * And the reason the sender is carried rather than recomputed: a stop opened
   * out of a journey has to lead back to that journey, however many stops are
   * looked at on the way — not to the stop before it, and not to the index.
   */
  it('keeps a sender that is not the index', () => {
    const journey = '/?from=Kamppi&to=Pasila&open=0';

    const first = sameKindStep({
      inside: false,
      cameFrom: null,
      here: journey,
      index: paths.stops,
    });
    expect(first.state.back).toBe(journey);

    // Three hops later, still the journey.
    let back = first.state.back;
    for (let i = 0; i < 3; i++) {
      back = sameKindStep({
        inside: true,
        cameFrom: back,
        here: `/stops/${i}`,
        index: paths.stops,
      }).state.back;
    }
    expect(back).toBe(journey);
  });

  /*
   * A deep link somebody has since moved around inside. The stop just left is
   * behind nothing, so the index is the honest answer — and it is where the
   * back control would fall through to anyway.
   */
  it('falls back to the section index when nothing said where we came from', () => {
    const step = sameKindStep({
      inside: true,
      cameFrom: null,
      here: '/stops/1020444',
      index: paths.stops,
    });

    expect(step).toEqual({ state: { back: paths.stops }, replace: true });
  });
});
