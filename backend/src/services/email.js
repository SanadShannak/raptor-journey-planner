const logger = require("../utils/logger");
const AppError = require("../utils/AppError");

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

  if (!key) {
    if (process.env.NODE_ENV === "production") {
      logger.error("RESEND_API_KEY is not set; cannot send email");
      throw new AppError(503, "EMAIL_UNAVAILABLE", "Email is not configured on this server.");
    }
    logger.info({ to, subject, text }, "Email not sent (no RESEND_API_KEY) — here it is");
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
}

module.exports = { sendEmail };
