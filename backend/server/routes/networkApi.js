const express = require("express");
const router = express.Router();
const serverConfig = require("../serverConfig");
const logCalculationTime = require("../utils/logCalculationTime");

const {
  getNetworkMeta,
  getCapabilities,
  getModes,
} = require("../../memoryCache");
const { networkTimezone } = require("../utils/networkTime");
const { networkCurrency } = require("../utils/networkCurrency");

/*
 * What the loaded network is and what its data supports.
 *
 * A client fetches this once at startup and then knows two things it would
 * otherwise have to guess: which clock every timestamp in this API is
 * expressed in, and which optional fields are worth rendering UI for. The
 * alternative — null-checking every optional field at every call site — hides
 * the difference between "this network has no wheelchair data" and "this
 * particular stop is missing it", which are not the same thing to a user.
 */
router.get("/", (req, res) => {
  try {
    const startedAt = performance.now();
    const meta = getNetworkMeta();

    logCalculationTime("Network Manifest", startedAt);
    res.json({
      network: serverConfig.ACTIVE_NETWORK,

      /*
       * Every date and time this API returns is wall-clock in this zone. It is
       * reported so a client can work out the network's "today" rather than
       * its own, which differ for part of every day.
       */
      timezone: networkTimezone(),

      /** The language stop and route names are written in, for markup and
       * screen-reader pronunciation. Null when the feed does not say. */
      language: meta?.language ?? null,

      /*
       * What this network charges in, as ISO 4217. Reported for the same
       * reason as the timezone: it is one value everything derives from, so
       * nothing downstream has to know which city is loaded to print a fare.
       *
       * Null when it cannot be established, and a client should then print a
       * bare number — a balance in the wrong currency is worse than one with
       * no currency at all.
       */
      currency: networkCurrency(),

      agencyName: meta?.agencyName ?? null,
      agencyUrl: meta?.agencyUrl ?? null,
      publisherName: meta?.publisherName ?? null,
      publisherUrl: meta?.publisherUrl ?? null,

      // What the feed claims to cover. The dates that actually have service
      // come from /api/valid-dates, which can be narrower.
      feedStartDate: meta?.feedStartDate ?? null,
      feedEndDate: meta?.feedEndDate ?? null,
      feedVersion: meta?.feedVersion ?? null,
      compiledAt: meta?.compiledAt ?? null,

      // Every key is present and boolean even when metadata is missing, so a
      // caller never has to check whether it can ask.
      capabilities: getCapabilities(),

      /*
       * The standard GTFS route types this network runs, ascending. Says what
       * *moves*, where `capabilities` says which optional columns the feed
       * supplied — a mode filter needs the former, and the only other way to
       * learn it is to fetch every line and read one field off each.
       */
      modes: getModes(),
    });
  } catch (error) {
    console.error("[Network Endpoint Error]:", error);
    res.status(500).json({
      errorCode: "INTERNAL_SERVER_ERROR",
      error: "Failed to resolve network metadata.",
    });
  }
});

module.exports = router;
