const pino = require("pino");

/**
 * The one logger every part of the server writes through.
 *
 * Events with fields, not sentences: `logger.info({ ms: 12 }, "route
 * calculated")` rather than a formatted string, so a line can be filtered on
 * its values later — every request slower than 500ms, every error on one path.
 *
 * JSON lines in production, which is what Docker collects from stdout and
 * rotates; coloured, readable lines everywhere else through `pino-pretty`,
 * a dev dependency the production image does not install — which is why the
 * choice keys on `NODE_ENV` and the Dockerfile sets it.
 *
 * `LOG_LEVEL` picks how much is said: `debug` adds the per-calculation
 * timings, `warn` keeps only problems. Defaults to `info`.
 *
 * Redaction is a backstop, not the plan: request bodies (passwords) and the
 * session cookie are never logged on purpose, and these paths only catch them
 * should a log call ever pass a whole request along by mistake.
 */
const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  redact: {
    paths: [
      "req.headers.cookie",
      "req.headers.authorization",
      'res.headers["set-cookie"]',
      "req.body",
      "*.password",
    ],
    censor: "[REDACTED]",
  },
  transport:
    process.env.NODE_ENV === "production"
      ? undefined
      : {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
        },
});

module.exports = logger;
