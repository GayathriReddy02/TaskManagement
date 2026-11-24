const User = require("../models/User");
const asyncHandler = require("../utils/asyncHandler");

// Limited directory for assignee selection; no passwords or email addresses.
const listUsers = asyncHandler(async (req, res) => {
  const users = await User.find({ isActive: true })
    .select("name")
    .sort({ name: 1 })
    .lean();
  res.json({ users });
});
module.exports = { listUsers };
