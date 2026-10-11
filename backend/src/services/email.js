const crypto = require("node:crypto");
const logger = require("../utils/logger");
const AppError = require("../utils/AppError");
const EmailSend = require("../models/EmailSend");

/*
 * The sending limits.
 *
 * Resend's free plan allows 100 emails a day and 3,000 a calendar month, and
 * past either it refuses — which would stop sign-ups and password resets for
 * everybody until the window rolls over. So this server stops itself a
 * little short, and spreads what is left fairly:
 *
 * - **The whole site:** `EMAIL_DAILY_LIMIT` a day (default 90) and
 *   `EMAIL_MONTHLY_LIMIT` a calendar month, UTC (default 2900) — the margin
 *   leaves room for the odd email sent by hand from the dashboard.
 * - **One address:** at most one email a minute, and five a day. Without
 *   this, anybody could flood one person's inbox — and spend everyone's
 *   allowance doing it — by asking for links from many machines.
 *
 * Counted in MongoDB rather than in memory, so a restart does not hand out a
 * fresh allowance. The per-IP limit on the routes themselves lives in
 * `middleware/emailRateLimiter.js`.
 */
const ADDRESS_GAP_MS = 60 * 1000;
const ADDRESS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

const limitFromEnv = (name, fallback) => {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

const hashAddress = (address) =>
  crypto.createHash("sha256").update(address.trim().toLowerCase()).digest("hex");

/**
 * Refuses a send that would break a limit, by throwing.
 *
 * - Too many to this address: `429 TOO_MANY_EMAILS` — the person can wait.
 * - The site's allowance spent: `503 EMAIL_UNAVAILABLE` — nobody can do
 *   anything about it, and it is logged so whoever runs the server finds out.
 */
async function checkLimits(addressHash) {
  const now = Date.now();

  const recent = await EmailSend.find({ addressHash, sentAt: { $gte: new Date(now - DAY_MS) } })
    .sort({ sentAt: -1 })
    .limit(ADDRESS_PER_DAY)
    .lean();
  if (recent.length >= ADDRESS_PER_DAY || (recent[0] && now - recent[0].sentAt < ADDRESS_GAP_MS)) {
    throw new AppError(429, "TOO_MANY_EMAILS", "Too many emails to this address. Try again later.");
  }

  const startOfMonth = new Date(Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1));
  const [today, thisMonth] = await Promise.all([
    EmailSend.countDocuments({ sentAt: { $gte: new Date(now - DAY_MS) } }),
    EmailSend.countDocuments({ sentAt: { $gte: startOfMonth } }),
  ]);
  const daily = limitFromEnv("EMAIL_DAILY_LIMIT", 90);
  const monthly = limitFromEnv("EMAIL_MONTHLY_LIMIT", 2900);
  if (today >= daily || thisMonth >= monthly) {
    logger.error({ today, thisMonth, daily, monthly }, "Email allowance spent; refusing to send");
    throw new AppError(503, "EMAIL_UNAVAILABLE", "Email is temporarily unavailable.");
  }
}

/**
 * Sends one email through Resend (https://resend.com).
 *
 * Resend's HTTP API with the built-in `fetch`, rather than its SDK: one POST
 * with a bearer key is the whole integration, and a library for it would be
 * a dependency doing what four lines do.
 *
 * Configured by two variables:
 *
 * - `RESEND_API_KEY` — from the Resend dashboard. Secret; `backend/.env` only.
 * - `EMAIL_FROM` — the sender, e.g. `Journey Planner <no-reply@journeyplanner.city>`.
 *   Its domain must be verified in Resend, or every send is refused.
 *
 * **Without a key, in development, nothing is sent and the email is written
 * to the log instead** — subject, recipient and the text with its link — so
 * the whole flow can be tried locally by clicking the link from the terminal.
 * In production a missing key is a misconfiguration, and the send fails with
 * `503 EMAIL_UNAVAILABLE` rather than pretending to have worked.
 *
 * @param {{ to: string, subject: string, html: string, text: string }} message
 */
async function sendEmail({ to, subject, html, text }) {
  const key = process.env.RESEND_API_KEY;
  const addressHash = hashAddress(to);

  // Before anything else, the logged-instead email included, so the limits
  // can be tried out locally exactly as they behave in production.
  await checkLimits(addressHash);

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      logger.error("RESEND_API_KEY is not set; cannot send email");
      throw new AppError(503, "EMAIL_UNAVAILABLE", "Email is not configured on this server.");
    }
    logger.info({ to, subject, text }, "Email not sent (no RESEND_API_KEY) — here it is");
    await EmailSend.create({ addressHash });
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Journey Planner <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
      text,
    }),
    // A mail provider that stops answering must not hold a request open.
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    // Resend explains itself in the body; that is for our log, not the client.
    const detail = await response.text().catch(() => "");
    logger.error({ status: response.status, detail }, "Resend refused the email");
    throw new AppError(503, "EMAIL_UNAVAILABLE", "The email could not be sent.");
  }

  // Counted only once Resend has taken it: a refused send cost nothing.
  await EmailSend.create({ addressHash });
}

module.exports = { sendEmail };
