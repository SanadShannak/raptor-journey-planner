const User = require("../models/User");
const AppError = require("../utils/AppError");
const { setAuthCookie, clearAuthCookie } = require("../services/cookies");
const { issueToken, consumeToken, revokeTokens } = require("../services/authTokens");
const { sendEmail } = require("../services/email");
const { verificationEmail, passwordResetEmail } = require("../services/emailTemplates");

/** Where links in emails point: the site itself, e.g. https://journeyplanner.city. */
const appUrl = () => (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, "");

/** The language to write an email in: whatever the person was using the site in. */
const localeOf = (req) => (req.body?.locale === "ar" ? "ar" : "en");

/** What a client is told about the signed-in account. */
const describeAccount = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  emailVerified: user.emailVerified,
});

/** Makes a fresh verification token and emails the link to the account's address. */
async function sendVerification(user, locale) {
  const token = await issueToken(user._id, "verify-email");
  const link = `${appUrl()}/verify-email?token=${token}`;
  await sendEmail({ to: user.email, ...verificationEmail({ name: user.name, link, locale }) });
}

/*
 * No try/catch in these handlers. Express 5 hands a rejected promise from an
 * async handler to the error middleware by itself, so an unexpected failure —
 * the database going away — reaches `errorHandler` and is logged and answered
 * there. The handlers only describe the failures they expect, by throwing
 * `AppError`.
 */

const registerUser = async (req, res) => {
  const { email, name, password } = req.body;

  if (await User.exists({ email })) {
    throw new AppError(400, "EMAIL_IN_USE", "A user with this email already exists.");
  }

  const newUser = await User.create({ email, name, password });

  setAuthCookie(res, newUser._id);

  /*
   * The account exists whether or not the email goes out, so a failure to
   * send is logged and the sign-up still succeeds — the banner offers to
   * send the link again.
   */
  try {
    await sendVerification(newUser, localeOf(req));
  } catch (err) {
    req.log.warn({ err }, "Verification email failed after sign-up");
  }

  return res.status(201).json({
    message: "User registered successfully",
    data: describeAccount(newUser),
  });
};

/**
 * One answer for a wrong email and a wrong password.
 *
 * They used to be told apart — "no user with this email" and "incorrect
 * password" — which let anyone find out whether an address has an account
 * here by trying to log in with it.
 */
const loginUser = async (req, res) => {
  const { email, password } = req.body;
  const targetUser = await User.findOne({ email });

  if (targetUser === null || !(await targetUser.matchPassword(password))) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  setAuthCookie(res, targetUser._id);

  return res.status(200).json({
    message: "Login successful",
    data: describeAccount(targetUser),
  });
};

const logoutUser = async (req, res) => {
  clearAuthCookie(res);
  return res.status(200).json({ message: "Logged out successfully" });
};

const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");
  return res.status(200).json({ data: user });
};

/**
 * Confirms the signed-in person's password before something irreversible.
 *
 * Answers with nothing but success. It used to send the whole user document
 * back — the password **hash** included — to a caller that never read it.
 */
const verifyUserPassword = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!(await user.matchPassword(req.body.password))) {
    throw new AppError(401, "INCORRECT_PASSWORD", "Incorrect password.");
  }

  return res.status(200).json({ message: "Password verified" });
};

/** Sends the signed-in person a fresh verification link. */
const resendVerification = async (req, res) => {
  if (req.user.emailVerified) {
    return res.status(200).json({ message: "Already verified", data: { emailVerified: true } });
  }
  // A failure here is reported: the person is waiting for this email.
  await sendVerification(req.user, localeOf(req));
  return res.status(200).json({ message: "Verification email sent" });
};

/**
 * Marks an address verified, from the token in the emailed link.
 *
 * Needs no session: the link is often opened on another device — the phone
 * the email arrived on — and the token alone proves who it was sent to.
 */
const verifyEmail = async (req, res) => {
  const userId = await consumeToken(req.body.token, "verify-email");
  if (userId === null) {
    throw new AppError(400, "INVALID_TOKEN", "This link is invalid or has expired.");
  }
  await User.updateOne({ _id: userId }, { $set: { emailVerified: true } });
  return res.status(200).json({ message: "Email verified", data: { emailVerified: true } });
};

/**
 * Emails a password-reset link, if the address has an account.
 *
 * **The answer is the same either way, and comes back before anything is
 * done.** Saying "no account with that email" would let anyone test which
 * addresses are registered — and so would answering a known address more
 * slowly, because only that one waits for a token to be saved and an email
 * to go out. So the reply goes first, and the work happens after it; a
 * failure to send is logged, since there is nobody left to tell.
 */
const forgotPassword = async (req, res) => {
  const email = String(req.body.email).trim().toLowerCase();
  const locale = localeOf(req);

  res.status(200).json({
    message: "If an account exists for that address, a reset link has been sent.",
  });

  try {
    const user = await User.findOne({ email });
    if (user === null) return;
    const token = await issueToken(user._id, "reset-password");
    const link = `${appUrl()}/reset-password?token=${token}`;
    await sendEmail({ to: user.email, ...passwordResetEmail({ name: user.name, link, locale }) });
  } catch (err) {
    req.log.error({ err }, "Password reset email failed");
  }
};

/**
 * Sets a new password from the token in a reset link, and signs the person in.
 *
 * Three things follow a reset, and each is deliberate:
 *
 * - `passwordChangedAt` moves, which ends every **other** session — a reset
 *   is somebody taking their account back. It is set a second in the past so
 *   the session issued just below, whose timestamp is in whole seconds, is
 *   not caught by its own cut-off.
 * - The address counts as **verified**: the link reached it, which is all
 *   verification ever proves.
 * - Any other reset links still out there stop working.
 */
const resetPassword = async (req, res) => {
  const userId = await consumeToken(req.body.token, "reset-password");
  if (userId === null) {
    throw new AppError(400, "INVALID_TOKEN", "This link is invalid or has expired.");
  }

  const user = await User.findById(userId);
  if (user === null) {
    throw new AppError(400, "INVALID_TOKEN", "This link is invalid or has expired.");
  }

  user.password = req.body.password;
  user.passwordChangedAt = new Date(Date.now() - 1000);
  user.emailVerified = true;
  await user.save();
  await revokeTokens(user._id, "reset-password");

  setAuthCookie(res, user._id);
  return res.status(200).json({ message: "Password reset", data: describeAccount(user) });
};

module.exports = {
  resendVerification,
  verifyEmail,
  forgotPassword,
  resetPassword,
  registerUser,
  loginUser,
  logoutUser,
  getUserProfile,
  verifyUserPassword,
};
