# Task Management Backend Specification

## 1. Purpose

This project is a CommonJS Node.js backend for task management. It provides authentication, role-based task access, activities, notifications, dashboard summaries, periodic reminders, in-process background jobs, and JSON/CSV/summary exports.

The implementation is educational and not production-hardened. There is no frontend in this project.

## 2. Technology Stack

- Node.js 20 or later
- Express 4
- MongoDB and Mongoose 8
- JSON Web Tokens (JWT) using HS256
- bcryptjs password hashing
- Node.js built-in test runner
- CORS middleware
- No frontend framework
- No added queue or export dependencies

## 3. Runtime and Configuration

Start behavior:

1. Load environment variables with `dotenv`.
2. Validate `JWT_SECRET`.
3. Connect to MongoDB.
4. Initialize the `Activity` and `Notification` indexes.
5. Register event listeners.
6. Start the in-process queue worker.
7. Start the reminder scheduler.
8. Listen on `PORT`, defaulting to `5000`.

Required or supported environment variables:

- `MONGO_URI`: MongoDB connection string.
- `JWT_SECRET`: Secret of at least 32 characters.
- `JWT_EXPIRES_IN`: Optional JWT lifetime, default `1d`.
- `PORT`: HTTP port, default `5000`.
- `REMINDER_INTERVAL_MINUTES`: Reminder check interval in minutes, default `60`; must be at least `1`.
- `EXPORT_DIR`: Optional export output directory. The default is the project `exports/` directory.

Commands:

- `npm start`: Run `server.js`.
- `npm run dev`: Run with Nodemon.
- `npm test`: Run all `tests/*.test.js` unit and API tests.
- `npm run test:integration`: Run API tests.

## 4. Application Structure

- `server.js`: startup orchestration.
- `src/app.js`: Express middleware and route registration.
- `src/config/db.js`: MongoDB connection.
- `src/models/`: Mongoose schemas.
- `src/routes/`: endpoint definitions.
- `src/controllers/`: HTTP request and response behavior.
- `src/services/`: domain and query logic.
- `src/middleware/`: authentication and centralized error handling.
- `src/events/`: task event emitter and listener registration.
- `src/jobs/`: reminder scheduler.
- `src/queues/`: in-memory job queue.
- `src/workers/`: worker and job handlers.
- `src/utils/`: async wrapping, retry, and CSV utilities.
- `src/examples/`: callback binding and Promise concurrency demonstrations.
- `tests/`: core and HTTP API tests.

## 5. HTTP Middleware

### JSON parsing

- Request JSON limit: `20 KB`.
- Malformed JSON produces HTTP 400 and code `VALIDATION_ERROR`.
- Oversized JSON produces HTTP 413 and code `PAYLOAD_TOO_LARGE`.
- CORS is enabled for all origins by default.

### Health endpoint

`GET /`

Returns:

```json
{"message":"Task Management API working"}
```

### Centralized errors

Error responses have this shape:

```json
{
  "message": "Human-readable message",
  "success": false,
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

Handled categories include:

- Custom application errors.
- Mongoose validation and cast errors.
- Duplicate keys.
- Malformed or oversized JSON.
- MongoDB network/server availability errors.
- Unknown routes.

Existing controller validation responses may return only `message`; centralized responses additionally include `success`, `code`, and `statusCode`.

## 6. Authentication

### User schema

- `name`: Required string, trimmed, maximum 80 characters.
- `email`: Required unique string, trimmed and lowercased.
- `password`: Required string; excluded from normal query results.
- `role`: `user` or `admin`; default `user`.
- `isActive`: Boolean; default `true`.
- Mongoose timestamps: `createdAt`, `updatedAt`.

### Public registration

`POST /api/auth/register`

Request:

```json
{
  "name": "Alex",
  "email": "alex@example.com",
  "password": "Password123"
}
```

Rules:

- Name must be a non-empty string of at most 80 characters.
- Email must match a basic email pattern.
- Password must contain 8–72 characters.
- Password is hashed with bcrypt cost 12.
- Public registration always creates a `user`.
- `role`, `isActive`, and timestamps cannot be supplied publicly.
- Duplicate email returns HTTP 409.

Response includes a public user object and JWT.

### Login

`POST /api/auth/login`

Request:

```json
{
  "email": "alex@example.com",
  "password": "Password123"
}
```

Rules:

- User must exist and be active.
- Password must match the stored bcrypt hash.
- Invalid credentials return HTTP 401.
- JWT contains the subject `sub = user.id`, uses HS256, and expires according to `JWT_EXPIRES_IN`.

### Authentication middleware

Protected endpoints require:

```text
Authorization: Bearer <token>
```

The middleware:

- Requires a Bearer token.
- Verifies JWT signature and HS256 algorithm.
- Reloads the user from MongoDB.
- Rejects missing, inactive, or deleted accounts.
- Adds `req.user` for controllers.

### Current user

`GET /api/auth/me`

Returns the public fields for the authenticated user: `id`, `name`, `email`, and `role`.

## 7. Authorization Model

Public registration cannot create an admin. Admin accounts must be provisioned through a trusted out-of-band workflow.

- Regular users may view tasks they created or are assigned.
- Admin users may view all tasks and all jobs.
- The task owner or an admin may edit task fields.
- The task owner or an admin may delete a task.
- The task owner or an admin may assign a task.
- The task assignee may update status.
- The assignee restriction also applies to task visibility checks.
- The task owner or admin may edit, but the assignee may only update status.
- Existing task status and priority values are retained.

## 8. Users

`GET /api/users`

Protected endpoint that returns active users sorted by name.

Only `name` and Mongoose `_id`-derived fields are exposed. Email addresses and password hashes are not returned.

## 9. Task Model

Fields:

- `title`: Required string, trimmed, maximum 150 characters.
- `description`: String, default `""`, maximum 2000 characters.
- `status`: `Pending`, `In Progress`, or `Completed`; default `Pending`.
- `priority`: `Low`, `Medium`, or `High`; default `Medium`.
- `dueDate`: MongoDB Date or `null`; default `null`.
- `tags`: Array of strings; default `[]`.
- `createdBy`: Required User ObjectId reference.
- `assignedTo`: Optional User ObjectId reference; default `null`.
- `createdAt` and `updatedAt`: Mongoose timestamps.

Indexes:

- `{ createdBy: 1, createdAt: -1 }`
- `{ assignedTo: 1, createdAt: -1 }`

## 10. Task API

All task routes require authentication.

### Create task

`POST /api/tasks`

Allowed fields:

- `title`
- `description`
- `status`
- `priority`
- `dueDate`
- `tags`

Rules:

- `title` is required on creation.
- Protected fields such as `createdBy`, `assignedTo`, timestamps, and unknown fields are rejected.
- Tags are limited to 20 entries, with each entry trimmed and limited to 40 characters.
- Duplicate tags are removed.
- `dueDate` must be a valid `YYYY-MM-DD` UTC calendar date.
- `createdBy` is set from the authenticated user.
- Returns HTTP 201.
- A `taskCreated` event is published after the database write.

### List tasks

`GET /api/tasks`

Supported query parameters:

- `status`
- `priority`
- `search`
- `tags`
- `fromDate`
- `toDate`
- `sortBy`
- `order`
- `page`
- `limit`

Defaults:

- `sortBy`: `createdAt`
- `order`: descending
- `page`: `1`
- `limit`: `10`

Validation:

- Query values must be strings of at most 150 characters.
- `page` must be a positive integer.
- `limit` must be between 1 and 100.
- `sortBy` supports `dueDate`, `priority`, and `createdAt`.
- `order` supports `asc` and `desc`.
- Date ranges use valid `YYYY-MM-DD` values.
- `fromDate` must not be later than `toDate`.

Filtering:

- Regular users receive only owned or assigned tasks.
- Admin users receive all tasks.
- Search is case-insensitive and applies to title and description.
- Multiple tags use `$in` behavior, so matching at least one supplied tag is sufficient.
- `fromDate` is inclusive.
- `toDate` is inclusive through the end of that UTC date.
- Priority sorting uses High = 3, Medium = 2, Low = 1.

Response:

```json
{
  "tasks": [],
  "total": 0,
  "page": 1,
  "limit": 10,
  "totalPages": 0
}
```

### Get task

`GET /api/tasks/:id`

Returns a task only if the caller may view it. Otherwise it returns HTTP 404.

### Update task

`PUT /api/tasks/:id`

- Rejects unknown or protected fields.
- Requires owner or admin authorization.
- Updates allowed task fields with normalized title and tags.
- Publishes `taskUpdated` when fields changed.
- Publishes `taskCompleted` when status changed to `Completed`.

### Update status

`PATCH /api/tasks/:id/status`

Request must contain only `status`, and status must be one of:

- `Pending`
- `In Progress`
- `Completed`

The caller must be owner, assignee, or admin. Publishing uses `taskCompleted` for completed tasks and `taskUpdated` otherwise.

### Assign task

`PATCH /api/tasks/:id/assign`

Request:

```json
{"assignedTo":"userMongoId"}
```

- Owner or admin only.
- The assignee must be an active, existing user.
- Publishes `taskAssigned` only when the assignee changed.

### Delete task

`DELETE /api/tasks/:id`

- Owner or admin only.
- Returns `{ "message": "Task deleted" }`.

## 11. Activities

Activity schema fields:

- `eventId`: Optional unique dedupe ID.
- `taskId`: Referenced task.
- `actorId`: Referenced acting user.
- `event`: `taskCreated`, `taskUpdated`, `taskAssigned`, or `taskCompleted`.
- `message`: Human-readable event text.
- `details`: Mixed event data.
- `visibleTo`: User ObjectIds that may see the activity.
- Mongoose timestamps.

Indexes:

- Sparse unique index on `eventId`.
- `{ visibleTo: 1, createdAt: -1 }`.

Activity records include:

- Actor.
- Task creator.
- Current assignee.
- Previous assignee for reassignment events.

`GET /api/activities`

- Admins receive the latest 50 activities.
- Regular users receive the latest 50 activities containing their ID in `visibleTo`.
- Historical activity is not retroactively created for old tasks.

## 12. Notifications

Notification types:

- `assignment`
- `completion`
- `priorityChanged`
- `dueSoon`
- `overdue`

Schema fields:

- `userId`
- `taskId`
- `type`
- `message`
- `isRead`
- `dedupeKey`
- Mongoose timestamps

Indexes:

- Unique `{ userId: 1, dedupeKey: 1 }`.
- `{ userId: 1, createdAt: -1 }`.

`GET /api/notifications`

Returns the latest 100 notifications for the current user and an unread count.

`PATCH /api/notifications/:id/read`

Marks one owned notification read.

`PATCH /api/notifications/read-all`

Marks all unread notifications for the current user read.

Notification behavior:

- Assignment: notify the new assignee unless they performed the assignment.
- Completion: notify the creator when another user completes the task.
- Priority change: notify the creator and assignee except the actor.
- Dedupe keys prevent repeated event and retry records.

## 13. Dashboard

`GET /api/dashboard`

Regular users receive counts for tasks they created or are assigned. Admins receive counts for all tasks.

The response contains:

- `total`
- `completed`
- `pending`
- `inProgress`
- `overdue`
- `byPriority`
- `recentActivity`
- `unreadNotifications`

Overdue means:

- Status is not `Completed`.
- `dueDate` is before the UTC start of today.

## 14. Event and Queue Architecture

Task controllers publish events only after successful MongoDB writes.

Events:

- `taskCreated`
- `taskUpdated`
- `taskAssigned`
- `taskCompleted`

The event module schedules listener execution with `setImmediate`. Event payloads receive a random UUID `eventId`.

Each listener queues an in-memory job rather than writing directly. Listener failures are logged. Activity and notification delivery are not guaranteed if the process crashes.

Existing reminder checks call the notification service directly and are separate from task event listeners.

## 15. Reminder Scheduler

The scheduler runs one check immediately after startup and then at the configured interval.

It checks incomplete tasks whose due date is before the day after tomorrow.

Rules:

- `dueSoon`: due tomorrow in UTC.
- `overdue`: due before today's UTC midnight.
- Creator and assignee are candidates for reminders.
- Due-soon and overdue have different dedupe keys.
- Repeated checks deduplicate by recipient, task, type, and due date.

No historical reminders are backfilled for old tasks.

## 16. Background Job Queue

The queue is an in-memory `JobQueue` with:

- A Map of jobs.
- A FIFO pending array.
- A `ready` EventEmitter event.

Job fields:

- `id`
- `type`
- `payload`
- `ownerId`
- `status`
- `attempts`
- `maxRetries`
- `errors`
- `createdAt`
- `nextRetryAt`
- `result`
- `finishedAt` after terminal completion

Job types:

- `activity`
- `notification`
- `report`

Job statuses:

- `pending`
- `processing`
- `completed`
- `failed`

Jobs and status metadata disappear on process restart. Export files may remain on disk.

## 17. Queue Worker

The worker:

- Supports bounded concurrency, default `2`.
- Processes jobs in FIFO order.
- Makes an initial attempt plus up to three retries.
- Uses exponential delays of 1 second, 2 seconds, and 4 seconds.
- Occupies a worker slot while retry delays are active.
- Stops retrying `ValidationError`, `CastError`, `ForbiddenError`, `NotFoundError`, and unknown jobs.
- Records attempt number, error message, and timestamp in `errors`.
- Records `nextRetryAt` while waiting.
- Records `finishedAt` after completion or failure.

Activity and notification jobs are idempotent through `eventId` or notification dedupe keys.

## 18. Job API

`GET /api/jobs`

- Current user sees owned jobs.
- Admins see all job metadata.
- Job payload is excluded from public job views.

`GET /api/jobs/:id`

- Returns the job for the owner or for an admin.
- Regular users receive generic attempt failure text.
- Admin users receive detailed attempt and terminal error text.
- Unknown or inaccessible jobs return HTTP 404.

## 19. Report API

All report routes require authentication.

Supported formats:

- `json`
- `csv`
- `summary`

Report request body may contain only:

- `status`
- `priority`
- `search`
- `tags`
- `fromDate`
- `toDate`

An empty object exports all visible tasks.

Endpoints:

- `POST /api/reports/json`
- `POST /api/reports/csv`
- `POST /api/reports/summary`

Each endpoint validates the same filters as task listing and immediately creates a report job. It returns HTTP 202 with public job metadata.

Report execution:

- Reloads the account by `userId` and rejects inactive accounts.
- Rebuilds task visibility and filters from the current account.
- Does not trust client-supplied roles.
- Writes to a temporary file in `EXPORT_DIR`.
- Renames the completed temporary file into place.
- Removes the temporary file on failure.

JSON exports are arrays. CSV exports include a header and use one row per task. Summary exports are JSON containing `generatedAt`, `total`, and counts by task status.

CSV values are formula protected: values beginning with whitespace, `=`, `+`, `-`, `@`, tab, carriage return, or newline receive a leading apostrophe.

## 20. Download API

`GET /api/reports/download/:id`

- Downloads only for the original requester.
- Admin job visibility does not grant report download access.
- Returns HTTP 409 if the report is not completed.
- Returns HTTP 404 for inaccessible jobs or missing files.
- Files are returned by the job-generated filename.

## 21. Export Data

Task export columns:

- `_id`
- `title`
- `description`
- `status`
- `priority`
- `dueDate`
- `tags`
- `createdBy`
- `assignedTo`
- `createdAt`
- `updatedAt`

JSON and CSV exports stream Mongoose cursor results. Records are sorted by `_id` and written to disk before the completed job is announced.

## 22. Error Semantics

Common status codes:

- `400 ValidationError`: invalid input or identifier.
- `401 UnauthorizedError`: missing, invalid, or inactive authentication.
- `403 ForbiddenError`: authenticated but not permitted.
- `404 NotFoundError`: resource missing or intentionally hidden.
- `409`: duplicate email or report not ready.
- `413`: JSON payload too large.
- `503`: database unavailable or queue failure.

Special queue error class:

- `QueueError` defaults to `QUEUE_ERROR` and HTTP 503.
- It can be marked retryable or non-retryable.
- Unknown job types are non-retryable queue errors.

## 23. Testing

Core tests cover:

- Exponential retry delays.
- Permanent and non-retryable failures.
- Worker failed-attempt metadata.
- FIFO continuation after failure.
- Two-job concurrency limit.
- CSV quoting and formula protection.
- Custom error status and code.

API tests cover:

- Health endpoint.
- Missing routes.
- Authentication rejection for task, job, and report APIs.
- Malformed JSON handling.

Full MongoDB-backed authenticated CRUD and report integration remain external test cases.

Testing rule: never point test database operations at production.

## 24. Learning Demonstrations

`node src/examples/promiseConcurrency.js`

Demonstrates:

- `Promise.all`
- `Promise.allSettled`
- `Promise.race`
- `Promise.any`

`node src/examples/classCallbacks.js`

Demonstrates lost `this`, `bind`, arrow-wrapper, `call`, and `apply` behavior.

## 25. Production Limitations

The current implementation is intentionally a learning baseline:

- The queue is in-memory and not durable.
- Jobs and status metadata disappear on restart.
- Export files are not automatically cleaned or retained with a policy.
- Download access is not revoked when task permissions change after report creation.
- No Redis, BullMQ, durable outbox, or dedicated scheduler is used.
- CORS remains permissive.
- Input sanitization and rate limiting are not implemented.
- No production monitoring or distributed tracing is configured.
- Export and database resources need limits for production use.
