const serverConfig = require("../serverConfig");
const { getNetworkMeta } = require("../../memoryCache");

/*
 * What this network charges in.
 *
 * The same shape as `networkTimezone`, and for the same reason: it is one
 * value everything else derives from, so a card balance reads in dinars on an
 * Amman feed and in euros on a Helsinki one without a single call site knowing
 * which network is loaded.
 *
 * The feed is the authority. GTFS carries it in `fare_attributes.currency_type`
 * — HSL says `EUR` there — and the day the pipeline compiles that field into
 * network-meta this function starts using it with no other change. Until then
 * the table below answers, exactly as `NETWORK_TIMEZONES` answers for a feed
 * with no agency.txt.
 *
 * The table lives here rather than in `serverConfig` so the fallback sits
 * beside the resolver that consumes it; nothing else has any use for it.
 *
 * Null rather than a guess when the network is unknown. A balance printed in
 * the wrong currency is worse than one printed with no currency at all.
 */

/** ISO 4217, which is what `Intl.NumberFormat` takes. */
const NETWORK_CURRENCIES = {
  hsl: "EUR",
  sydney: "AUD",
  amman: "JOD",
};

function networkCurrency() {
  return (
    getNetworkMeta()?.currency ??
    NETWORK_CURRENCIES[serverConfig.ACTIVE_NETWORK] ??
    null
  );
}

module.exports = { networkCurrency, NETWORK_CURRENCIES };
