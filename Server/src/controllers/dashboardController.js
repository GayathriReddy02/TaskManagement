const asyncHandler = require("../utils/asyncHandler");
const { dashboard } = require("../services/dashboardService");
const getDashboard = asyncHandler(async (req, res) =>
  res.json(await dashboard(req.user)),
);
module.exports = { getDashboard };
