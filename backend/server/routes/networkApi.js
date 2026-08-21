const express = require("express");
const router = express.Router();
const serverConfig = require("../serverConfig");

const { getNetworkMeta, getCapabilities } = require("../../memoryCache");
const { networkTimezone } = require("../utils/networkTime");

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
    const meta = getNetworkMeta();

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
