const Notification = require("../models/Notification");
const Task = require("../models/Task");
class NotificationService {
  constructor(model = Notification, taskModel = Task) {
    this.model = model;
    this.taskModel = taskModel;
  }
  async notify(userId, taskId, type, message, dedupeKey) {
    if (!userId) return;
    if (taskId && !(await this.taskModel.exists({ _id: taskId }))) return;
    try {
      await this.model.updateOne(
        { userId, dedupeKey },
        { $setOnInsert: { userId, taskId, type, message, dedupeKey } },
        { upsert: true },
      );
    } catch (error) {
      if (error.code === 11000) return;
      throw error;
    }
  }
  async handle(event, { taskId, title, priority, creatorId, assigneeId, actorId, eventId, details }) {
    if (event === "taskAssigned") {
      if (assigneeId && String(assigneeId) !== String(actorId)) {
        await this.notify(
          assigneeId,
          taskId,
          "assignment",
          `Task assigned: ${title}`,
          `assignment:${eventId}`,
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
