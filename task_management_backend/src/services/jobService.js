const { queue } = require("../queues/jobQueue");
const { NotFoundError } = require("../errors/AppError");
function visible(job, user) {
  return user.role === "admin" || job.ownerId === String(user._id);
}
function getJob(id, user) {
  const job = queue.get(id);
  if (!job || !visible(job, user)) throw new NotFoundError("Job not found");
  return job;
}
function publicJob(job, user) {
  const { payload, ...safe } = job;
  return {
    ...safe,
    errors: safe.errors.map((e) => ({
      ...e,
      message: user.role === "admin" ? e.message : "Job attempt failed",
    })),
    ...(safe.error
      ? { error: user.role === "admin" ? safe.error : "Job failed" }
      : {}),
  };
}
module.exports = {
  getJob,
  publicJob,
  listJobs: (user) =>
    queue
      .list()
      .filter((j) => visible(j, user))
      .map((j) => publicJob(j, user)),
};
