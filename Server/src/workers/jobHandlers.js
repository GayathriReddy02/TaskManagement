const { record } = require('../services/activityService');
const { notificationService } = require('../services/notificationService');
const { generate } = require('../services/exportService');
const Task = require('../models/Task');
const User = require('../models/User');
// Activity uses event-time facts even if task or actor has since disappeared.
// Notifications are only useful for a surviving task and active recipients.
function createHandlers({ taskModel = Task, userModel = User, activity = record, notifications = notificationService, report = generate } = {}) {
  return {
    activity: ({ event, payload }) => activity(event, payload),
    notification: async ({ event, payload }) => {
      if (!await taskModel.exists({ _id: payload.taskId })) return;
      const ids = [...new Set([payload.creatorId, payload.assigneeId].filter(Boolean))];
      const users = await userModel.find({ _id: { $in: ids }, isActive: true })
        .select('_id').lean();
      const active = new Set(users.map(u => String(u._id)));
      return notifications.handle(event, {
        ...payload,
        creatorId: active.has(payload.creatorId) ? payload.creatorId : null,
        assigneeId: active.has(payload.assigneeId) ? payload.assigneeId : null,
      });
    },
    report,
  };
}
module.exports = { ...createHandlers(), createHandlers };
