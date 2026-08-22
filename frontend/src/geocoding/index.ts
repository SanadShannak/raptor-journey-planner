import type { Geocoder } from '../types/place';
import { env } from '../config/env';
import { createPhotonGeocoder } from './photon';
import { createDigitransitGeocoder } from './digitransit';

/**
 * Picks the geocoder for this deployment.
 *
 * Which one is right depends on the network, so it is configuration rather
 * than a decision baked into the form. Digitransit knows Helsinki's stops and
 * is preferred wherever its key is available; Photon works everywhere with no
 * key at all, which is what makes it the default rather than a last resort.
 *
 * Resolved once, at module load, because it cannot change while the app runs.
 */
export const geocoder: Geocoder =
  env.digitransitKey === null
    ? createPhotonGeocoder()
    : createDigitransitGeocoder(env.digitransitKey);

export type { Geocoder } from '../types/place';
