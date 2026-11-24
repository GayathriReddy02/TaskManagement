const { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events");
const Job = require("../models/Job");
const QueueState = require("../models/QueueState");
const { QueueError } = require("../errors/AppError");

function positiveInteger(value, name, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max)
    throw new Error(`Invalid ${name}`);
  return value;
}
function setting(name, fallback) {
  return positiveInteger(Number(process.env[name] ?? fallback), name);
}
function serialize(job) {
  if (!job) return job;
  const value = typeof job.toObject === "function" ? job.toObject() : { ...job };
  value.id = String(value._id ?? value.id);
  delete value._id;
  for (const key of ["createdAt", "nextRetryAt", "processingAt", "leaseUntil", "finishedAt"])
    if (value[key] instanceof Date) value[key] = value[key].toISOString();
  return value;
}

class JobQueue extends EventEmitter {
  constructor({
    capacity = setting("JOB_CAPACITY", 10000),
    completedMs = setting("JOB_COMPLETED_RETENTION_MS", 86400000),
    failedMs = setting("JOB_FAILED_RETENTION_MS", 604800000),
    cleanupMs = setting("JOB_CLEANUP_INTERVAL_MS", 60000),
    leaseMs = setting("JOB_PROCESSING_LEASE_MS", 300000),
    now = Date.now,
    model = Job,
    stateModel = QueueState,
  } = {}) {
    super();
    positiveInteger(capacity, "JOB_CAPACITY");
    positiveInteger(completedMs, "JOB_COMPLETED_RETENTION_MS");
    positiveInteger(failedMs, "JOB_FAILED_RETENTION_MS");
    positiveInteger(cleanupMs, "JOB_CLEANUP_INTERVAL_MS", 2147483647);
    positiveInteger(leaseMs, "JOB_PROCESSING_LEASE_MS", 2147483647);
    Object.assign(this, { capacity, completedMs, failedMs, cleanupMs, leaseMs, now, model, stateModel });
  }

  async initialize() {
    await this.stateModel.updateOne(
      { _id: "capacity" },
      { $setOnInsert: { generation: 0 } },
      { upsert: true },
    );
    await this.model.createCollection().catch(error => {
      if (error.codeName !== "NamespaceExists") throw error;
    });
    await this.model.createIndexes();
  }

  async cleanup(session) {
    const now = new Date(this.now());
    const completedCutoff = new Date(now.getTime() - this.completedMs);
    const failedCutoff = new Date(now.getTime() - this.failedMs);
    const options = session ? { session } : {};
    const result = await this.model.deleteMany(
      { $or: [
        { status: "completed", finishedAt: { $lte: completedCutoff } },
        { status: "failed", finishedAt: { $lte: failedCutoff } },
      ] },
      options,
    );
    return result.deletedCount || 0;
  }

  async reserveCapacity(count, session) {
    positiveInteger(count, "reservation size");
    // The singleton write serializes capacity checks in concurrent transactions.
    await this.stateModel.updateOne(
      { _id: "capacity" },
      { $inc: { generation: 1 } },
      { upsert: true, session },
    );
    await this.cleanup(session);
    let total = await this.model.countDocuments({}).session(session);
    const needed = total + count - this.capacity;
    if (needed > 0) {
      const internal = await this.model.find({
        type: { $in: ["activity", "notification"] },
        status: { $in: ["completed", "failed"] },
        finishedAt: { $ne: null },
      }).sort({ finishedAt: 1 }).limit(needed).select("_id").session(session).lean();
      if (internal.length) {
        await this.model.deleteMany({ _id: { $in: internal.map(job => job._id) } }, { session });
        total -= internal.length;
      }
    }
    if (total + count > this.capacity) {
      const reclaim = await this.model.find({
        type: { $in: ["report", "export"] },
        status: { $in: ["completed", "failed"] },
        finishedAt: { $ne: null },
      }).sort({ finishedAt: 1 }).limit(total + count - this.capacity).select("_id").session(session).lean();
      if (reclaim.length) {
        await this.model.deleteMany({ _id: { $in: reclaim.map(job => job._id) } }, { session });
        total -= reclaim.length;
      }
    }
    if (total + count > this.capacity)
      throw new QueueError("Job queue capacity reached; try again later");
  }

  async enqueueMany(inputs, { session } = {}) {
    if (!Array.isArray(inputs) || inputs.length === 0) return [];
    const insert = async activeSession => {
      await this.reserveCapacity(inputs.length, activeSession);
      const createdAt = new Date(this.now());
      const records = inputs.map(({ type, payload, ownerId }) => ({
        _id: randomUUID(),
        type,
        payload,
        ownerId: String(ownerId),
        status: "pending",
        attempts: 0,
        maxRetries: 3,
        errors: [],
        createdAt,
        result: null,
      }));
      const jobs = await this.model.insertMany(records, { session: activeSession });
      return jobs;
    };
    const jobs = session
      ? await insert(session)
      : await this.model.db.transaction(insert);
    if (!session) this.emit("ready");
    return jobs;
  }

  async add(type, payload, ownerId) {
    const [job] = await this.enqueueMany([{ type, payload, ownerId }]);
    return serialize(job);
  }

  async claim() {
    const now = new Date(this.now());
    const leaseId = randomUUID();
    const job = await this.model.findOneAndUpdate(
      {
        $or: [
          { status: "pending", $or: [{ nextRetryAt: null }, { nextRetryAt: { $lte: now } }] },
          { status: "processing", leaseUntil: { $lte: now } },
        ],
      },
      {
        $set: { status: "processing", processingAt: now, leaseUntil: new Date(now.getTime() + this.leaseMs), leaseId, nextRetryAt: null },
        $inc: { attempts: 1 },
      },
      { sort: { createdAt: 1 }, new: true },
    );
    return serialize(job);
  }

  async renew(job) {
    return this.model.updateOne(
      { _id: job.id, status: "processing", leaseId: job.leaseId },
      { $set: { leaseUntil: new Date(this.now() + this.leaseMs) } },
    );
  }

  async finish(job, fields) {
    return this.model.updateOne(
      { _id: job.id, status: "processing", leaseId: job.leaseId },
      { $set: fields, $unset: { processingAt: 1, leaseUntil: 1, leaseId: 1, payload: 1 } },
    );
  }

  async retry(job, error, delay, maxRetries, retryable = true) {
    const errors = [...(job.errors || []), {
      attempt: job.attempts,
      message: String(error?.message || error),
      at: new Date(this.now()).toISOString(),
    }];
    const terminal = !retryable || job.attempts > maxRetries;
    const fields = terminal
      ? { status: "failed", errors, error: String(error?.message || error), finishedAt: new Date(this.now()) }
      : { status: "pending", errors, nextRetryAt: new Date(this.now() + delay) };
    const result = await this.model.updateOne(
      { _id: job.id, status: "processing", leaseId: job.leaseId },
      { $set: fields, $unset: { processingAt: 1, leaseUntil: 1, leaseId: 1, ...(terminal ? { payload: 1 } : {}) } },
    );
    if (!terminal && result.modifiedCount) this.emit("ready");
    return result;
  }

  async get(id) {
    await this.cleanup();
    return serialize(await this.model.findById(id));
  }
  async list() {
    await this.cleanup();
    return (await this.model.find({}).sort({ createdAt: -1 }).lean()).map(serialize);
  }

  startCleanup() {
    if (!this.timer) {
      this.timer = setInterval(() => this.cleanup().catch(error => console.error("Job cleanup failed:", error)), this.cleanupMs);
      this.timer.unref();
    }
  }
  stopCleanup() { clearInterval(this.timer); this.timer = undefined; }
}

module.exports = { JobQueue, queue: new JobQueue(), serialize };
