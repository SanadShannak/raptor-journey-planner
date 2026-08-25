const mongoose = require("mongoose");
const serverConfig = require("../serverConfig");

/**
 * The card store.
 *
 * Only the card endpoints use it. Journey planning, stops, lines and the
 * network manifest are all served from the in-memory compiled feed and do not
 * know Mongo exists — which is why a failure here **must not** take the process
 * down. Exiting on a refused connection meant a database nobody had started yet
 * stopped a rider from planning a journey, and the symptom was a server that
 * appeared to boot and then vanished.
 *
 * So it fails soft: the connection is attempted, the outcome is logged, and
 * `isCardStoreReady()` lets the card router answer honestly — a 503 that says
 * "this part is unavailable" rather than a 500 that says something broke.
 */

/**
 * How long to wait for a server that is not there.
 *
 * Mongoose's default is thirty seconds, which is thirty seconds of a request
 * hanging before anyone finds out the store is down. A local socket either
 * answers quickly or is not listening.
 */
const SELECTION_TIMEOUT_MS = 5000;

async function connectDB() {
  const uri = serverConfig.MONGO_URI;

  if (!uri) {
    console.warn(
      "[Mongo] No MONGO_URI configured; card endpoints will report unavailable.",
    );
    return false;
  }

  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: SELECTION_TIMEOUT_MS,
    });
    console.log("[Mongo] Connected Successfully.");
    return true;
  } catch (error) {
    /*
     * The message only. A connection error carries the URI, and the URI
     * carries the password on any hosted cluster.
     */
    console.error(`[Mongo] Not connected: ${error.message}`);

    return false;
  }
}

/** Whether a query would reach anything. `1` is mongoose's "connected". */
function isCardStoreReady() {
  return mongoose.connection.readyState === 1;
}

module.exports = { connectDB, isCardStoreReady };
