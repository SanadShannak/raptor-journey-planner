const User = require("../models/User");
const logger = require("../utils/logger");

/**
 * Small, idempotent data fixes, run every time the server starts.
 *
 * Each one only touches documents that still need it, so running it again on
 * a database it has already fixed changes nothing — which is what makes
 * "run at startup" safe, and spares anybody a manual step on deploy.
 */
async function runMigrations() {
  /*
   * Accounts made before email verification existed have no `emailVerified`
   * at all. They are trusted as verified: they signed up when nothing was
   * asked of them, and holding them to a link that was never sent would nag
   * every existing user. Every account created since has the field (false),
   * so this never matches a new one.
   */
  const { modifiedCount } = await User.updateMany(
    { emailVerified: { $exists: false } },
    { $set: { emailVerified: true } },
  );
  if (modifiedCount > 0) {
    logger.info({ count: modifiedCount }, "Marked existing accounts as verified");
  }
}

module.exports = runMigrations;
