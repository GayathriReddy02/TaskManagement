const path = require("node:path");
const fs = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const Task = require("../models/Task");
const User = require("../models/User");
const { buildTaskMatch } = require("./taskService");
const { csvCell } = require("../utils/csvUtils");
const { AppError, ForbiddenError } = require("../errors/AppError");
const exportDir = path.resolve(
  process.env.EXPORT_DIR || path.join(__dirname, "../../exports"),
);
const EXPORT_RETENTION_MS = 24 * 60 * 60 * 1000;
const EXPORT_QUOTA_WINDOW_MS = 60 * 60 * 1000;
const EXPORT_QUOTA_LIMIT = 5;
const EXPORT_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const MAX_EXPORT_ROWS = 50_000;
const MAX_EXPORT_BYTES = 25 * 1024 * 1024;
const exportSubmissions = new Map();
let nextQuotaReservation = 0;
const exportFilenamePattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:csv|json)(?:\.tmp)?$/i;
let cleanupTimer;
const columns = [
  "_id",
  "title",
  "description",
  "status",
  "priority",
  "dueDate",
  "tags",
  "createdBy",
  "assignedTo",
  "createdAt",
  "updatedAt",
];

async function withExportQuota(userId, submit, now = Date.now()) {
  for (const [id, timestamps] of exportSubmissions) {
    const recent = timestamps.filter(
      (reservation) =>
        reservation.timestamp > now - EXPORT_QUOTA_WINDOW_MS,
    );
    if (recent.length) exportSubmissions.set(id, recent);
    else exportSubmissions.delete(id);
  }

  const key = String(userId);
  const recent = exportSubmissions.get(key) || [];
  if (recent.length >= EXPORT_QUOTA_LIMIT)
    throw new AppError(
      "Export limit reached. Try again later.",
      429,
      "EXPORT_RATE_LIMITED",
    );

  const reservation = { id: ++nextQuotaReservation, timestamp: now };
  exportSubmissions.set(key, [...recent, reservation]);
  try {
    return await submit();
  } catch (error) {
    const remaining = (exportSubmissions.get(key) || []).filter(
      (entry) => entry.id !== reservation.id,
    );
    if (remaining.length) exportSubmissions.set(key, remaining);
    else exportSubmissions.delete(key);
    throw error;
  }
}

async function cleanupExpiredFiles(now = Date.now()) {
  await fs.mkdir(exportDir, { recursive: true });
  const entries = await fs.readdir(exportDir, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !exportFilenamePattern.test(entry.name)) continue;
    const file = path.join(exportDir, entry.name);
    try {
      const stat = await fs.stat(file);
      if (now - stat.mtimeMs >= EXPORT_RETENTION_MS) {
        await fs.rm(file);
        removed++;
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return removed;
}

function startExportCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    cleanupExpiredFiles().catch((error) =>
      console.error("Export file cleanup failed:", error),
    );
  }, EXPORT_CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

function exportLimitError(message) {
  const error = new AppError(message, 413, "EXPORT_LIMIT_EXCEEDED");
  error.retryable = false;
  return error;
}

async function* encode(
  cursor,
  format,
  { maxRows = MAX_EXPORT_ROWS, maxBytes = MAX_EXPORT_BYTES } = {},
) {
  let rows = 0;
  let bytes = 0;
  const emit = (chunk) => {
    const chunkBytes = Buffer.byteLength(chunk);
    if (bytes + chunkBytes > maxBytes)
      throw exportLimitError("Report exceeds the 25 MiB export limit");
    bytes += chunkBytes;
    return chunk;
  };
  yield emit(format === "csv" ? columns.join(",") + "\r\n" : "[");
  let first = true;
  for await (const task of cursor) {
    rows++;
    if (rows > maxRows)
      throw exportLimitError("Report exceeds the 50,000-row export limit");
    if (format === "csv") {
      yield emit(columns.map((k) => csvCell(task[k])).join(",") + "\r\n");
    } else {
      yield emit((first ? "" : ",") + JSON.stringify(task));
      first = false;
    }
  }
  if (format === "json") yield emit("]\n");
}
async function generate({ userId, format, filters }, job) {
  // Reload the account at execution time: never trust a role supplied by the client.
  const user = await User.findById(userId);
  if (!user?.isActive) throw new ForbiddenError("Account inactive");
  const match = buildTaskMatch(user, filters);
  await fs.mkdir(exportDir, { recursive: true });
  const filename = `${job.id}.${format === "csv" ? "csv" : "json"}`;
  const target = path.join(exportDir, filename),
    temp = target + ".tmp";
  try {
    if (format === "summary") {
      const counts = await Task.aggregate([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]);
      const byStatus = Object.fromEntries(
        ["Pending", "In Progress", "Completed"].map((s) => [s, 0]),
      );
      for (const row of counts) byStatus[row._id] = row.count;
      const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
      const contents = JSON.stringify(
        { generatedAt: new Date().toISOString(), total, byStatus },
        null,
        2,
      );
      if (Buffer.byteLength(contents) > MAX_EXPORT_BYTES)
        throw exportLimitError("Report exceeds the 25 MiB export limit");
      await fs.writeFile(temp, contents);
    } else {
      const cursor = Task.find(match)
        .select(columns.join(" "))
        .sort({ _id: 1 })
        .limit(MAX_EXPORT_ROWS + 1)
        .lean()
        .cursor();
      try {
        await pipeline(
          Readable.from(encode(cursor, format)),
          createWriteStream(temp),
        );
      } finally {
        await cursor.close();
      }
    }
    const tempStat = await fs.stat(temp);
    if (tempStat.size > MAX_EXPORT_BYTES)
      throw exportLimitError("Report exceeds the 25 MiB export limit");
    await fs.rename(temp, target);
    const stat = await fs.stat(target);
    return { filename, size: stat.size, format };
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}
module.exports = {
  generate,
  exportDir,
  encode,
  withExportQuota,
  cleanupExpiredFiles,
  startExportCleanup,
  EXPORT_RETENTION_MS,
  MAX_EXPORT_ROWS,
  MAX_EXPORT_BYTES,
};
