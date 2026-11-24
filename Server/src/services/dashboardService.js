const mongoose = require("mongoose");
const Task = require("../models/Task");
const Activity = require("../models/Activity");
const Notification = require("../models/Notification");

async function dashboard(user) {
  const uid = new mongoose.Types.ObjectId(String(user._id));
  const match =
    user.role === "admin"
      ? {}
      : { $or: [{ createdBy: uid }, { assignedTo: uid }] };
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const activityFilter = user.role === "admin" ? {} : { visibleTo: uid };
  const [
    total,
    completed,
    pending,
    overdue,
    priorities,
    tagCounts,
    recentActivity,
    unreadNotifications,
  ] = await Promise.all([
    Task.countDocuments(match),
    Task.countDocuments({ ...match, status: "Completed" }),
    Task.countDocuments({ ...match, status: "Pending" }),
    Task.countDocuments({
      ...match,
      status: { $ne: "Completed" },
      dueDate: { $lt: today },
    }),
    Task.aggregate([
      { $match: match },
      { $group: { _id: "$priority", count: { $sum: 1 } } },
    ]),
    Task.aggregate([
      { $match: match },
      {
        $project: {
          tags: { $setUnion: [{ $ifNull: ["$tags", []] }, []] },
        },
      },
      { $unwind: "$tags" },
      { $group: { _id: "$tags", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 10 },
    ]),
    Activity.find(activityFilter).sort({ createdAt: -1 }).limit(5).lean(),
    Notification.countDocuments({ userId: uid, isRead: false }),
  ]);
  return {
    total,
    completed,
    pending,
    inProgress: total - completed - pending,
    overdue,
    byPriority: {
      Low: priorities.find((p) => p._id === "Low")?.count || 0,
      Medium: priorities.find((p) => p._id === "Medium")?.count || 0,
      High: priorities.find((p) => p._id === "High")?.count || 0,
    },
    byTag: tagCounts.map(({ _id: tag, count }) => ({ tag, count })),
    recentActivity,
    unreadNotifications,
  };
}
module.exports = { dashboard };
