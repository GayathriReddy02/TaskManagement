const { rateLimit } = require("express-rate-limit");

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      message: "Too many authentication attempts. Try again later.",
      success: false,
      code: "RATE_LIMITED",
      statusCode: 429,
    }),
});

module.exports = { authRateLimit };
