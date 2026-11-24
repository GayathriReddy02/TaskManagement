const {UnauthorizedError, ForbiddenError} = require("../errors/AppError");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

const protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new UnauthorizedError("Login required");

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.isActive) throw new UnauthorizedError("User not active");
  req.user = user;
  next();
});

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) throw new ForbiddenError("Forbidden");
  next();
};
module.exports = { protect, requireRole };
