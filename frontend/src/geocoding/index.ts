import type { Geocoder } from '../types/place';
import { env } from '../config/env';
import { countriesForNetwork } from '../config/geocoding';
import { createPhotonGeocoder } from './photon';
import { createDigitransitGeocoder } from './digitransit';
import { withFeedStops } from './feedStops';

/**
 * Networks Digitransit's geocoder actually knows. It covers Finland only, so
 * a key on any other network would quietly search Finland for Amman's
 * streets — which is what choosing by the key alone used to do.
 */
const DIGITRANSIT_NETWORKS = new Set(['hsl']);

const byNetwork = new Map<string | null, Geocoder>();

/**
 * Picks the geocoder for a network.
 *
 * Digitransit knows Helsinki's stops and is preferred there whenever its key
 * is available; everywhere else — and in Helsinki without a key — Photon,
 * which needs no key and covers the world, kept to the network's own
 * countries, with the feed's own stops offered beside it (`withFeedStops`),
 * since Photon cannot know which of its bus stops are ours.
 *
 * `null` is the network before `/api/network` has answered: Photon alone and
 * unfiltered, because there is nothing yet to filter by and no network to ask
 * about stops.
 *
 * One instance per network, made on first use: the network cannot change
 * while the app runs, and components ask on every render.
 */
export function geocoderFor(network: string | null): Geocoder {
  let geocoder = byNetwork.get(network);
  if (geocoder === undefined) {
    geocoder =
      env.digitransitKey !== null &&
      network !== null &&
      DIGITRANSIT_NETWORKS.has(network)
        ? createDigitransitGeocoder(env.digitransitKey)
        : network === null
          ? createPhotonGeocoder()
          : withFeedStops(
              createPhotonGeocoder({ countries: countriesForNetwork(network) }),
            );
    byNetwork.set(network, geocoder);
  }
  return geocoder;
}

export type { Geocoder } from '../types/place';
