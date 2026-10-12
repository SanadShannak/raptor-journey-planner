const User = require("../models/User");
const AppError = require("../utils/AppError");
const { setAuthCookie, clearAuthCookie } = require("../services/cookies");
const { issueToken, consumeToken, isTokenUsable, revokeTokens } = require("../services/authTokens");
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

/**
 * Creates an account that does not work until its address is confirmed.
 *
 * No session is set: the account is pending until somebody opens the link
 * sent to the address, which proves the address is theirs. Only then can it
 * log in.
 *
 * Signing up again with an address that was **never confirmed** replaces the
 * pending account — new name, new password, new link — rather than answering
 * "already in use". An unconfirmed account proves nothing about who owns the
 * address, so it must not be able to lock the real owner out of it: a typo,
 * or somebody signing up with an address that is not theirs, would otherwise
 * hold it for good. Whoever can read the inbox is who ends up with it.
 *
 * A failure to send is reported (503): without the email there is no way
 * forward, and signing up again simply tries once more.
 */
const registerUser = async (req, res) => {
  const { email, name, password } = req.body;

  let user = await User.findOne({ email });
  if (user !== null && user.emailVerified) {
    throw new AppError(400, "EMAIL_IN_USE", "A user with this email already exists.");
  }

  if (user === null) {
    user = await User.create({ email, name, password });
  } else {
    user.name = name;
    user.password = password;
    await user.save();
  }

  await sendVerification(user, localeOf(req));

  return res.status(201).json({
    message: "Check your email to confirm the address before logging in.",
    data: { email: user.email, verificationRequired: true },
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

  /*
   * Told apart only *after* the password matched: whoever gets this far owns
   * the account, so saying it is unconfirmed reveals nothing to a stranger.
   */
  if (!targetUser.emailVerified) {
    throw new AppError(403, "EMAIL_NOT_VERIFIED", "Confirm your email address before logging in.");
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

/**
 * Sends a fresh confirmation link to an address that has a pending account.
 *
 * Needs no session — nobody can have one before confirming. And, like
 * forgot-password, it answers the same whatever the address is and replies
 * before doing anything, so it cannot be used to find out which addresses
 * have accounts or whether they are confirmed.
 */
const resendVerification = async (req, res) => {
  const email = String(req.body.email).trim().toLowerCase();
  const locale = localeOf(req);

  res.status(200).json({
    message: "If that address has an account waiting to be confirmed, a new link has been sent.",
  });

  try {
    const user = await User.findOne({ email });
    if (user === null || user.emailVerified) return;
    await sendVerification(user, locale);
  } catch (err) {
    req.log.error({ err }, "Verification email failed");
  }
};

/**
 * Marks an address verified, from the token in the emailed link.
 *
 * Needs no session: the link is often opened on another device — the phone
 * the email arrived on — and the token alone proves who it was sent to.
 *
 * Deliberately does **not** sign anybody in. The person logs in afterwards
 * with their password, so a verification link that somebody else sees is
 * worth nothing more than confirming an address — never a way into the
 * account.
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
 * Says whether a reset link still works, without using it up.
 *
 * Asked when the reset page opens, so an expired or already-used link is
 * reported straight away instead of after somebody has chosen a password.
 * `400 INVALID_TOKEN` exactly as the reset itself would answer.
 */
const checkResetToken = async (req, res) => {
  if (!(await isTokenUsable(req.body.token, "reset-password"))) {
    throw new AppError(400, "INVALID_TOKEN", "This link is invalid or has expired.");
  }
  return res.status(200).json({ message: "Link is valid", data: { valid: true } });
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

/**
 * Changes the password of the account that is signed in.
 *
 * The current password is asked for even though a session exists: a session
 * is a cookie on a device, and anyone at an unlocked computer has it. Knowing
 * the password is what proves it is the owner.
 *
 * A wrong current password is a **400**, not the 401 `verify-password` uses.
 * A 401 means "your session is over" everywhere else in this API, and a
 * client that read it that way would sign somebody out for a typo.
 *
 * Like a reset, a change ends every **other** session — the reason to change
 * a password is usually that somebody else might know it — and this device is
 * given a fresh session so it is not caught by that cut-off itself.
 */
const changePassword = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!(await user.matchPassword(req.body.currentPassword))) {
    throw new AppError(400, "INCORRECT_PASSWORD", "The current password is incorrect.", {
      errors: [{ path: "currentPassword", msg: "Incorrect password" }],
    });
  }

  user.password = req.body.newPassword;
  user.passwordChangedAt = new Date(Date.now() - 1000);
  await user.save();
  // A reset link asked for before the change would undo it.
  await revokeTokens(user._id, "reset-password");

  setAuthCookie(res, user._id);
  return res.status(200).json({ message: "Password changed", data: describeAccount(user) });
};

module.exports = {
  changePassword,
  checkResetToken,
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
