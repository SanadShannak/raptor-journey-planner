/**
 * The network the client assumes until `/api/network` says which one it is.
 *
 * Every per-network table — where the maps open, where place search looks,
 * which countries it keeps, which basemap is drawn — answers a `null` network
 * with this one's entry. That covers the first paint, which happens before the
 * API has answered, and an API that cannot be reached at all.
 *
 * It should name the network this build is deployed for, so that the moment
 * before the answer arrives already shows the right city instead of jumping
 * there from another one. It is a default, not a decision: whatever
 * `/api/network` reports always wins.
 */
export const DEFAULT_NETWORK = 'amman';
