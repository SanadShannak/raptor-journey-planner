const rateLimit = require("express-rate-limit");
const AppError = require("../utils/AppError");

/**
 * Per visitor, on the routes that send email: five requests an hour.
 *
 * Sign-up, "send a new link" and "forgot password" share this one allowance,
 * because each of them costs an email from a monthly allowance shared by the
 * whole site. Nobody legitimately needs more than a couple — a link that has
 * not arrived in a minute is not made to arrive by asking six more times.
 *
 * In memory, like the global limiter, and keyed on `req.ip` for the same
 * reason (see `expressRateLimiter.js`). The limits on what is actually sent —
 * per address and for the whole site — are counted in the database by
 * `services/email.js`, so a restart that resets this one resets nothing that
 * matters.
 */
const emailRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res, next) => {
    next(new AppError(429, "RATE_LIMITED", "Too many requests. Please try again later."));
  },
});

module.exports = emailRateLimiter;
