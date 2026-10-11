/**
 * The two emails the server sends, in English and Arabic.
 *
 * The language is the one the person was using the site in when they asked —
 * the client sends its locale with the request — so somebody who signed up in
 * Arabic is not sent an English email.
 *
 * Every email goes out as HTML and as plain text. Some clients show only the
 * text, and some filters treat an HTML-only message as more likely spam.
 *
 * The HTML is deliberately plain: inline styles only (email clients ignore
 * stylesheets), one button, and the link written out in full beneath it for
 * clients that block buttons.
 */

const COPY = {
  en: {
    dir: "ltr",
    brand: "Journey Planner",
    verify: {
      subject: "Confirm your email for Journey Planner",
      greeting: (name) => `Hi ${name},`,
      body: "Please confirm that this is your email address. The link works for 24 hours.",
      button: "Confirm my email",
    },
    reset: {
      subject: "Reset your Journey Planner password",
      greeting: (name) => `Hi ${name},`,
      body: "Somebody asked to reset the password for your account. If it was you, choose a new password below. The link works for 10 minutes.",
      button: "Choose a new password",
    },
    fallback: "If the button does not work, open this link:",
    ignore: "If you did not ask for this, you can ignore this email.",
  },
  ar: {
    dir: "rtl",
    brand: "مخطط الرحلات",
    verify: {
      subject: "أكّد بريدك الإلكتروني في مخطط الرحلات",
      greeting: (name) => `مرحبًا ${name}،`,
      body: "يرجى تأكيد أن هذا هو بريدك الإلكتروني. يعمل الرابط لمدة 24 ساعة.",
      button: "تأكيد بريدي الإلكتروني",
    },
    reset: {
      subject: "إعادة تعيين كلمة المرور في مخطط الرحلات",
      greeting: (name) => `مرحبًا ${name}،`,
      body: "طلب أحدهم إعادة تعيين كلمة المرور لحسابك. إن كنت أنت، فاختر كلمة مرور جديدة أدناه. يعمل الرابط لمدة 10 دقائق.",
      button: "اختيار كلمة مرور جديدة",
    },
    fallback: "إن لم يعمل الزر، فافتح هذا الرابط:",
    ignore: "إن لم تطلب ذلك، فيمكنك تجاهل هذه الرسالة.",
  },
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

function build(kind, { name, link, locale }) {
  const copy = COPY[locale] ?? COPY.en;
  const part = copy[kind];
  const align = copy.dir === "rtl" ? "right" : "left";

  const text = [
    part.greeting(name),
    "",
    part.body,
    "",
    link,
    "",
    copy.ignore,
    "",
    `— ${copy.brand}`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="${locale === "ar" ? "ar" : "en"}" dir="${copy.dir}">
<body style="margin:0;padding:24px;background:#f6f2f4;font-family:Arial,Helvetica,sans-serif;color:#1d1a1c;text-align:${align}">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">
    <p style="margin:0 0 20px;font-weight:bold;color:#7a1c3d">${escapeHtml(copy.brand)}</p>
    <p style="margin:0 0 12px">${escapeHtml(part.greeting(name))}</p>
    <p style="margin:0 0 24px;line-height:1.5">${escapeHtml(part.body)}</p>
    <p style="margin:0 0 24px">
      <a href="${escapeHtml(link)}" style="display:inline-block;background:#7a1c3d;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapeHtml(part.button)}</a>
    </p>
    <p style="margin:0 0 6px;font-size:13px;color:#6b6468">${escapeHtml(copy.fallback)}</p>
    <p style="margin:0 0 24px;font-size:13px;word-break:break-all" dir="ltr"><a href="${escapeHtml(link)}" style="color:#7a1c3d">${escapeHtml(link)}</a></p>
    <p style="margin:0;font-size:13px;color:#6b6468">${escapeHtml(copy.ignore)}</p>
  </div>
</body>
</html>`;

  return { subject: part.subject, html, text };
}

const verificationEmail = (args) => build("verify", args);
const passwordResetEmail = (args) => build("reset", args);

module.exports = { verificationEmail, passwordResetEmail };
