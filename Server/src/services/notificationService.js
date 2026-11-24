const Notification = require("../models/Notification");
const { emitter } = require("../events/taskEvents");

const { queue } = require("../queues/jobQueue");
class NotificationService {
  constructor(model = Notification) {
    this.model = model;
  }
  async notify(userId, taskId, type, message, dedupeKey) {
    if (!userId) return;
    try {
      await this.model.create({ userId, taskId, type, message, dedupeKey });
    } catch (err) {
      if (err.code !== 11000) throw err; // concurrent duplicate / already notified
    }
  }
  async handle(event, { task, actorId, eventId, details }) {
    if (event === "taskAssigned") {
      if (task.assignedTo && String(task.assignedTo) !== String(actorId)) {
        await this.notify(
          task.assignedTo,
          task._id,
          "assignment",
          `Task assigned: ${task.title}`,
          `assignment:${eventId}`,
        );
      }
    }
    if (event === "taskCompleted") {
      // Notify task creator when another user completed the task.
      if (String(task.createdBy) !== String(actorId)) {
        await this.notify(
          task.createdBy,
          task._id,
          "completion",
          `Task completed: ${task.title}`,
          `completion:${eventId}`,
        );
      }
    }
    if (event === "taskUpdated") {
      if (!details?.changedFields?.includes("priority")) return;
      const recipients = [task.createdBy, task.assignedTo].filter(Boolean);
      for (const id of new Set(recipients.map(String))) {
        if (id !== String(actorId)) {
          await this.notify(
            id,
            task._id,
            "priorityChanged",
            `Priority changed to ${task.priority}: ${task.title}`,
            `priority:${eventId}`,
          );
        }
      }
    }
  }
}
const notificationService = new NotificationService();
function registerNotificationListeners() {
  for (const event of ["taskAssigned", "taskCompleted", "taskUpdated"])
    emitter.on(event, (payload) =>
      queue.add("notification", { event, payload }, payload.actorId),
    );
}
module.exports = {
  notify: notificationService.notify.bind(notificationService),
  registerNotificationListeners,
  NotificationService,
  notificationService,
};
