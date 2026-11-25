const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

let exportDir;
let exportService;
let previousExportDir;
before(async () => {
  previousExportDir = process.env.EXPORT_DIR;
  exportDir = await fs.mkdtemp(path.join(os.tmpdir(), "taskora-exports-"));
  process.env.EXPORT_DIR = exportDir;
  exportService = require("../src/services/exportService");
});
after(async () => {
  if (previousExportDir === undefined) delete process.env.EXPORT_DIR;
  else process.env.EXPORT_DIR = previousExportDir;
  await fs.rm(exportDir, { recursive: true, force: true });
});

test("export quota limits each user to five accepted reports per rolling hour", async () => {
  const { withExportQuota } = exportService;
  for (let i = 0; i < 5; i++)
    assert.equal(await withExportQuota("user-a", () => i, 1_000_000 + i), i);
  await assert.rejects(
    withExportQuota("user-a", () => "not queued", 1_000_010),
    { statusCode: 429, code: "EXPORT_RATE_LIMITED" },
  );
  assert.equal(
    await withExportQuota("user-b", () => "queued", 1_000_010),
    "queued",
  );
  assert.equal(
    await withExportQuota("user-a", () => "queued", 4_600_000),
    "queued",
  );
  await assert.rejects(
    withExportQuota("user-c", () => Promise.reject(new Error("queue full")), 1_000_000),
    /queue full/,
  );
  assert.equal(
    await withExportQuota("user-c", () => "accepted", 1_000_000),
    "accepted",
  );
});

test("export cleanup removes only expired generated files", async () => {
  const oldExport = "01234567-89ab-cdef-0123-456789abcdef.csv";
  const newExport = "11234567-89ab-cdef-0123-456789abcdef.json";
  const unrelated = "keep.txt";
  const now = Date.now();
  for (const filename of [oldExport, newExport, unrelated])
    await fs.writeFile(path.join(exportDir, filename), "test");
  const oldTime = new Date(now - exportService.EXPORT_RETENTION_MS - 1000);
  await fs.utimes(path.join(exportDir, oldExport), oldTime, oldTime);

  assert.equal(await exportService.cleanupExpiredFiles(now), 1);
  await assert.rejects(fs.access(path.join(exportDir, oldExport)), {
    code: "ENOENT",
  });
  await fs.access(path.join(exportDir, newExport));
  await fs.access(path.join(exportDir, unrelated));
});

test("export encoder enforces row and byte ceilings", async () => {
  const {
    encode,
    MAX_EXPORT_ROWS,
    MAX_EXPORT_BYTES,
  } = exportService;
  assert.equal(MAX_EXPORT_ROWS, 50_000);
  assert.equal(MAX_EXPORT_BYTES, 25 * 1024 * 1024);
  const rows = [{ _id: "first" }, { _id: "second" }];
  const consume = async (iterable) => {
    for await (const chunk of iterable) void chunk;
  };

  await assert.rejects(consume(encode(rows, "json", { maxRows: 1 })), {
    statusCode: 413,
    code: "EXPORT_LIMIT_EXCEEDED",
  });
  await assert.rejects(consume(encode(rows, "json", { maxBytes: 1 })), {
    statusCode: 413,
    code: "EXPORT_LIMIT_EXCEEDED",
  });
});

test("password registration stores a bcrypt hash and returns a neutral response", async (t) => {
  const bcrypt = require("bcryptjs");
  const User = require("../src/models/User");
  const { register } = require("../src/controllers/authController");
  let created;
  t.mock.method(User, "exists", async () => false);
  t.mock.method(User, "create", async (value) => {
    created = value;
    return value;
  });
  t.mock.method(bcrypt, "hash", async () => "bcrypt-hash");
  let status;
  let responseBody;
  await register(
    {
      body: {
        name: "Alex Morgan",
        email: "alex@example.com",
        password: "Password123",
      },
    },
    {
      status(code) { status = code; return this; },
      json(body) { responseBody = body; return this; },
    },
    (error) => { throw error; },
  );

  assert.equal(status, 202);
  assert.equal(created.password, "bcrypt-hash");
  assert.equal(created.role, "user");
  assert.equal("token" in responseBody, false);
});

test("password login returns a bearer token without exposing the stored hash", async (t) => {
  process.env.JWT_SECRET ||= "test-secret-that-is-long-enough-for-auth-tests";
  const bcrypt = require("bcryptjs");
  const User = require("../src/models/User");
  const { login } = require("../src/controllers/authController");
  const user = {
    id: "0123456789abcdef01234567",
    name: "Alex Morgan",
    email: "alex@example.com",
    role: "user",
    isActive: true,
    password: "stored-bcrypt-hash",
  };
  t.mock.method(User, "findOne", () => ({
    select: async (fields) => {
      assert.equal(fields, "+password");
      return user;
    },
  }));
  t.mock.method(bcrypt, "compare", async (password, hash) => {
    assert.equal(password, "Password123");
    assert.equal(hash, user.password);
    return true;
  });
  let responseBody;
  await login(
    { body: { email: user.email, password: "Password123" } },
    { json(body) { responseBody = body; return this; } },
    (error) => { throw error; },
  );

  assert.equal(typeof responseBody.token, "string");
  assert.equal(responseBody.user.email, user.email);
  assert.equal("password" in responseBody.user, false);
});

test("auth endpoints rate limit after ten requests and CORS only reflects configured origin", async () => {
  process.env.JWT_SECRET ||= "test-secret-that-is-long-enough-for-auth-tests";
  const app = require("../src/app");
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const allowed = await fetch(base + "/", {
      headers: { Origin: "http://localhost:4200" },
    });
    assert.equal(
      allowed.headers.get("access-control-allow-origin"),
      "http://localhost:4200",
    );
    assert.equal(allowed.headers.get("access-control-allow-credentials"), "true");
    const rejected = await fetch(base + "/", {
      headers: { Origin: "https://not-allowed.example" },
    });
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
    assert.equal(allowed.headers.get("x-content-type-options"), "nosniff");

    let response;
    for (let i = 0; i < 11; i++) {
      response = await fetch(base + "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
    }
    assert.equal(response.status, 429);
    assert.equal((await response.json()).code, "RATE_LIMITED");
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("PUT completion enqueues both outbox jobs", async (t) => {
  const { updateTask } = require("../src/controllers/taskController");
  const { taskService } = require("../src/services/taskService");
  const { queue } = require("../src/queues/jobQueue");
  const id = "0123456789abcdef01234567";
  const task = {
    _id: id,
    title: "Complete this task",
    createdBy: "user",
    assignedTo: null,
    status: "Pending",
    priority: "Medium",
    updatedAt: new Date("2026-11-24T00:00:00.000Z"),
    toObject() {
      return { ...this };
    },
  };
  let enqueued;
  t.mock.method(queue, "enqueueMany", async (jobs, options) => {
    enqueued = { jobs, options };
    return [];
  });
  t.mock.method(taskService, "findById", async () => task);
  t.mock.method(taskService, "updateIfUnchanged", async (_id, _date, changes) =>
    Object.assign(task, changes),
  );

  await updateTask(
    {
      params: { id },
      body: { status: "Completed" },
      user: { _id: "user", role: "user" },
      get: () => '"2026-11-24T00:00:00.000Z"',
    },
    { json() {} },
    (error) => {
      throw error;
    },
  );

  assert.deepEqual(enqueued.jobs.map(job => job.type), ["activity", "notification"]);
  assert.equal(enqueued.jobs[0].payload.event, "taskCompleted");
  assert.equal(enqueued.jobs[0].payload.payload.task, undefined);
  assert.equal(enqueued.options, undefined);
});

test("deleting a task removes its notifications but keeps activity", async (t) => {
  const { deleteTask } = require("../src/controllers/taskController");
  const { taskService } = require("../src/services/taskService");
  const Notification = require("../src/models/Notification");
  const id = "0123456789abcdef01234567";
  const task = { _id: id, createdBy: "owner", assignedTo: "assignee" };
  t.mock.method(taskService, "findById", async () => task);
  const removeTask = t.mock.method(taskService, "remove", async () => {});
  const removeNotifications = t.mock.method(Notification, "deleteMany", async (filter, options) => {
    assert.deepEqual(filter, { taskId: id });
    assert.equal(options, undefined);
    return { deletedCount: 2 };
  });
  let response;
  await deleteTask(
    { params: { id }, user: { _id: "owner", role: "user" } },
    { json: (body) => (response = body) },
    (error) => { throw error; },
  );

  assert.equal(response.message, "Task deleted");
  assert.equal(removeTask.mock.callCount(), 1);
  assert.equal(removeNotifications.mock.callCount(), 1);
});

test("assignedTo null clears a task assignee", async (t) => {
  const User = require("../src/models/User");
  const { assignTask } = require("../src/services/taskService");
  const task = {
    assignedTo: "assigned-user",
    async save() {},
  };
  let beforeChangeCalled = false;
  t.mock.method(User, "findById", () => {
    throw new Error("Unassigning should not look up a user");
  });

  const result = await assignTask(task, null, () => {
    beforeChangeCalled = true;
  });

  assert.equal(result.task, task);
  assert.equal(task.assignedTo, null);
  assert.equal(beforeChangeCalled, true);
});
