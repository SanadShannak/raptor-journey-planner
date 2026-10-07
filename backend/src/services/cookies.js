const { generateToken } = require("./jwt");

const setAuthCookie = (res, userId) => {
  const token = generateToken({ id: userId });
  res.cookie("jwt", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
};

const clearAuthCookie = (res) => {
  res.cookie("jwt", "", {
    httpOnly: true,
    expires: new Date(0),
  });
};

module.exports = { setAuthCookie, clearAuthCookie };
