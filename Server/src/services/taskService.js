const mongoose = require("mongoose");
const Task = require("../models/Task");
const User = require("../models/User");

const statuses = ["Pending", "In Progress", "Completed"];
const priorities = ["Low", "Medium", "High"];
const allowedFields = [
  "title",
  "description",
  "status",
  "priority",
  "dueDate",
  "tags",
];

const validId = (id) => typeof id === "string" && /^[0-9a-fA-F]{24}$/.test(id);
const isOwnerOrAdmin = (task, user) =>
  user.role === "admin" || String(task.createdBy) === String(user._id);
const canView = (task, user) =>
  isOwnerOrAdmin(task, user) || String(task.assignedTo) === String(user._id);

function validateTask(data, creating = false) {
  if (!data || typeof data !== "object" || Array.isArray(data))
    return "Provide a JSON object";
  if (Object.keys(data).some((k) => !allowedFields.includes(k)))
    return "Unknown or protected task field";
  if (
    (creating && !Object.prototype.hasOwnProperty.call(data, "title")) ||
    (data.title !== undefined &&
      (typeof data.title !== "string" ||
        !data.title.trim() ||
        data.title.length > 150))
  )
    return "Valid title required (max 150)";
  if (
    data.description !== undefined &&
    (typeof data.description !== "string" || data.description.length > 2000)
  )
    return "Invalid description";
  if (data.status !== undefined && !statuses.includes(data.status))
    return "Invalid status";
  if (data.priority !== undefined && !priorities.includes(data.priority))
    return "Invalid priority";
  if (
    data.dueDate !== undefined &&
    data.dueDate !== null &&
    (typeof data.dueDate !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate) ||
      Number.isNaN(Date.parse(data.dueDate)) ||
      new Date(data.dueDate).toISOString().slice(0, 10) !== data.dueDate)
  )
    return "dueDate must be YYYY-MM-DD";
  if (
    data.tags !== undefined &&
    (!Array.isArray(data.tags) ||
      data.tags.length > 20 ||
      data.tags.some(
        (t) => typeof t !== "string" || !t.trim() || t.length > 40,
      ))
  )
    return "tags must be up to 20 nonempty strings (max 40 characters each)";
  return null;
}

function normalizeTask(data) {
  const out = { ...data };
  if (out.title !== undefined) out.title = out.title.trim();
  if (out.tags !== undefined)
    out.tags = [...new Set(out.tags.map((t) => t.trim()))];
  return out;
}

const oneQueryString = (value) =>
  value === undefined || (typeof value === "string" && value.length <= 150);
function validateListParams(params) {
  const allowed = [
    "status",
    "priority",
    "search",
    "tags",
    "fromDate",
    "toDate",
    "sortBy",
    "order",
    "page",
    "limit",
  ];
  if (
    Object.keys(params).some((k) => !allowed.includes(k)) ||
    Object.values(params).some((v) => !oneQueryString(v))
  )
    return "Invalid query parameters";
  if (params.status && !statuses.includes(params.status))
    return "Invalid status";
  if (params.priority && !priorities.includes(params.priority))
    return "Invalid priority";
  if (
    params.sortBy &&
    !["dueDate", "priority", "createdAt"].includes(params.sortBy)
  )
    return "Invalid sortBy";
  if (params.order && !["asc", "desc"].includes(params.order))
    return "Invalid order";
  const page = params.page === undefined ? 1 : Number(params.page);
  const limit = params.limit === undefined ? 10 : Number(params.limit);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100 ||
    !/^\d+$/.test(String(params.page ?? "1")) ||
    !/^\d+$/.test(String(params.limit ?? "10"))
  )
    return "page must be >= 1; limit 1–100";
  for (const key of ["fromDate", "toDate"]) {
    if (
      params[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(params[key]) ||
        Number.isNaN(Date.parse(params[key])) ||
        new Date(params[key]).toISOString().slice(0, 10) !== params[key])
    )
      return `${key} must be YYYY-MM-DD`;
  }
  if (params.fromDate && params.toDate && params.fromDate > params.toDate)
    return "fromDate must be <= toDate";
  if (params.tags && params.tags.split(",").length > 20) return "Too many tags";
  return null;
}

function buildTaskMatch(user, params = {}) {
  const match = {};
  const conditions = [];
  if (user.role !== "admin") {
    const uid = new mongoose.Types.ObjectId(String(user._id));
    conditions.push({ $or: [{ createdBy: uid }, { assignedTo: uid }] });
  }
  if (params.status) conditions.push({ status: params.status });
  if (params.priority) conditions.push({ priority: params.priority });
  if (params.search) {
    const safe = params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    conditions.push({
      $or: [
        { title: { $regex: safe, $options: "i" } },
        { description: { $regex: safe, $options: "i" } },
      ],
    });
  }
  if (params.tags) {
    const tags = params.tags
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (tags.length) conditions.push({ tags: { $in: tags } });
  }
  const date = {};
  if (params.fromDate) date.$gte = new Date(`${params.fromDate}T00:00:00.000Z`);
  if (params.toDate) {
    const end = new Date(`${params.toDate}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    date.$lt = end;
  }
  if (Object.keys(date).length) conditions.push({ dueDate: date });
  if (conditions.length) match.$and = conditions;

  return match;
}

async function listTasks(user, params) {
  const match = buildTaskMatch(user, params);
  const page = Number(params.page || 1);
  const limit = Number(params.limit || 10);
  const sortBy = params.sortBy || "createdAt";
  const direction = params.order === "asc" ? 1 : -1;
  const pipeline = [{ $match: match }];
  if (sortBy === "priority")
    pipeline.push({
      $addFields: {
        priorityRank: {
          $switch: {
            branches: [
              { case: { $eq: ["$priority", "High"] }, then: 3 },
              { case: { $eq: ["$priority", "Medium"] }, then: 2 },
              { case: { $eq: ["$priority", "Low"] }, then: 1 },
            ],
            default: 0,
          },
        },
      },
    });
  pipeline.push({
    $sort: {
      [sortBy === "priority" ? "priorityRank" : sortBy]: direction,
      _id: 1,
    },
  });
  pipeline.push({
    $facet: {
      tasks: [
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: { priorityRank: 0, notificationVersion: 0 } },
      ],
      metadata: [{ $count: "total" }],
    },
  });
  const [result] = await Task.aggregate(pipeline);
  const total = result.metadata[0]?.total || 0;
  return {
    tasks: result.tasks,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

async function assignTask(task, userId, beforeChange = () => {}) {
  if (userId !== null && !validId(userId))
    return { error: "Invalid user ID", code: 400 };
  let assignee = null;
  if (userId !== null) {
    assignee = await User.findById(userId);
    if (!assignee || !assignee.isActive)
      return { error: "Active user not found", code: 404 };
  }
  const nextAssigneeId = assignee?._id ?? null;
  if (String(task.assignedTo || "") !== String(nextAssigneeId || ""))
    beforeChange();
  task.assignedTo = nextAssigneeId;
  await task.save();
  return { task };
}
class TaskService {
  constructor(model = Task) {
    this.model = model;
  }
  create(data) {
    return this.model.create(data);
  }
  findById(id) {
    return this.model.findById(id);
  }
  list(user, params) {
    return listTasks(user, params);
  }
  assign(task, userId, beforeChange) {
    return assignTask(task, userId, beforeChange);
  }
  save(task) {
    return task.save();
  }
  updateIfUnchanged(id, updatedAt, changes) {
    return this.model.findOneAndUpdate(
      { _id: id, updatedAt },
      { $set: changes },
      {
        new: true,
        runValidators: true,
      },
    );
  }
  remove(task) {
    return task.deleteOne();
  }
}
const taskService = new TaskService();
module.exports = {
  TaskService,
  taskService,
  buildTaskMatch,
  Task,
  validId,
  canView,
  isOwnerOrAdmin,
  validateTask,
  normalizeTask,
  validateListParams,
  listTasks,
  assignTask,
};
