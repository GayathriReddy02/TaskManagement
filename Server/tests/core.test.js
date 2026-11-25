const {test}=require('node:test');
const assert=require('node:assert/strict');
const {retry}=require('../src/utils/retry');
const {csvCell}=require('../src/utils/csvUtils');
const {ValidationError,QueueError}=require('../src/errors/AppError');
const {setTimeout:sleep}=require('node:timers/promises');
test('retry uses exponential delays and preserves result',async()=>{const delays=[];const result=await retry(n=>{if(n<4)throw Error('temporary');return 42;},3,10,{wait:async ms=>delays.push(ms)});assert.equal(result,42);assert.deepEqual(delays,[10,20,40]);});
test('permanent failure stops at four total attempts',async()=>{let attempts=0;await assert.rejects(retry(()=>{attempts++;throw Error('failed');},3,0),/failed/);assert.equal(attempts,4);});
test('nonretryable failure is not repeated',async()=>{let attempts=0;await assert.rejects(retry(()=>{attempts++;throw new QueueError('invalid');},3,0),/invalid/);assert.equal(attempts,1);});
test('CSV quoting and spreadsheet formula protection',()=>{assert.equal(csvCell('a,"b"'),'"a,""b"""');assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell(null),'""');});
test('custom errors retain status and code',()=>{const e=new ValidationError('bad input');assert.equal(e.statusCode,400);assert.equal(e.code,'VALIDATION_ERROR');});
test('report matching treats missing filters as all visible tasks', () => {
  const mongoose = require('mongoose');
  const { buildTaskMatch } = require('../src/services/taskService');
  const userId = '0123456789abcdef01234567';
  const objectId = new mongoose.Types.ObjectId(userId);
  const match = buildTaskMatch({ _id: userId, role: 'user' });

  assert.deepEqual(match, {
    $and: [{
      $or: [
        { createdBy: objectId },
        { assignedTo: objectId },
      ],
    }],
  });
});
test('unchanged due date is not reported as a task change', async (t) => {
  const { updateTask } = require('../src/controllers/taskController');
  const { taskService } = require('../src/services/taskService');
  const { queue } = require('../src/queues/jobQueue');
  const id = '0123456789abcdef01234567';
  const task = {
    _id: id,
    createdBy: 'user',
    dueDate: new Date('2026-11-24T00:00:00.000Z'),
    updatedAt: new Date('2026-11-24T00:00:00.000Z'),
    toObject() {
      return this;
    },
  };
  t.mock.method(taskService, 'findById', async () => task);
  t.mock.method(taskService, 'updateIfUnchanged', async () => task);
  const enqueue = t.mock.method(queue, 'enqueueMany', async () => []);
  let response;
  let error;

  await updateTask(
    {
      params: { id },
      body: { dueDate: '2026-11-24' },
      user: { _id: 'user', role: 'user' },
      get: () => '"2026-11-24T00:00:00.000Z"',
    },
    { json: (body) => (response = body) },
    (err) => (error = err),
  );

  assert.equal(error, undefined);
  assert.equal(enqueue.mock.callCount(), 0);
  assert.equal(response.task, task);
});

test('stale task updates return conflict without saving', async (t) => {
  const { updateTask } = require('../src/controllers/taskController');
  const { taskService } = require('../src/services/taskService');
  const id = '0123456789abcdef01234567';
  const task = {
    _id: id,
    createdBy: 'user',
    updatedAt: new Date('2026-11-24T00:00:00.000Z'),
  };
  t.mock.method(taskService, 'findById', async () => task);
  const save = t.mock.method(taskService, 'updateIfUnchanged', async () => task);
  let error;

  await updateTask(
    {
      params: { id },
      body: { title: 'New title' },
      user: { _id: 'user', role: 'user' },
      get: () => '"2026-11-23T00:00:00.000Z"',
    },
    { json() {} },
    (err) => (error = err),
  );

  assert.equal(error.statusCode, 409);
  assert.equal(error.code, 'STALE_TASK');
  assert.equal(save.mock.callCount(), 0);
});

test('dashboard counts each task tag once and returns the ten most-used tags', async (t) => {
  const Task = require('../src/models/Task');
  const Activity = require('../src/models/Activity');
  const Notification = require('../src/models/Notification');
  const { dashboard } = require('../src/services/dashboardService');
  const pipelines = [];
  t.mock.method(Task, 'countDocuments', async () => 0);
  t.mock.method(Task, 'aggregate', async (pipeline) => {
    pipelines.push(pipeline);
    return pipeline.some((stage) => stage.$unwind)
      ? [{ _id: 'release', count: 3 }]
      : [{ _id: 'High', count: 2 }];
  });
  t.mock.method(Activity, 'find', () => ({
    sort() { return this; },
    limit() { return this; },
    lean: async () => [],
  }));
  t.mock.method(Notification, 'countDocuments', async () => 0);

  const result = await dashboard({
    _id: '0123456789abcdef01234567',
    role: 'admin',
  });

  assert.deepEqual(result.byTag, [{ tag: 'release', count: 3 }]);
  const tagPipeline = pipelines.find((pipeline) => pipeline.some((stage) => stage.$unwind));
  assert.ok(tagPipeline.some((stage) => stage.$project?.tags?.$setUnion));
  assert.deepEqual(tagPipeline.at(-1), { $limit: 10 });
});

test('notification writes stop when their task has already been deleted', async () => {
  const { NotificationService } = require('../src/services/notificationService');
  let notificationLookups = 0;
  const notifications = {
    updateOne() {
      notificationLookups++;
      throw new Error('No notification should be created for a deleted task');
    },
  };
  const tasks = { exists: async () => false };
  const service = new NotificationService(notifications, tasks);

  await service.notify('recipient', 'deleted-task', 'assignment', 'message', 'key');

  assert.equal(notificationLookups, 0);
});

test('notification creation uses a deduplicated upsert on standalone MongoDB', async () => {
  const { NotificationService } = require('../src/services/notificationService');
  let notificationWrite;
  const notifications = {
    updateOne: async (filter, update, options) => {
      notificationWrite = { filter, update, options };
    },
  };
  const tasks = { exists: async () => true };
  const service = new NotificationService(notifications, tasks);

  await service.notify('recipient', 'task-id', 'assignment', 'message', 'key');

  assert.deepEqual(notificationWrite.filter, { userId: 'recipient', dedupeKey: 'key' });
  assert.deepEqual(notificationWrite.update, {
    $setOnInsert: {
      userId: 'recipient',
      taskId: 'task-id',
      type: 'assignment',
      message: 'message',
      dedupeKey: 'key',
    },
  });
  assert.deepEqual(notificationWrite.options, { upsert: true });
});

test('notification upsert treats a concurrent duplicate as already delivered', async () => {
  const { NotificationService } = require('../src/services/notificationService');
  const notifications = {
    updateOne: async () => {
      throw Object.assign(new Error('duplicate key'), { code: 11000 });
    },
  };
  const tasks = { exists: async () => true };
  const service = new NotificationService(notifications, tasks);

  await assert.doesNotReject(
    service.notify('recipient', 'task-id', 'assignment', 'message', 'key'),
  );
});

test('notification lock field is hidden from task responses', () => {
  const Task = require('../src/models/Task');
  const task = new Task({
    title: 'Release checklist',
    createdBy: '0123456789abcdef01234567',
  });

  assert.equal('notificationVersion' in task.toJSON(), false);
  assert.equal('notificationVersion' in task.toObject(), false);
});

test('activity records use readable event labels', async (t) => {
  const Activity = require('../src/models/Activity');
  const { record } = require('../src/services/activityService');
  let inserted;
  t.mock.method(Activity, 'updateOne', async (_filter, update) => {
    inserted = update.$setOnInsert;
  });

  await record('taskCompleted', {
    taskId: '0123456789abcdef01234567',
    actorId: '0123456789abcdef01234568',
    creatorId: '0123456789abcdef01234568',
    title: 'Release checklist',
    eventId: 'event-1',
  });

  assert.equal(inserted.message, 'Completed task: Release checklist');
});

test('protected middleware accepts the established bearer JWT format', async (t) => {
  process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-auth-tests';
  const jwt = require('jsonwebtoken');
  const User = require('../src/models/User');
  const { protect } = require('../src/middleware/auth');
  const id = '0123456789abcdef01234567';
  const user = { _id: id, isActive: true };
  t.mock.method(User, 'findById', async (subject) => {
    assert.equal(subject, id);
    return user;
  });
  const token = jwt.sign({ sub: id }, process.env.JWT_SECRET, {
    algorithm: 'HS256',
  });
  const req = { get: () => `Bearer ${token}` };
  let nextCalled = false;

  await protect(req, {}, (error) => {
    if (error) throw error;
    nextCalled = true;
  });

  assert.equal(req.user, user);
  assert.equal(nextCalled, true);
});
