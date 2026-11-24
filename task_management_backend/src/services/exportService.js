const path = require("node:path");
const fs = require("node:fs/promises");
const { createWriteStream } = require("node:fs");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const Task = require("../models/Task");
const User = require("../models/User");
const { buildTaskMatch } = require("./taskService");
const { csvCell } = require("../utils/csvUtils");
const { ForbiddenError } = require("../errors/AppError");
const exportDir = path.resolve(
  process.env.EXPORT_DIR || path.join(__dirname, "../../exports"),
);
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
async function* encode(cursor, format) {
  if (format === "csv") yield columns.join(",") + "\r\n";
  else yield "[";
  let first = true;
  for await (const task of cursor) {
    if (format === "csv")
      yield columns.map((k) => csvCell(task[k])).join(",") + "\r\n";
    else {
      yield (first ? "" : ",") + JSON.stringify(task);
      first = false;
    }
  }
  if (format === "json") yield "]\n";
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
      await fs.writeFile(
        temp,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            total: Object.values(byStatus).reduce((a, b) => a + b, 0),
            byStatus,
          },
          null,
          2,
        ),
      );
    } else {
      const cursor = Task.find(match)
        .select(columns.join(" "))
        .sort({ _id: 1 })
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
    await fs.rename(temp, target);
    const stat = await fs.stat(target);
    return { filename, size: stat.size, format };
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}
module.exports = { generate, exportDir, encode };
