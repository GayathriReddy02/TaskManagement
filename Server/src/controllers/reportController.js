const path = require("node:path");
const fs = require("node:fs/promises");
const asyncHandler = require("../utils/asyncHandler");
const { queue } = require("../queues/jobQueue");
const { validateListParams } = require("../services/taskService");
const { getJob, publicJob } = require("../services/jobService");
const { exportDir } = require("../services/exportService");
const {
  ValidationError,
  NotFoundError,
  AppError,
} = require("../errors/AppError");
const requestExport = (format) =>
  asyncHandler(async (req, res) => {
    const filters = req.body || {};
    if (
      typeof filters !== "object" ||
      Array.isArray(filters) ||
      Object.keys(filters).some(
        (k) =>
          ![
            "status",
            "priority",
            "search",
            "tags",
            "fromDate",
            "toDate",
          ].includes(k),
      )
    )
      throw new ValidationError("Invalid export filters");
    const error = validateListParams(filters);
    if (error) throw new ValidationError(error);
    const job = queue.add(
      "report",
      { userId: String(req.user._id), format, filters },
      req.user._id,
    );
    res.status(202).json({ job: publicJob(job, req.user) });
  });
const download = asyncHandler(async (req, res, next) => {
  const job = getJob(req.params.id, req.user);
  if (job.type !== "report") throw new NotFoundError("Report not found");
  if (job.status !== "completed")
    throw new AppError("Report is not ready", 409, "REPORT_NOT_READY");
  // Report artifacts are owned by the requester; other admins may inspect job status only.
  if (job.ownerId !== String(req.user._id))
    throw new NotFoundError("Report not found");
  const file = path.join(exportDir, job.result.filename);
  try {
    await fs.access(file);
  } catch (e) {
    if (e.code === "ENOENT") throw new NotFoundError("Report file not found");
    throw e;
  }
  res.download(file, job.result.filename, (error) => {
    if (error) next(error);
  });
});
module.exports = { requestExport, download };
