/**
 * An error the server *expects* and knows how to describe.
 *
 * Thrown wherever a request cannot be answered the way it asked — a card that
 * does not exist, a password that does not match, a date outside the feed —
 * and turned into a response by the one error handler in `app.js`:
 *
 *   throw new AppError(404, "CARD_NOT_FOUND", "Card not found.");
 *   → 404 { "errorCode": "CARD_NOT_FOUND", "error": "Card not found." }
 *
 * `errorCode` is the contract: stable, upper snake case, what the client maps
 * to a sentence in the reader's language. `message` is for developers and is
 * never shown to anyone. `details` is merged into the body for the rare error
 * that has more to say — the per-field complaints of a rejected form.
 *
 * Anything thrown that is *not* an AppError is a bug, and the handler answers
 * it with a generic 500 and logs the whole thing.
 */
class AppError extends Error {
  /**
   * @param {number} status HTTP status to answer with.
   * @param {string} errorCode Stable machine-readable code.
   * @param {string} message Developer-facing English.
   * @param {Record<string, unknown>} [details] Extra fields for the body.
   */
  constructor(status, errorCode, message, details) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.errorCode = errorCode;
    this.details = details;
  }
}

module.exports = AppError;
