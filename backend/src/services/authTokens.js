const crypto = require("node:crypto");
const AuthToken = require("../models/AuthToken");

/**
 * How long each kind of link works for.
 *
 * A reset link is a key to the account, so it lives ten minutes: long enough
 * to open the email that was just asked for, and short enough that a link
 * glimpsed on somebody's screen, or left in an inbox, is dead almost at once. A
 * verification link only proves an address is real, and people open those
 * later, so it lives a day.
 */
const LIFETIME_MS = {
  "verify-email": 24 * 60 * 60 * 1000,
  "reset-password": 10 * 60 * 1000,
};

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");

/**
 * Creates a token for one user and one purpose, and returns it **once** — the
 * caller puts it in a link and it is never seen again.
 *
 * Any earlier token of the same purpose for the same user is deleted first,
 * so only the newest link works. Asking twice for a reset email and then
 * using the first one would otherwise leave two live keys to the account.
 *
 * 32 random bytes, as URL-safe base64: 43 characters that go into a query
 * string without escaping.
 */
async function issueToken(userId, purpose) {
  await AuthToken.deleteMany({ user: userId, purpose });

  const token = crypto.randomBytes(32).toString("base64url");
  await AuthToken.create({
    user: userId,
    purpose,
    tokenHash: hash(token),
    expiresAt: new Date(Date.now() + LIFETIME_MS[purpose]),
  });
  return token;
}

/**
 * Uses a token up: returns the user it belongs to, or null if it is wrong,
 * expired, already used, or for another purpose.
 *
 * Find-and-delete in one operation, so a token can be spent only once even if
 * two requests carrying it arrive at the same moment — exactly one of them
 * gets the document back.
 *
 * Every way of failing returns the same null. Telling "expired" from "never
 * existed" would help nobody but someone guessing tokens.
 */
async function consumeToken(token, purpose) {
  if (typeof token !== "string" || token.length === 0) return null;

  const found = await AuthToken.findOneAndDelete({
    tokenHash: hash(token),
    purpose,
    expiresAt: { $gt: new Date() },
  });
  return found === null ? null : found.user;
}

/**
 * Whether a token would still work, **without spending it**.
 *
 * For the reset page, so a link that has expired or was already used says so
 * the moment it is opened rather than after a new password has been typed.
 * Answers only yes or no; whose token it is stays with the server.
 */
async function isTokenUsable(token, purpose) {
  if (typeof token !== "string" || token.length === 0) return false;
  const found = await AuthToken.exists({
    tokenHash: hash(token),
    purpose,
    expiresAt: { $gt: new Date() },
  });
  return found !== null;
}

/** Deletes every token of a purpose for a user — after a password change, say. */
async function revokeTokens(userId, purpose) {
  await AuthToken.deleteMany({ user: userId, purpose });
}

module.exports = { issueToken, consumeToken, isTokenUsable, revokeTokens, LIFETIME_MS };
