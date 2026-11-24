const Activity = require("../models/Activity");

async function record(event, payload) {
  const { taskId, title, creatorId, assigneeId, actorId, eventId, details = {} } = payload;
  const messages = {
    taskCreated: `Created task: ${title}`,
    taskUpdated: `Updated task: ${title}`,
    taskAssigned: `Changed task assignment: ${title}`,
    taskCompleted: `Completed task: ${title}`,
  };
  const viewers = [
    ...new Set([
      String(actorId),
      creatorId,
      ...(assigneeId ? [String(assigneeId)] : []),
      ...(details.previousAssignee ? [String(details.previousAssignee)] : []),
    ]),
  ];
  const document = {
    taskId: taskId,
    actorId,
    event,
    details,
    message: messages[event] || `Changed task: ${title}`,
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
module.exports = { record };
