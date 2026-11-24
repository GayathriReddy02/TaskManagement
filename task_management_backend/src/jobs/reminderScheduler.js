const Task = require("../models/Task");
const { notify } = require("../services/notificationService");

let inProgress = false;
let timer = null;
const DAY_MS = 86400000;

async function checkReminders() {
  if (inProgress) return;
  inProgress = true;
  try {
    const now = new Date();
    const today = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const tomorrow = new Date(today.getTime() + DAY_MS);
    const dayAfterTomorrow = new Date(today.getTime() + 2 * DAY_MS);

    // Dates stored as UTC midnight. Detect due TOMORROW and all OVERDUE tasks.
    const tasks = await Task.find({
      status: { $ne: "Completed" },
      dueDate: { $lt: dayAfterTomorrow, $ne: null },
    })
      .select("title dueDate createdBy assignedTo")
      .lean();
    for (const task of tasks) {
      const isOverdue = task.dueDate < today;
      const dueTomorrow =
        task.dueDate >= tomorrow && task.dueDate < dayAfterTomorrow;
      if (!isOverdue && !dueTomorrow) continue;
      const type = isOverdue ? "overdue" : "dueSoon";
      const recipients = [
        ...new Set(
          [task.createdBy, task.assignedTo].filter(Boolean).map(String),
        ),
      ];
      const dueDay = task.dueDate.toISOString().slice(0, 10);
      // One notification per recipient, task, type and due date.
      // Repeated timer checks don't duplicate notifications.
      for (const userId of recipients) {
        await notify(
          userId,
          task._id,
          type,
          `${isOverdue ? "Overdue" : "Due tomorrow"}: ${task.title}`,
          `reminder:${type}:${task._id}:${dueDay}`,
        );
      }
    }
  } finally {
    inProgress = false;
  }
}

function startReminderScheduler() {
  const intervalMinutes = Number(process.env.REMINDER_INTERVAL_MINUTES || 60);
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1)
    throw new Error("REMINDER_INTERVAL_MINUTES must be >= 1");
  if (timer) return;
  // Perform first check after startup, then repeat.
  checkReminders().catch((err) => console.error("Reminder check failed:", err));
  timer = setInterval(
    () =>
      checkReminders().catch((err) =>
        console.error("Reminder check failed:", err),
      ),
    intervalMinutes * 60 * 1000,
  );
}
function stopReminderScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
module.exports = {
  checkReminders,
  startReminderScheduler,
  stopReminderScheduler,
};
