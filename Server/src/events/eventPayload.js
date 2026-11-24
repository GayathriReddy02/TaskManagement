// Preserve event-time facts, not the mutable task document or user objects.
function compactEvent({ task, actorId, eventId, details = {} }) {
  const id = value => value == null ? null : String(value._id ?? value);
  const metadata = {};
  for (const key of ['previousPriority', 'previousStatus']) if (details[key] !== undefined) metadata[key] = details[key];
  if ('previousAssignee' in details) metadata.previousAssignee = id(details.previousAssignee);
  if (Array.isArray(details.changedFields)) metadata.changedFields = [...details.changedFields];
  return { taskId: id(task._id), actorId: id(actorId), eventId, title: task.title, priority: task.priority, creatorId: id(task.createdBy), assigneeId: id(task.assignedTo), details: metadata };
}
module.exports = { compactEvent };
