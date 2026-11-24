const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

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
  if (await User.exists({ email: email.trim().toLowerCase() })) {
    return res.status(409).json({ message: "Email already registered" });
  }
  const hash = await bcrypt.hash(password, 12);
  // Public registration can NEVER choose admin role.
  const user = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: hash,
    role: "user",
  });
  res.status(201).json({ user: publicUser(user), token: makeToken(user) });
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (typeof email !== "string" || typeof password !== "string") {
    return res.status(400).json({ message: "Email and password required" });
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
    "+password",
  );
  if (
    !user ||
    !user.isActive ||
    !(await bcrypt.compare(password, user.password))
  ) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  res.json({ user: publicUser(user), token: makeToken(user) });
});

const me = (req, res) => res.json({ user: publicUser(req.user) });
module.exports = { register, login, me };
