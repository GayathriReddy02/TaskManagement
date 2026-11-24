const Notification = require("../models/Notification");
const asyncHandler = require("../utils/asyncHandler");
const { validId } = require("../services/taskService");
const list = asyncHandler(async (req, res) => {
  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  const unreadCount = await Notification.countDocuments({
    userId: req.user._id,
    isRead: false,
  });
  res.json({ notifications, unreadCount });
});
const markAllRead = asyncHandler(async (req, res) => {
  const result = await Notification.updateMany(
    { userId: req.user._id, isRead: false },
    { $set: { isRead: true } },
  );
  res.json({ updated: result.modifiedCount });
});
const markRead = asyncHandler(async (req, res) => {
  if (!validId(req.params.id))
    return res.status(400).json({ message: "Invalid notification ID" });
  const result = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { $set: { isRead: true } },
    { new: true },
  );
  if (!result)
    return res.status(404).json({ message: "Notification not found" });
  res.json({ notification: result });
});
module.exports = { list, markRead, markAllRead };
