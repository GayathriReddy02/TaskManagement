const { randomUUID } = require("node:crypto");
const { EventEmitter } = require("node:events");
class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.pending = [];
  }
  add(type, payload, ownerId) {
    const job = {
      id: randomUUID(),
      type,
      payload,
      ownerId: String(ownerId),
      status: "pending",
      attempts: 0,
      maxRetries: 3,
      errors: [],
      createdAt: new Date().toISOString(),
      result: null,
    };
    this.jobs.set(job.id, job);
    this.pending.push(job);
    this.emit("ready");
    return job;
  }
  take() {
    return this.pending.shift();
  }
  get(id) {
    return this.jobs.get(id);
  }
  list() {
    return [...this.jobs.values()];
  }
}
module.exports = { JobQueue, queue: new JobQueue() };
