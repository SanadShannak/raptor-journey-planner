const rateLimit = require("express-rate-limit");
const AppError = require("../utils/AppError");

/**
 * A generous per-IP ceiling on the whole API, kept in memory here.
 *
 * Not the defence against a determined attack — Arcjet guards the account
 * routes — but the cap that stops one client, a stuck script or an
 * over-eager scraper, from monopolising a server shared with other people's
 * apps. Free and local, so it can sit in front of the busy public endpoints
 * Arcjet's monthly allowance could never cover.
 *
 * 300 a minute because legitimate use is busier than it looks: a favourites
 * page refreshes every saved stop's departures each minute, and a whole
 * office or a phone carrier can share one public address.
 *
 * Keyed on `req.ip`, which is the visitor's address only because `app.js`
 * sets `trust proxy` — without it, everybody would be Caddy and share one
 * allowance between them.
 *
 * The health check is exempt: Docker asks it every thirty seconds and must
 * never be told no.
 */
const globalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: (req) => req.path === "/api/health",
  handler: (req, res, next) => {
    next(new AppError(429, "RATE_LIMITED", "Too many requests. Please slow down."));
  },
});

module.exports = globalRateLimiter;
