const Notification = require("../models/Notification");
const Task = require("../models/Task");
class NotificationService {
  constructor(model = Notification, taskModel = Task) {
    this.model = model;
    this.taskModel = taskModel;
  }
  async notify(userId, taskId, type, message, dedupeKey, session) {
    if (!userId) return;
    const create = async (activeSession) => {
      if (taskId) {
        const result = await this.taskModel.updateOne(
          { _id: taskId },
          { $inc: { notificationVersion: 1 } },
          { session: activeSession, timestamps: false },
        );
        if (!result.matchedCount) return;
      }
      const existing = await this.model
        .findOne({ userId, dedupeKey })
        .session(activeSession)
        .select("_id")
        .lean();
      if (existing) return;
      await this.model.create(
        [{ userId, taskId, type, message, dedupeKey }],
        { session: activeSession },
      );
    };
    if (session) return create(session);
    return this.model.db.transaction(create);
  }
  async handle(event, { taskId, title, priority, creatorId, assigneeId, actorId, eventId, details }, session) {
    if (event === "taskAssigned") {
      if (assigneeId && String(assigneeId) !== String(actorId)) {
        await this.notify(
          assigneeId,
          taskId,
          "assignment",
          `Task assigned: ${title}`,
          `assignment:${eventId}`,
          session,
        );
      }
    }
    if (event === "taskCompleted") {
      // Notify task creator when another user completed the task.
      if (creatorId && String(creatorId) !== String(actorId)) {
        await this.notify(
          creatorId,
          taskId,
          "completion",
          `Task completed: ${title}`,
          `completion:${eventId}`,
          session,
        );
      }
    }
    if (event === "taskUpdated") {
      if (!details?.changedFields?.includes("priority")) return;
      const recipients = [creatorId, assigneeId].filter(Boolean);
      for (const id of new Set(recipients.map(String))) {
        if (id !== String(actorId)) {
          await this.notify(
            id,
            taskId,
            "priorityChanged",
            `Priority changed to ${priority}: ${title}`,
            `priority:${eventId}`,
            session,
          );
        }
      }
    }
  }
}
const notificationService = new NotificationService();
module.exports = {
  notify: notificationService.notify.bind(notificationService),
  NotificationService,
  notificationService,
};
