const User = require("../models/User");
const AppError = require("../utils/AppError");
const { setAuthCookie, clearAuthCookie } = require("../services/cookies");

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

  return res.status(201).json({
    message: "User registered successfully",
    data: {
      id: newUser._id,
      name: newUser.name,
      email: newUser.email,
    },
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
    data: {
      id: targetUser._id,
      name: targetUser.name,
      email: targetUser.email,
    },
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

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  getUserProfile,
  verifyUserPassword,
};
