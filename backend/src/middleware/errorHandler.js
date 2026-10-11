const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

/**
 * Any `/api` path no router answered. Same envelope as every other failure,
 * so a client never has to tell an HTML "Cannot GET" page from an answer.
 */
const notFound = (req, res, next) => {
  next(new AppError(404, "NOT_FOUND", `No endpoint at ${req.method} ${req.originalUrl.split("?")[0]}.`));
};

/**
 * Turns whatever a request threw into the one error envelope.
 *
 * Routes do not answer their own failures any more; they throw, and this
 * decides what the client is told. Express 5 forwards a rejected promise from
 * an async handler here by itself, so a handler needs no try/catch just to
 * call `next(error)`.
 *
 * Three kinds of thing arrive:
 *
 * - An `AppError` — expected, already described. Answered as it says, and
 *   logged at `warn` only when it is a 5xx; a 404 for a card that is not there
 *   is the API working, not a problem to read about.
 * - An error Express or a library raised with a status of its own — a body
 *   that is not valid JSON, one that is too large. Translated to a code.
 * - Anything else — a bug. Logged in full at `error`, with the request id
 *   `pino-http` gave this request, and answered with a generic 500 that says
 *   nothing about what went wrong inside. `error.message` never reaches the
 *   client: it can carry query fragments, file paths, or a database's view
 *   of a document.
 */
// Express recognises an error handler by its four parameters, so `next` stays
// even though it is never called.
const errorHandler = (err, req, res, next) => {
  // The request's own child logger, so the line carries its id.
  const log = req.log ?? logger;

  if (err instanceof AppError) {
    if (err.status >= 500) log.error({ err }, err.message);
    return res
      .status(err.status)
      .json({ errorCode: err.errorCode, error: err.message, ...err.details });
  }

  // Body parsing: malformed JSON, or a body over the size limit.
  if (err.type === "entity.parse.failed") {
    return res
      .status(400)
      .json({ errorCode: "MALFORMED_JSON", error: "The request body is not valid JSON." });
  }
  if (err.type === "entity.too.large") {
    return res
      .status(413)
      .json({ errorCode: "PAYLOAD_TOO_LARGE", error: "The request body is too large." });
  }

  // A route id that is not a valid MongoDB ObjectId names nothing that exists.
  if (err.name === "CastError") {
    return res.status(404).json({ errorCode: "NOT_FOUND", error: "Nothing has that id." });
  }

  log.error({ err }, "Unhandled error");
  return res.status(500).json({
    errorCode: "INTERNAL_SERVER_ERROR",
    error: "Something went wrong on the server.",
  });
};

module.exports = { notFound, errorHandler };
