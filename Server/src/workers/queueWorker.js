const { QueueError } = require("../errors/AppError");

class QueueWorker {
  constructor(queue, handlers, { concurrency = 2, delay = 1000, retries = 3 } = {}) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new TypeError("Invalid concurrency");
    Object.assign(this, { queue, handlers, concurrency, delay, retries });
    this.active = new Set();
    this.running = false;
    this.scheduled = false;
    this.schedule = this.schedule.bind(this);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.queue.on("ready", this.schedule);
    this.schedule();
  }

  schedule() {
    if (!this.running || this.scheduled) return;
    this.scheduled = true;
    if (this.timer) clearTimeout(this.timer);
    setImmediate(() => {
      this.scheduled = false;
      this.drain().catch(error => {
        console.error("Queue worker polling failed:", error);
        this.scheduleAfterDelay();
      });
    });
  }

  scheduleAfterDelay() {
    if (!this.running || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.schedule();
    }, this.delay);
    this.timer.unref();
  }

  async drain() {
    while (this.running && this.active.size < this.concurrency) {
      const job = await this.queue.claim();
      if (!job) break;
      if (!this.running) break;
      const running = this.processJob(job)
        .catch(error => console.error("Queue job processing failed:", error))
        .finally(() => {
          this.active.delete(running);
          this.schedule();
        });
      this.active.add(running);
    }
    this.scheduleAfterDelay();
  }

  async processJob(job) {
    const handler = this.handlers[job.type];
    if (typeof handler !== "function") {
      await this.queue.retry(job, new QueueError("Unknown job type"), 0, this.retries, false);
      return;
    }
    const heartbeat = setInterval(() => {
      this.queue.renew(job).catch(error => console.error("Job lease renewal failed:", error));
    }, Math.max(10, Math.floor(this.queue.leaseMs / 3)));
    heartbeat.unref();
    try {
      const result = await handler(job.payload, job);
      await this.queue.finish(job, {
        status: "completed",
        result: result === undefined ? null : result,
        finishedAt: new Date(this.queue.now()),
        nextRetryAt: null,
      });
    } catch (error) {
      const retryable = error?.retryable !== false &&
        !["ValidationError", "CastError", "ForbiddenError", "NotFoundError"].includes(error?.name);
      const retryDelay = this.delay * (2 ** Math.max(0, job.attempts - 1));
      await this.queue.retry(job, error, retryDelay, this.retries, retryable);
    } finally {
      clearInterval(heartbeat);
    }
  }

  async stop() {
    this.running = false;
    this.queue.off("ready", this.schedule);
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    await Promise.allSettled([...this.active]);
  }
}

module.exports = { QueueWorker };
