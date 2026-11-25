const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");
const {
  UnauthorizedError,
  ValidationError,
} = require("../errors/AppError");

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

function validEmail(value) {
  return (
    typeof value === "string" &&
    value.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

const register = asyncHandler(async (req, res) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email =
    typeof req.body?.email === "string"
      ? req.body.email.trim().toLowerCase()
      : "";
  const password = req.body?.password;
  if (
    !name ||
    name.length > 80 ||
    !validEmail(email) ||
    typeof password !== "string" ||
    password.length < 8 ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new ValidationError(
      "Valid name, email, and password (8–72 UTF-8 bytes) are required",
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  try {
    if (!(await User.exists({ email }))) {
      await User.create({
        name,
        email,
        password: passwordHash,
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
  const { email, password } = req.body || {};
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    Buffer.byteLength(password, "utf8") > 72
  ) {
    throw new ValidationError("Email and password are required");
  }
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
    "+password",
  );
  const passwordMatches = await bcrypt.compare(
    password,
    user?.password || DUMMY_PASSWORD_HASH,
  );
  if (!user || !user.isActive || !passwordMatches) {
    throw new UnauthorizedError("Invalid credentials");
  }
  res.json({ token: makeToken(user), user: publicUser(user) });
});

const me = (req, res) => res.json({ user: publicUser(req.user) });
const logout = (_req, res) => res.status(204).end();

module.exports = { register, login, me, logout };
