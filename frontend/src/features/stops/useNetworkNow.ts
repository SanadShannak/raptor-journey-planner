import { useEffect, useState } from 'react';
import { nowInZone } from '../../i18n';
import type { NetworkMoment } from './minutesUntil';

/**
 * The current moment on the network's clock, kept current.
 *
 * A departure board is the first thing in this app that has to keep answering
 * the same question, so it is also the first thing that ticks. Everywhere else
 * "now" is read once, when a form is seeded or a button is pressed.
 *
 * The zone is the network's, never the browser's. A visitor in Amman reading a
 * Helsinki board is asking what time it is *there*, and `nowInZone` answers
 * that through `Intl` so daylight saving is the platform's problem.
 *
 * Null until the timezone is known, which is a real state — `/api/network` has
 * to answer before there is a clock to read — and it removes the countdown
 * rather than showing one measured against the wrong city.
 */

/**
 * Half a minute.
 *
 * The value shown changes once a minute, so a slower tick would let a number
 * sit visibly wrong for up to that long, and a faster one buys nothing. Half a
 * minute bounds the error at thirty seconds for one render per departure.
 */
const TICK_MS = 30_000;

const readClock = (timezone: string | null): NetworkMoment | null =>
  timezone === null ? null : nowInZone(timezone);

export function useNetworkNow(timezone: string | null): NetworkMoment | null {
  const [now, setNow] = useState<NetworkMoment | null>(() => readClock(timezone));
  const [lastZone, setLastZone] = useState(timezone);

  /*
   * A new zone is a new clock, and it is read during render rather than in an
   * effect. An effect would paint one frame showing the old city's time and
   * then re-render to correct it — and the correction is not a synchronisation
   * with anything, it is simply what this value *is* for the new prop.
   */
  if (timezone !== lastZone) {
    setLastZone(timezone);
    setNow(readClock(timezone));
  }

  useEffect(() => {
    if (timezone === null) return;

    const sync = () => setNow(nowInZone(timezone));
    const timer = window.setInterval(sync, TICK_MS);

    /*
     * A background tab is throttled — a browser is free to hold an interval for
     * minutes at a time — so returning to one can find the countdown stale by
     * more than the tick. Reading the clock again on the way back costs nothing
     * and is the only thing that makes a tab left open overnight honest.
     */
    const onVisibility = () => {
      if (!document.hidden) sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [timezone]);

  return now;
}
