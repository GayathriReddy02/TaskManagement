const { queue, serialize } = require("../queues/jobQueue");
const { NotFoundError, ValidationError } = require("../errors/AppError");

function visibleQuery(user) {
  const visibility = { type: { $in: ["report", "export"] } };
  if (user.role !== "admin") visibility.ownerId = String(user._id);
  return visibility;
}

async function getJob(id, user) {
  const job = await queue.get(id);
  if (!job || !["report", "export"].includes(job.type) ||
    (user.role !== "admin" && job.ownerId !== String(user._id)))
    throw new NotFoundError("Job not found");
  return job;
}

function publicJob(job, user) {
  const safe = serialize(job);
  delete safe.payload;
  safe.errors = (safe.errors || []).map(error => ({
    ...error,
    message: user.role === "admin" ? error.message : "Job attempt failed",
  }));
  if (safe.error) safe.error = user.role === "admin" ? safe.error : "Job failed";
  return safe;
}

function numberParam(value, fallback, max) {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max)
    throw new ValidationError("Invalid page or limit");
  return Number(value);
}

async function listJobs(user, query = {}) {
  const page = numberParam(query.page, 1, 1000000);
  const limit = numberParam(query.limit, 10, 100);
  await queue.cleanup();
  const visible = visibleQuery(user);
  const [jobs, total, activeCount] = await Promise.all([
    queue.model.find(visible).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    queue.model.countDocuments(visible),
    queue.model.countDocuments({ ...visible, status: { $nin: ["completed", "failed"] } }),
  ]);
  return { jobs: jobs.map(job => publicJob(job, user)), page, limit, total, activeCount };
}

module.exports = { getJob, publicJob, listJobs };
