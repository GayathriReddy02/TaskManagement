const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  AppError,
} = require("../errors/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { publish } = require("../events/taskEvents");
const {
  taskService,
  validId,
  canView,
  isOwnerOrAdmin,
  validateTask,
  normalizeTask,
  validateListParams,
} = require("../services/taskService");

const createTask = asyncHandler(async (req, res) => {
  const error = validateTask(req.body, true);
  if (error) throw new ValidationError(error);
  const task = await taskService.create({
    ...normalizeTask(req.body),
    createdBy: req.user._id,
  });
  publish("taskCreated", { task: task.toObject(), actorId: req.user._id });
  res.status(201).json({ task });
});

const getTasks = asyncHandler(async (req, res) => {
  const error = validateListParams(req.query);
  if (error) throw new ValidationError(error);
  res.json(await taskService.list(req.user, req.query));
});

const getTask = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw new ValidationError("Invalid task ID");
  const task = await taskService.findById(req.params.id);
  if (!task || !canView(task, req.user))
    throw new NotFoundError("Task not found");
  res.json({ task });
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
  const previousPriority = task.priority;
  const changedFields = Object.keys(req.body).filter(
    (k) => JSON.stringify(task[k]) !== JSON.stringify(req.body[k]),
  );
  Object.assign(task, normalizeTask(req.body));
  await taskService.save(task);
  if (changedFields.length) {
    publish("taskUpdated", {
      task: task.toObject(),
      actorId: req.user._id,
      details: { changedFields, previousPriority },
    });
    if (changedFields.includes("status") && task.status === "Completed") {
      publish("taskCompleted", {
        task: task.toObject(),
        actorId: req.user._id,
      });
    }
  }
  res.json({ task });
});

const updateStatus = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw new ValidationError("Invalid task ID");
  if (
    !req.body ||
    Object.keys(req.body).length !== 1 ||
    !["Pending", "In Progress", "Completed"].includes(req.body.status)
  ) {
    throw new ValidationError("Provide valid status only");
  }
  const task = await taskService.findById(req.params.id);
  if (!task || !canView(task, req.user))
    throw new NotFoundError("Task not found");
  const previousStatus = task.status;
  task.status = req.body.status;
  await taskService.save(task);
  if (previousStatus !== task.status) {
    publish(task.status === "Completed" ? "taskCompleted" : "taskUpdated", {
      task: task.toObject(),
      actorId: req.user._id,
      details: { changedFields: ["status"], previousStatus },
    });
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
  res.json({ message: "Task deleted" });
});

const assign = asyncHandler(async (req, res) => {
  if (!validId(req.params.id)) throw new ValidationError("Invalid task ID");
  if (!req.body || Object.keys(req.body).length !== 1)
    throw new ValidationError("Provide assignedTo only");
  const task = await taskService.findById(req.params.id);
  if (!task || !canView(task, req.user))
    throw new NotFoundError("Task not found");
  if (!isOwnerOrAdmin(task, req.user))
    throw new ForbiddenError("Only owner or admin can assign task");
  const previousAssignee = task.assignedTo;
  const result = await taskService.assign(task, req.body.assignedTo);
  if (result.error)
    throw new AppError(
      result.error,
      result.code,
      result.code === 404 ? "NOT_FOUND" : "VALIDATION_ERROR",
    );
  if (String(previousAssignee || "") !== String(result.task.assignedTo || "")) {
    publish("taskAssigned", {
      task: result.task.toObject(),
      actorId: req.user._id,
      details: { previousAssignee },
    });
  }
  res.json({ task: result.task });
});
module.exports = {
  createTask,
  getTasks,
  getTask,
  updateTask,
  updateStatus,
  deleteTask,
  assign,
};
