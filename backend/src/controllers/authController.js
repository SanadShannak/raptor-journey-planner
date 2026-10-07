const User = require("../models/User");
const { setAuthCookie, clearAuthCookie } = require("../services/cookies");
const mongoose = require("mongoose");
const registerUser = async (req, res) => {
  try {
    const { email, name, password } = req.body;

    const userExists = await User.exists({ email });

    if (userExists)
      return res.status(400).json({
        message: "A user with this email already exists.",
      });

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
  } catch (error) {
    return res.status(500).json({
      message: "Internal Server Error",
      error: error.message,
    });
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const targetUser = await User.findOne({ email });

    if (!targetUser) {
      return res
        .status(401)
        .json({ message: "No user with this email exists" });
    }

    const correctPassword = await targetUser.matchPassword(password);

    if (!correctPassword)
      return res.json({
        message: "Incorrect Password.",
      });

    setAuthCookie(res, targetUser._id);

    return res.status(200).json({
      message: "Login successful",
      data: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Internal server error",
      error: error.message,
    });
  }
};

const logoutUser = async (req, res) => {
  clearAuthCookie(res);

  return res.status(200).json({
    message: "Logged out successfully",
  });
};

const getUserProfile = async (req, res) => {
  const userId = req.user._id;
  const user = await User.findById(userId).select("-password");
  return res.status(200).json({ data: user });
};

module.exports = { registerUser, loginUser, logoutUser, getUserProfile };
