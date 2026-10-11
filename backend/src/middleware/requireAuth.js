const { verifyToken } = require("../services/jwt");
const User = require("../models/User");
const AppError = require("../utils/AppError");

/**
 * Lets a request through only with a valid session cookie for a user who
 * still exists, and puts that user on `req.user`.
 *
 * Every way of not being signed in is the same 401 `UNAUTHORIZED` — no
 * cookie, a cookie that does not verify or has expired, a user since deleted.
 * The client does the same thing for all of them (treat the session as over),
 * and telling them apart would only help someone probing tokens.
 *
 * Only the token check is caught here. A database that fails while looking the
 * user up is not "you are signed out" — it is the server failing — so it goes
 * on to the error handler as a 500 rather than logging somebody out.
 */
const requireAuth = async (req, res, next) => {
  const token = req.cookies.jwt;
  if (!token) throw new AppError(401, "UNAUTHORIZED", "Not authorized. Please log in.");

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Not authorized. Please log in.");
  }

  req.user = await User.findById(decoded.id);
  if (!req.user) throw new AppError(401, "UNAUTHORIZED", "User no longer exists.");

  next();
};

module.exports = requireAuth;
