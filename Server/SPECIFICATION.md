# Task Management Backend Specification

## 1. Purpose

This project is a CommonJS Node.js backend for task management. It provides bearer-token authentication, role-based task access, activities, notifications, dashboard summaries, periodic reminders, MongoDB-backed background jobs, and JSON/CSV/summary exports.

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
4. Initialize model indexes and the durable queue.
5. Clean expired jobs and export files.
6. Start the MongoDB-backed queue worker and reminder scheduler.
7. Listen on `PORT`, defaulting to `5000`.

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
- `src/events/`: compact event payload construction.
- `src/jobs/`: reminder scheduler.
- `src/queues/`: MongoDB-backed durable job queue.
- `src/workers/`: worker and job handlers.
- `src/utils/`: async wrapping, retry, and CSV utilities.
- `src/examples/`: callback binding and Promise concurrency demonstrations.
- `tests/`: core and HTTP API tests.

## 5. HTTP Middleware

### JSON parsing

- Request JSON limit: `20 KB`.
- Malformed JSON produces HTTP 400 and code `VALIDATION_ERROR`.
- Oversized JSON produces HTTP 413 and code `PAYLOAD_TOO_LARGE`.
- Helmet security headers are enabled.
- Credentialed CORS allows only the configured `CLIENT_ORIGIN` (defaults to `http://localhost:4200`); comma-separated exact origins are supported.
- Authentication endpoints are limited to 10 requests per IP address per 15 minutes.
- Protected routes accept the existing JWT bearer-token contract using `Authorization: Bearer <token>`; cookies and CSRF tokens are not required.

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
- `password`: Required string hash; excluded from normal query results. Passwords are stored as bcrypt hashes at cost 12.
- `role`: `user` or `admin`; default `user`.
- `isActive`: Boolean; default `true`.
- Mongoose timestamps: `createdAt`, `updatedAt`.

### Registration and password login

`POST /api/auth/register` accepts `name`, `email`, and `password`. Names must be non-empty and at most 80 characters; emails must match a basic email pattern; passwords must contain at least 8 characters and no more than 72 UTF-8 bytes. Passwords are hashed with bcrypt cost 12. Registration always creates a regular user and returns the same neutral HTTP 202 response for new and existing accounts. Public input cannot set role or account state.

`POST /api/auth/login` accepts `email` and `password`. The user must exist and be active; invalid credentials receive a generic HTTP 401 response. The backend compares the supplied password with the stored bcrypt hash. The browser's owner can inspect the password request in DevTools; HTTPS protects it in transit, while bcrypt protects the stored database value.

JWT contains `sub = user.id`, uses HS256, and expires according to `JWT_EXPIRES_IN`. `POST /api/auth/logout` returns 204. The client clears its locally stored token; the stateless JWT remains valid until expiry if copied elsewhere.

### Authentication middleware

Protected endpoints require `Authorization: Bearer <token>`.

The middleware:

- Requires a bearer token.
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

Admin-only endpoint that returns active users sorted by name. Task owners/admins use `GET /api/tasks/:id/assignees` for an authorized, task-scoped assignment lookup.

The general directory exposes names and IDs to admins only. Task-scoped assignee lookup is owner/admin-only and also includes email addresses for choosing an assignee. Authentication credentials are never returned.

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
- `notificationVersion`: Internal counter used to coordinate notification writes with task deletion; not part of public task input.
- `createdAt` and `updatedAt`: Mongoose timestamps.

Indexes:

- `{ createdBy: 1, createdAt: -1 }`
- `{ assignedTo: 1, createdAt: -1 }`
- `{ status: 1, dueDate: 1 }`
- `{ tags: 1, createdAt: -1 }`

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
- Requires `If-Match` containing the task's current `updatedAt`; missing or stale values return HTTP 409.
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

- Send `{"assignedTo":null}` to unassign the task.
- Owner or admin only.
- A non-null assignee must be an active, existing user.
- Publishes `taskAssigned` only when the assignee changed.

### Delete task

`DELETE /api/tasks/:id`

- Owner or admin only.
- Deletes notifications linked to the task for all recipients after deleting the task; these writes are not atomic.
- Retains activity history.
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
- `byTag`: up to ten tags ordered by task count descending; each task counts once per tag
- `recentActivity`
- `unreadNotifications`

Overdue means:

- Status is not `Completed`.
- `dueDate` is before the UTC start of today.

## 14. Event and Queue Architecture

Task controllers persist activity and notification jobs in MongoDB after each successful task write. These separate writes are not atomic; an enqueue failure does not roll back the task mutation.

Events:

- `taskCreated`
- `taskUpdated`
- `taskAssigned`
- `taskCompleted`

Event payloads receive a random UUID `eventId`. Workers claim jobs atomically, maintain processing leases, and recover expired leases after a restart. Activity event IDs and notification dedupe keys make retries idempotent.

Existing reminder checks call the notification service directly and are separate from task outbox jobs.

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

The `JobQueue` persists jobs in MongoDB. A singleton capacity record serializes reservation checks; workers atomically claim pending jobs and expired processing leases.

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

Jobs and status metadata survive process restarts. Terminal metadata expires automatically (completed: 24 hours; failed: 7 days by default) and can be reclaimed earlier under capacity pressure. The default total capacity is 10,000; active jobs and reserved slots are protected. Requests requiring new slots return 503 if capacity cannot be reclaimed.

## 17. Queue Worker

The worker:

- Supports bounded concurrency, default `2`.
- Processes jobs in FIFO order.
- Makes an initial attempt plus up to three retries.
- Uses exponential delays of 1 second, 2 seconds, and 4 seconds.
- Releases the worker slot while a job waits for its next retry time.
- Stops retrying `ValidationError`, `CastError`, `ForbiddenError`, `NotFoundError`, and unknown jobs.
- Records attempt number, error message, and timestamp in `errors`.
- Records `nextRetryAt` while waiting.
- Records `finishedAt` after completion or failure.
- Renews a processing lease while a handler is running.

Activity and notification jobs are idempotent through `eventId` or notification dedupe keys.

## 18. Job API

`GET /api/jobs?page=1&limit=10`

- Current user sees owned report jobs.
- Admins see all report job metadata. Internal activity and notification jobs are hidden.
- Page and limit are validated positive integers; limit is capped at 100.
- Response: `jobs`, `page`, `limit`, `total`, `activeCount` (across all pages).
- Job payload is excluded from public job views.

`GET /api/jobs/:id`

- Returns a report job for the owner or for an admin. Internal jobs return 404.
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
CSV and JSON exports are limited to 50,000 rows and 25 MiB. Summary exports are limited to 25 MiB.

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
- `409`: task edit version is missing or stale.
- `409`: report not ready.
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

`tests/jobRetention.test.js` also contains a MongoDB-backed standalone queue/outbox test. It runs only when `MONGO_TEST_URI` points to a local standalone database named `task_management_it_<12 hex characters>`; it drops only that named test database when finished. Without that variable, the test is skipped.

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

- MongoDB may run standalone. Task mutations and related job/notification writes are not atomic, and job capacity checks are serialized only within one backend process.
- Export requests are limited to five per user per rolling hour, and generated files are deleted after 24 hours.
- Download access is not revoked when task permissions change after report creation.
- CORS is restricted to `CLIENT_ORIGIN`; authentication rate limits and Helmet headers are enabled.
- Rate-limit and export-quota counters are process-local and reset on restart.
- No production monitoring or distributed tracing is configured.
