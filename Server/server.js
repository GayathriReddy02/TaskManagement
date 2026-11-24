require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");

const { startReminderScheduler } = require("./src/jobs/reminderScheduler");
const { queue } = require("./src/queues/jobQueue");
const { QueueWorker } = require("./src/workers/queueWorker");
const handlers = require("./src/workers/jobHandlers");
const {
  cleanupExpiredFiles,
  startExportCleanup,
} = require("./src/services/exportService");
const worker = new QueueWorker(queue, handlers);
const port = process.env.PORT || 5000;

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be at least 32 characters");
  }
  await connectDB();
  await Promise.all([
    require("./src/models/Activity").init(),
    require("./src/models/Notification").init(),
  ]);
  await queue.initialize();
  await cleanupExpiredFiles();
  await queue.cleanup();
  queue.startCleanup();
  startExportCleanup();
  worker.start();
  startReminderScheduler();
  app.listen(port, () =>
    console.log(`API running at http://localhost:${port}`),
  );
}

start().catch((err) => {
  console.error("Startup failed:", err.message);
  process.exit(1);
});
