# Task Management Backend — Milestones 1–3

Stack: Node.js, Express, MongoDB/Mongoose, JWT, bcryptjs. No frontend.

## Run
1. `npm install`
2. Copy `.env.example` to `.env`, set a private `JWT_SECRET` of at least 32 characters, and start local MongoDB.
3. `npm run dev`
4. Open http://localhost:5000/ .

## Routes
- `POST /api/auth/register` JSON `{ "name":"Alex", "email":"alex@example.com", "password":"Password123" }`
- `POST /api/auth/login` JSON `{ "email":"alex@example.com", "password":"Password123" }` -> bearer token and user
- `POST /api/auth/logout` -> ends the client session
- `GET /api/auth/me` protected
- `GET /api/users` admin-only active user directory
- `POST /api/tasks` protected; fields title, description, status, priority, dueDate (YYYY-MM-DD), tags
- `GET /api/tasks` protected; query status,priority,search,tags,fromDate,toDate,sortBy,order,page,limit
- `GET /api/tasks/:id` protected
- `GET /api/tasks/:id/assignees` protected; task owner/admin only
- `PUT /api/tasks/:id` protected; owner/admin may edit with an `If-Match` timestamp
- `PATCH /api/tasks/:id/status` protected; owner/assignee/admin may update status
- `PATCH /api/tasks/:id/assign` protected; body `{ "assignedTo":"userMongoId" }`; owner/admin only
- `DELETE /api/tasks/:id` protected; owner/admin only

## Permissions
Registration always creates `user`; public request bodies cannot specify admin, createdBy, assignedTo, timestamps. Users see their own created/assigned tasks. Task owner/admin edits fields, deletes, assigns; assignee may update status. No public admin-creation API. For a real Admin user, provision one out-of-band via a trusted administrator workflow.

To provision an administrator through the guarded utility, set `ADMIN_NAME`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the environment, then run `npm run provision-admin -- --confirm`. This operation creates or promotes the matching account and resets its password.

## Notes
- Dates are treated as UTC calendar dates; date-range is inclusive of `toDate`.
- `tags=a,b` matches at least one of the two tags.
- Priority sorting maps High=3, Medium=2, Low=1.
- Middleware validates bearer JWTs and reloads the active user from MongoDB. Existing bearer-token login remains in place; no cookie or CSRF token is required.
- Task edits require the `If-Match` header from the task's `updatedAt`; stale edits return HTTP 409.
- Deleting a task is owner/admin-only, removes notifications for all recipients, and preserves activity history.
- Valid registration requests return the same neutral response and require a subsequent login.
- Login and registration are limited to 10 requests per IP per 15 minutes. CORS allows `CLIENT_ORIGIN` (defaults to `http://localhost:4200`); set a comma-separated list for multiple frontend origins.

## Milestones 4–7 additions
- `GET /api/activities` — recent activity (admin: all, users: events involving them at the time).
- `GET /api/notifications` — current user's notifications and unread count.
- `PATCH /api/notifications/:id/read` — mark one owned notification read.
- `PATCH /api/notifications/read-all` — mark current user's notifications read.
- `GET /api/dashboard` — authorized task counts, byPriority, recent activity.
- `REMINDER_INTERVAL_MINUTES` in `.env` controls periodic due-date checks; starts after MongoDB connection.
- `node src/examples/promiseConcurrency.js` demonstrates all/allSettled/race/any.
- Activity and notification jobs are stored in MongoDB in the same transaction as task writes. Workers may finish shortly after the HTTP response and recover expired job leases after a restart.
- Overdue is **derived** from `dueDate < today UTC` for incomplete tasks. The existing status enum remains unchanged.
- Due-soon reminder applies to tasks due tomorrow (UTC); overdue notifications are deduplicated.
- Activity and notification records are added to MongoDB, but old tasks do not automatically produce historical activity records.

## Milestones 8–12 — additive upgrade
This update uses the uploaded CommonJS backend as its baseline. Existing routes, task status/priority values, ownership checks, reminder scheduler and environment variable names are retained. The upload contained asynchronous event listeners but no tracked job queue, so milestone 8 was added as a prerequisite. Node 20+ recommended.

### New APIs (bearer token required)
- `POST /api/reports/json`, `/api/reports/csv`, `/api/reports/summary`: optional JSON body with `status`, `priority`, `search`, `tags`, `fromDate`, `toDate` (same semantics as task filters). Empty body `{}` exports all visible tasks, not just one page. Returns HTTP 202 and `{job: {id, status, ...}}`.
- `GET /api/jobs?page=1&limit=10`: paginated report jobs owned by the user (admin sees all report job metadata); internal jobs are never exposed. Returns `jobs`, `page`, `limit`, `total`, `activeCount`.
- `GET /api/jobs/:id`: poll job status: pending, processing, completed, failed. `attempts`, `errors`, `nextRetryAt`, `result` are recorded. Detailed error messages are admin-only.
- `GET /api/reports/download/:id`: downloads a completed export using its job ID; only the requester can download. Returns 409 if not ready. Files are stored in `exports/` unless `EXPORT_DIR` is set. Use a dedicated non-public directory.
- Report requests are limited to 5 per user per rolling hour. Generated export files expire after 24 hours; cleanup runs hourly and expired files are rejected at download time.
- CSV/JSON exports are limited to 50,000 rows and 25 MiB.

### Implementation details
- Task activity/notification jobs, report jobs, job status, retries and results are persisted in MongoDB. Workers atomically claim jobs, renew processing leases, and reclaim expired leases after a restart. The worker processes up to two jobs concurrently by default. Three retries follow the initial attempt with 1s/2s/4s delays; invalid jobs fail without retry. Activity event IDs and notification dedupe keys prevent duplicate records on retries. Reminder checks still use the notification service directly.
- Exports use the same ownership and filter query builder as task listing, reload the account at execution time, and stream MongoDB cursor rows to temporary files. A summary uses a MongoDB aggregation. Successful files are renamed into place. CSV protects against formula injection. JSON exports are arrays.
- `TaskService`, `NotificationService`, and `QueueWorker` are classes. Existing service exports remain available. Run `node src/examples/classCallbacks.js` to see lost `this`, bind, call, apply, and wrapper callbacks.
- Centralized error middleware handles malformed JSON, custom errors, Mongoose validation/cast errors, duplicate keys and common database connectivity errors. Existing response `message` is retained; centralized errors additionally include `success`, `code`, and `statusCode`. Some existing controller validation paths still return their original direct responses.

### Testing
Run `npm test` for unit tests and HTTP tests. The MongoDB-backed transaction test in `tests/jobRetention.test.js` is skipped unless `MONGO_TEST_URI` points to a local `rs0` replica-set database named `task_management_it_<12 hex characters>`. It drops only that test database when finished. Example PowerShell:

```powershell
$env:MONGO_TEST_URI = "mongodb://127.0.0.1:27018/task_management_it_a1b2c3d4e5f6?replicaSet=rs0"
npm.cmd test
Remove-Item Env:\MONGO_TEST_URI
```

Never point test data operations at a production database.

### Limitations
Job records are durable in MongoDB, but quota and rate-limit counters remain process-local. Transactions require a replica set or transaction-capable sharded cluster. Historical report access is not automatically revoked when task permissions change. Terminal job metadata expires automatically and can be evicted sooner under capacity pressure; pending/processing/retrying jobs are never evicted. Export files are deleted after 24 hours. Use shared rate-limit/quota stores and access revocation for production. `.env` and `node_modules` are intentionally not distributed; copy `.env.example` and install dependencies with `npm ci`.

### Job retention settings
Optional variables in your existing local `.env` (positive integers):

```dotenv
JOB_CAPACITY=10000
JOB_COMPLETED_RETENTION_MS=86400000
JOB_FAILED_RETENTION_MS=604800000
JOB_CLEANUP_INTERVAL_MS=60000
```

Capacity includes queued, processing, retrying, retained terminal jobs and reserved slots. At capacity, reclaim expired jobs and then oldest finished jobs, prioritizing internal jobs. If there is insufficient reclaimable space, task mutations requiring events and report submissions return HTTP 503 before the write/enqueue. Completed reports may become unavailable before their configured expiry if capacity is exhausted.
