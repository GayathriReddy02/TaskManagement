const { test } = require("node:test");
const assert = require("node:assert/strict");
const { JobQueue } = require("../src/queues/jobQueue");
const { QueueWorker } = require("../src/workers/queueWorker");
const { compactEvent } = require("../src/events/eventPayload");
const { setTimeout: sleep } = require("node:timers/promises");
const mongoTestUri = process.env.MONGO_TEST_URI;

function fakePersistence() {
  const rows = new Map();
  const matches = (job, filter) => {
    if (filter.type?.$in && !filter.type.$in.includes(job.type)) return false;
    if (filter.status?.$in && !filter.status.$in.includes(job.status)) return false;
    if (filter.status && typeof filter.status === "string" && filter.status !== job.status) return false;
    if (filter.finishedAt?.$ne === null && !job.finishedAt) return false;
    return true;
  };
  const model = {
    countDocuments: filter => ({
      then: (resolve, reject) => Promise.resolve([...rows.values()].filter(job => matches(job, filter)).length).then(resolve, reject),
    }),
    insertMany: async records => {
      for (const record of records) rows.set(record._id, { ...record });
      return records.map(record => rows.get(record._id));
    },
    find: filter => {
      let found = [...rows.values()].filter(job => matches(job, filter));
      const query = {
        sort() { found.sort((a, b) => a.finishedAt - b.finishedAt); return query; },
        limit(count) { found = found.slice(0, count); return query; },
        select() { return query; },
        lean: async () => found.map(job => ({ ...job })),
      };
      return query;
    },
    deleteMany: async filter => {
      let deletedCount = 0;
      for (const [id, job] of rows) {
        let remove = filter._id?.$in?.includes(id) || false;
        if (filter.$or) remove = filter.$or.some(condition =>
          job.status === condition.status && job.finishedAt &&
          job.finishedAt <= condition.finishedAt.$lte);
        if (remove) { rows.delete(id); deletedCount++; }
      }
      return { deletedCount };
    },
    findOneAndUpdate: async (_filter, update) => {
      const now = update.$set.processingAt;
      const job = [...rows.values()].sort((a, b) => a.createdAt - b.createdAt).find(value =>
        (value.status === "pending" && (!value.nextRetryAt || value.nextRetryAt <= now)) ||
        (value.status === "processing" && value.leaseUntil && value.leaseUntil <= now));
      if (!job) return null;
      Object.assign(job, update.$set);
      job.attempts += update.$inc.attempts;
      return { ...job };
    },
    updateOne: async (filter, update) => {
      const job = rows.get(filter._id);
      if (!job || job.status !== filter.status || job.leaseId !== filter.leaseId)
        return { modifiedCount: 0 };
      Object.assign(job, update.$set);
      for (const key of Object.keys(update.$unset || {})) delete job[key];
      return { modifiedCount: 1 };
    },
    findById: async id => rows.has(id) ? { ...rows.get(id) } : null,
    createCollection: async () => {},
    createIndexes: async () => {},
  };
  return { model, rows };
}

function makeQueue(options = {}) {
  const persistence = fakePersistence();
  return { persistence, queue: new JobQueue({ ...persistence, ...options }) };
}

async function until(fn) {
  for (let i = 0; i < 300; i++) {
    if (await fn()) return;
    await sleep(5);
  }
  throw new Error("Timed out");
}

test("durable queue expires terminal jobs using finish time", async () => {
  let now = 1000;
  const { queue } = makeQueue({ now: () => now, completedMs: 100, failedMs: 200 });
  const job = await queue.add("report", {}, "u");
  const claimed = await queue.claim();
  await queue.finish(claimed, { status: "completed", finishedAt: new Date(now), result: { filename: "report.json" } });
  now += 101;
  await queue.cleanup();
  assert.equal(await queue.get(job.id), null);
});

test("capacity includes active jobs and reclaims finished internal jobs first", async () => {
  const { queue } = makeQueue({ capacity: 2 });
  const report = await queue.add("report", {}, "u");
  const internal = await queue.add("activity", {}, "u");
  const reportClaim = await queue.claim();
  await queue.finish(reportClaim, { status: "completed", finishedAt: new Date() });
  const internalClaim = await queue.claim();
  await queue.finish(internalClaim, { status: "completed", finishedAt: new Date() });
  await queue.add("notification", {}, "u");
  assert.ok(await queue.get(report.id));
  assert.equal(await queue.get(internal.id), null);
  const active = await queue.add("report", {}, "u");
  await assert.rejects(queue.add("report", {}, "u"), { statusCode: 503 });
  assert.ok(await queue.get(active.id));
});

test("concurrent enqueue requests stay within capacity in one process", async () => {
  const { queue, persistence } = makeQueue({ capacity: 1 });
  const results = await Promise.allSettled([
    queue.add("report", {}, "u"),
    queue.add("report", {}, "u"),
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  assert.equal(results.filter(result => result.status === "rejected").length, 1);
  assert.equal(persistence.rows.size, 1);
});

test("claims are exclusive and expired processing leases can be recovered", async () => {
  let now = 1000;
  const { queue } = makeQueue({ now: () => now, leaseMs: 50 });
  const job = await queue.add("report", {}, "u");
  const [first, competing] = await Promise.all([queue.claim(), queue.claim()]);
  assert.ok(first);
  assert.equal(competing, null);
  now += 51;
  const recovered = await queue.claim();
  assert.equal(recovered.id, job.id);
  assert.equal(recovered.attempts, 2);
  assert.notEqual(recovered.leaseId, first.leaseId);
});

test("worker persists attempts, retries, results, and clears terminal payloads", async () => {
  const { queue } = makeQueue();
  let executions = 0;
  const job = await queue.add("report", { private: true }, "u");
  const worker = new QueueWorker(queue, {
    report: async () => { if (++executions === 1) throw new Error("temporary"); return { file: "done" }; },
  }, { delay: 1 });
  worker.start();
  try {
    await until(async () => (await queue.get(job.id))?.status === "completed");
  } finally {
    await worker.stop();
  }
  const done = await queue.get(job.id);
  assert.equal(done.attempts, 2);
  assert.equal(done.errors.length, 1);
  assert.deepEqual(done.result, { file: "done" });
  assert.equal(done.payload, undefined);
});

test("event payload contains event-time facts without the task document", () => {
  const payload = compactEvent({
    task: { _id: "task", title: "Original", priority: "High", createdBy: "creator", assignedTo: "assignee", description: "private" },
    actorId: "actor",
    eventId: "event",
    details: { changedFields: ["priority"], previousAssignee: "old", unexpected: "private" },
  });
  assert.deepEqual(payload, {
    taskId: "task", actorId: "actor", eventId: "event", title: "Original",
    priority: "High", creatorId: "creator", assigneeId: "assignee",
    details: { previousAssignee: "old", changedFields: ["priority"] },
  });
});

test("create, status, and assignment mutations enqueue matching outbox jobs", async t => {
  const { queue } = require("../src/queues/jobQueue");
  const { taskService } = require("../src/services/taskService");
  const { createTask, updateStatus, assign } = require("../src/controllers/taskController");
  const enqueued = [];
  t.mock.method(queue, "enqueueMany", async (jobs, options) => {
    enqueued.push({ jobs, options });
    return [];
  });
  const created = {
    _id: "created", title: "New task", priority: "Medium",
    createdBy: "owner", assignedTo: null,
  };
  t.mock.method(taskService, "create", async () => created);
  let response;
  await createTask(
    { body: { title: "New task" }, user: { _id: "owner" } },
    { status: () => ({ json: value => { response = value; } }) },
    error => { if (error) throw error; },
  );
  assert.equal(response.task, created);
  assert.deepEqual(enqueued[0].jobs.map(job => job.type), ["activity"]);
  assert.equal(enqueued[0].options, undefined);

  const task = {
    _id: "0123456789abcdef01234567", title: "Existing", priority: "High",
    createdBy: "owner", assignedTo: "old", status: "Pending",
  };
  t.mock.method(taskService, "findById", async () => task);
  t.mock.method(taskService, "save", async () => task);
  await updateStatus(
    { params: { id: task._id }, body: { status: "Completed" }, user: { _id: "owner" } },
    { json() {} },
    error => { if (error) throw error; },
  );
  assert.deepEqual(enqueued[1].jobs.map(job => job.type), ["activity", "notification"]);
  assert.equal(enqueued[1].jobs[0].payload.event, "taskCompleted");
  assert.equal(enqueued[1].options, undefined);

  t.mock.method(taskService, "assign", async current => {
    current.assignedTo = "new";
    return { task: current };
  });
  await assign(
    { params: { id: task._id }, body: { assignedTo: "new" }, user: { _id: "owner", role: "user" } },
    { json() {} },
    error => { if (error) throw error; },
  );
  assert.deepEqual(enqueued[2].jobs.map(job => job.type), ["activity", "notification"]);
  assert.equal(enqueued[2].jobs[0].payload.event, "taskAssigned");
  assert.equal(enqueued[2].options, undefined);
});

test("standalone MongoDB stores task outbox jobs and recovers them after restart", {
  skip: !mongoTestUri,
}, async () => {
  const mongoose = require("mongoose");
  const Task = require("../src/models/Task");
  const Job = require("../src/models/Job");
  const url = new URL(mongoTestUri);
  const database = url.pathname.slice(1);
  assert.equal(url.protocol, "mongodb:");
  assert.ok(["localhost", "127.0.0.1", "::1"].includes(url.hostname.replace(/^\[|\]$/g, "")));
  assert.equal(url.host.includes(","), false);
  assert.match(database, /^task_management_it_[a-f0-9]{12}$/i);
  assert.equal(url.searchParams.has("replicaSet"), false);

  await mongoose.connect(mongoTestUri);
  try {
    const queue = new JobQueue({
      model: Job,
      capacity: 10,
      completedMs: 60_000,
      failedMs: 60_000,
      cleanupMs: 60_000,
      leaseMs: 100,
    });
    await queue.initialize();
    const ownerId = new mongoose.Types.ObjectId();
    const taskId = new mongoose.Types.ObjectId();
    let now = Date.now();
    await Task.create({ _id: taskId, title: "Integration task", createdBy: ownerId });
    const persistedQueue = new JobQueue({
      model: Job,
      capacity: 10,
      completedMs: 60_000,
      failedMs: 60_000,
      cleanupMs: 60_000,
      leaseMs: 100,
      now: () => now,
    });

    const [activityJob] = await queue.enqueueMany([{
      type: "activity",
      ownerId,
      payload: { event: "taskCreated", payload: { taskId: String(taskId) } },
    }]);
    assert.equal(await Task.countDocuments({ _id: taskId }), 1);
    assert.equal(await Job.countDocuments({ _id: activityJob._id }), 1);

    const firstClaim = await persistedQueue.claim();
    assert.equal(firstClaim.id, activityJob._id);
    now += 101;
    const recoveredClaim = await new JobQueue({
      model: Job,
      leaseMs: 100,
      now: () => now,
    }).claim();
    assert.equal(recoveredClaim.id, activityJob._id);
    assert.equal(recoveredClaim.attempts, 2);
  } finally {
    try {
      await mongoose.connection.dropDatabase();
    } finally {
      await mongoose.disconnect();
    }
  }
});
