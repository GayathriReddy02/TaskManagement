const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const DUMMY_PASSWORD_HASH =
  "$2a$12$.f69dWbcY/d1t1s5RQCRbeMA7US6Bici76Ndh11h03T7DdPQej1Yy";

function makeToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: process.env.JWT_EXPIRES_IN || "1d",
  });
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  if (
    typeof name !== "string" ||
    !name.trim() ||
    name.length > 80 ||
    typeof email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 72
  ) {
    return res.status(400).json({
      message: "Valid name, email, and password (8–72 chars) required",
    });
  }
  const hash = await bcrypt.hash(password, 12);
  const normalizedEmail = email.trim().toLowerCase();
  try {
    if (!(await User.exists({ email: normalizedEmail }))) {
      // Public registration can NEVER choose admin role.
      await User.create({
        name: name.trim(),
        email: normalizedEmail,
        password: hash,
        role: "user",
      });
    }
  } catch (error) {
    if (error.code !== 11000) throw error;
  }
  res.status(202).json({
    message: "If the account can be created, you may now sign in.",
  });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "Email and password required" });
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
    "+password",
  );
  const passwordMatches = await bcrypt.compare(
    password,
    user?.password || DUMMY_PASSWORD_HASH,
  );
  if (!user || !user.isActive || !passwordMatches) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  res.json({ token: makeToken(user), user: publicUser(user) });
});

const me = (req, res) => res.json({ user: publicUser(req.user) });
const logout = (req, res) => res.status(204).end();
module.exports = { register, login, me, logout };
