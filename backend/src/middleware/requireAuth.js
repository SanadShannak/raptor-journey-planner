const { verifyToken } = require("../services/jwt");
const User = require("../models/User");

const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies.jwt;

    if (!token)
      return res
        .status(401)
        .json({ message: "Not authorized. Please log in." });

    const decoded = verifyToken(token);

    req.user = await User.findById(decoded.id);

    if (!req.user)
      return res.status(401).json({ message: "User no longer exists" });

    next();
  } catch (error) {
    res.status(401).json({ message: "Not authorized", error: error.message });
  }
};

module.exports = requireAuth;
