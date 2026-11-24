const Activity = require("../models/Activity");
const asyncHandler = require("../utils/asyncHandler");
const getActivities = asyncHandler(async (req, res) => {
  const query = req.user.role === "admin" ? {} : { visibleTo: req.user._id };
  const activities = await Activity.find(query)
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  res.json({ activities });
});
module.exports = { getActivities };
