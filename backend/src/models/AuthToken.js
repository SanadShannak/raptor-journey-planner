const mongoose = require("mongoose");

/**
 * A one-time token: the secret in a verification or password-reset link.
 *
 * **Only a hash of the token is stored.** The token itself goes out in the
 * email and is never kept. Somebody who could read this collection — a leaked
 * backup, a misconfigured dashboard — gets hashes, and a hash cannot be put
 * into a link. It is the same reason passwords are hashed, minus the slow
 * hashing: a token is 32 random bytes, so there is nothing to guess at and a
 * plain SHA-256 is enough.
 *
 * `expiresAt` carries a TTL index, so MongoDB deletes a token on its own once
 * it has expired — no clean-up job. The deletion runs about once a minute,
 * which is why `consumeToken` checks the expiry itself rather than trusting
 * that an expired token is already gone.
 */
const authTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    purpose: { type: String, enum: ["verify-email", "reset-password"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true },
);

module.exports = mongoose.model("AuthToken", authTokenSchema);
