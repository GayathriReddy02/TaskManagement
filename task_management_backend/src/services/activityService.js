const Activity = require("../models/Activity");
const { emitter } = require("../events/taskEvents");
const { queue } = require("../queues/jobQueue");
const EVENTS = ["taskCreated", "taskUpdated", "taskAssigned", "taskCompleted"];

async function record(event, payload) {
  const { task, actorId, eventId, details = {} } = payload;
  const viewers = [
    ...new Set([
      String(actorId),
      String(task.createdBy),
      ...(task.assignedTo ? [String(task.assignedTo)] : []),
      ...(details.previousAssignee ? [String(details.previousAssignee)] : []),
    ]),
  ];
  const document = {
    taskId: task._id,
    actorId,
    event,
    details,
    message: `${event}: ${task.title}`,
    visibleTo: viewers,
  };
  if (!eventId) return Activity.create(document);
  try {
    await Activity.updateOne(
      { eventId },
      { $setOnInsert: { ...document, eventId } },
      { upsert: true },
    );
  } catch (e) {
    if (e.code !== 11000) throw e;
  }
}
function registerActivityListeners() {
  for (const event of EVENTS) {
    emitter.on(event, (payload) =>
      queue.add("activity", { event, payload }, payload.actorId),
    );
  }
}
module.exports = { registerActivityListeners, record };
