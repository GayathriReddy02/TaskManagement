const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  AppError,
} = require("../errors/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { randomUUID } = require("node:crypto");
const { queue } = require("../queues/jobQueue");
const { compactEvent } = require("../events/eventPayload");
const Notification = require("../models/Notification");
const User = require("../models/User");
const {
  taskService,
  validId,
  canView,
  isOwnerOrAdmin,
  validateTask,
  normalizeTask,
  validateListParams,
} = require("../services/taskService");

function eventJobs(event, task, actorId, details = {}) {
  const payload = compactEvent({ task, actorId, eventId: randomUUID(), details });
  const jobs = [{ type: "activity", payload: { event, payload }, ownerId: actorId }];
  if (event !== "taskCreated")
    jobs.push({ type: "notification", payload: { event, payload }, ownerId: actorId });
  return jobs;
}

function comparisonValue(key, value) {
  if (key !== "dueDate" || value == null) return value;
  return new Date(value).toISOString().slice(0, 10);
}

async function addTaskPeople(tasks) {
  const taskList = Array.isArray(tasks) ? tasks : [tasks];
  const ids = [
    ...new Set(
      taskList
        .flatMap(task => [task.createdBy, task.assignedTo])
        .filter(Boolean)
        .map(String),
    ),
  ];
  const users = await User.find({ _id: { $in: ids } }).select("name").lean();
  const names = new Map(users.map(user => [String(user._id), user.name]));
  return taskList.map(task => {
    const value = typeof task.toObject === "function" ? task.toObject() : task;
    return {
      ...value,
      createdByName: names.get(String(value.createdBy)) || null,
      assignedToName: value.assignedTo
        ? names.get(String(value.assignedTo)) || null
        : null,
    };
  });
}

const createTask = asyncHandler(async (req, res) => {
  const error = validateTask(req.body, true);
  if (error) throw new ValidationError(error);
  const task = await taskService.create({
    ...normalizeTask(req.body),
    createdBy: req.user._id,
  });
  await queue.enqueueMany(eventJobs("taskCreated", task, req.user._id));
  res.status(201).json({ task });
});

const getTasks = asyncHandler(async (req, res) => {
  const error = validateListParams(req.query);
  if (error) throw new ValidationError(error);
  const page = await taskService.list(req.user, req.query);
  page.tasks = await addTaskPeople(page.tasks);
  res.json(page);
});

const getTask = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw new ValidationError("Invalid task ID");
  const task = await taskService.findById(req.params.id);
  if (!task || !canView(task, req.user))
    throw new NotFoundError("Task not found");
  res.json({ task: (await addTaskPeople(task))[0] });
});

const getAssignees = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw new ValidationError("Invalid task ID");
  const task = await taskService.findById(req.params.id);
  if (!task || !canView(task, req.user))
    throw new NotFoundError("Task not found");
  if (!isOwnerOrAdmin(task, req.user))
    throw new ForbiddenError("Only owner or admin can view assignees");
  const users = await User.find({ isActive: true })
    .select("name email")
    .sort({ name: 1 })
    .lean();
  res.json({ users });
});

const updateTask = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw new ValidationError("Invalid task ID");
  const error = validateTask(req.body);
  if (error) throw new ValidationError(error);
  const task = await taskService.findById(req.params.id);
  if (!task || !canView(task, req.user))
    throw new NotFoundError("Task not found");
  if (!isOwnerOrAdmin(task, req.user))
    throw new ForbiddenError("Only owner or admin can edit task details");
  const currentETag = `"${task.updatedAt.toISOString()}"`;
  if (req.get("if-match") !== currentETag)
    throw new AppError(
      "Task changed since it was loaded. Reload it before saving.",
      409,
      "STALE_TASK",
    );
  const previousPriority = task.priority;
  const previousStatus = task.status;
  const changes = normalizeTask(req.body);
  const changedFields = Object.keys(req.body).filter(
    key => JSON.stringify(comparisonValue(key, task[key])) !==
      JSON.stringify(comparisonValue(key, changes[key])),
  );
  if (!changedFields.length) return res.json({ task });
  const updatedTask = await taskService.updateIfUnchanged(
    task._id,
    task.updatedAt,
    changes,
  );
  if (!updatedTask)
    throw new AppError(
      "Task changed since it was loaded. Reload it before saving.",
      409,
      "STALE_TASK",
    );
  const completesTask = previousStatus !== updatedTask.status && updatedTask.status === "Completed";
  const event = completesTask ? "taskCompleted" : "taskUpdated";
  const payload = compactEvent({
    task: updatedTask, actorId: req.user._id, eventId: randomUUID(),
    details: { changedFields, previousPriority, ...(completesTask ? { previousStatus } : {}) },
  });
  const jobs = [{ type: "activity", payload: { event, payload }, ownerId: req.user._id }];
  if (event !== "taskCreated") jobs.push({ type: "notification", payload: { event, payload }, ownerId: req.user._id });
  await queue.enqueueMany(jobs);
  res.json({ task: updatedTask });
});

const updateStatus = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw new ValidationError("Invalid task ID");
  if (!req.body || Object.keys(req.body).length !== 1 ||
    !["Pending", "In Progress", "Completed"].includes(req.body.status))
    throw new ValidationError("Provide valid status only");
  const task = await taskService.findById(req.params.id);
  if (!task || !canView(task, req.user))
    throw new NotFoundError("Task not found");
  const previousStatus = task.status;
  task.status = req.body.status;
  await taskService.save(task);
  if (previousStatus !== task.status) {
    const event = task.status === "Completed" ? "taskCompleted" : "taskUpdated";
    const payload = compactEvent({
      task, actorId: req.user._id, eventId: randomUUID(),
      details: { changedFields: ["status"], previousStatus },
    });
    await queue.enqueueMany([
      { type: "activity", payload: { event, payload }, ownerId: req.user._id },
      { type: "notification", payload: { event, payload }, ownerId: req.user._id },
    ]);
  }
  res.json({ task });
});

const deleteTask = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw new ValidationError("Invalid task ID");
  const task = await taskService.findById(req.params.id);
  if (!task || !canView(task, req.user))
    throw new NotFoundError("Task not found");
  if (!isOwnerOrAdmin(task, req.user))
    throw new ForbiddenError("Only owner or admin can delete task");
  await taskService.remove(task);
  await Notification.deleteMany({ taskId: task._id });
  res.json({ message: "Task deleted" });
});

const assign = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw new ValidationError("Invalid task ID");
  if (!req.body || Object.keys(req.body).length !== 1 ||
    !Object.prototype.hasOwnProperty.call(req.body, "assignedTo"))
    throw new ValidationError("Provide assignedTo only");
  const task = await taskService.findById(req.params.id);
  if (!task || !canView(task, req.user))
    throw new NotFoundError("Task not found");
  if (!isOwnerOrAdmin(task, req.user))
    throw new ForbiddenError("Only owner or admin can assign task");
  const previousAssignee = task.assignedTo;
  const result = await taskService.assign(task, req.body.assignedTo, () => {});
  if (result.error)
    throw new AppError(result.error, result.code, result.code === 404 ? "NOT_FOUND" : "VALIDATION_ERROR");
  if (String(previousAssignee || "") !== String(result.task.assignedTo || "")) {
    const event = "taskAssigned";
    const payload = compactEvent({ task: result.task, actorId: req.user._id, eventId: randomUUID(), details: { previousAssignee } });
    await queue.enqueueMany([
      { type: "activity", payload: { event, payload }, ownerId: req.user._id },
      { type: "notification", payload: { event, payload }, ownerId: req.user._id },
    ]);
  }
  res.json({ task: result.task });
});

module.exports = {
  createTask,
  getTasks,
  getTask,
  getAssignees,
  updateTask,
  updateStatus,
  deleteTask,
  assign,
};
