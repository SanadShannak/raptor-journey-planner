const aj = require("../utils/arcjet");
const AppError = require("../utils/AppError");

/**
 * Asks Arcjet about this request, and refuses it if Arcjet says so.
 *
 * Three outcomes:
 *
 * - **Denied** — answered 429 for the rate limit, 403 for a bot or an attack
 *   signature, through the usual error handler.
 * - **Errored** — Arcjet could not decide: its service unreachable, the key
 *   missing, the address unreadable. The request goes through and the
 *   problem is logged. Failing *open* is deliberate: an outage at Arcjet must
 *   not lock everybody out of their account.
 * - **Allowed** — `next()`, and on to the route. Without that call the
 *   request would simply hang, which is the one thing a middleware that
 *   does not answer must never do.
 */
const arcjetProtect = async (req, res, next) => {
  const decision = await aj.protect(req, { requested: 1 });

  if (decision.isErrored()) {
    req.log.warn({ reason: decision.reason.message }, "Arcjet could not decide; allowing");
    return next();
  }

  if (decision.isDenied()) {
    if (decision.reason.isRateLimit()) {
      throw new AppError(429, "RATE_LIMITED", "Too many attempts. Please try again later.");
    }
    if (decision.reason.isBot()) {
      throw new AppError(403, "BOT_DETECTED", "Automated requests are not allowed.");
    }
    throw new AppError(403, "REQUEST_BLOCKED", "Request blocked by security rules.");
  }

  next();
};

module.exports = arcjetProtect;
