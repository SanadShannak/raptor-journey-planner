const { default: arcjet, shield, detectBot, tokenBucket } = require("@arcjet/node");

/**
 * The Arcjet client: attack signatures, bot detection, and a per-IP limit,
 * for the routes where a guess costs something — logging in, signing up,
 * confirming a password.
 *
 * Only those routes. Arcjet's free plan counts every `protect()` call
 * against 10,000 a month, so it guards the few requests worth guarding and
 * `express-rate-limit` handles the busy public ones locally, for free.
 *
 * `@arcjet/node` is an ES module. Node (22.12+) can `require` one, but what
 * comes back is the module's namespace, so the default export is read as
 * `default` — and this file has to stay CommonJS throughout: one `import` in
 * it would make Node load the whole file as a module, where `module.exports`
 * means nothing and the export silently comes out empty.
 *
 * `proxies` names the addresses that are our own reverse proxies, so Arcjet
 * reads the visitor's address from `X-Forwarded-For` past them rather than
 * seeing every request arrive from Caddy. Docker's networks live in the
 * private ranges, and no visitor ever does.
 *
 * `ARCJET_MODE=DRY_RUN` makes every rule report instead of refuse — the
 * decision is still logged, nobody is blocked — for watching what it would
 * do before trusting it with real traffic. Anything else is `LIVE`.
 */
const mode = process.env.ARCJET_MODE === "DRY_RUN" ? "DRY_RUN" : "LIVE";

const aj = arcjet({
  key: process.env.ARCJET_KEY,
  characteristics: ["ip.src"],
  proxies: ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"],
  rules: [
    shield({ mode }),
    // No bot is welcome on a login form, search engines included.
    detectBot({ mode, allow: [] }),
    /*
     * Ten attempts at once, then one every six seconds. Plenty for a person
     * who mistyped a password twice; useless to a script guessing thousands.
     */
    tokenBucket({ mode, refillRate: 10, interval: "60s", capacity: 10 }),
  ],
});

module.exports = aj;
