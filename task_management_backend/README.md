# Task Management Backend — Milestones 1–3

Stack: Node.js, Express, MongoDB/Mongoose, JWT, bcryptjs. No frontend.

## Run
1. `npm install`
2. Create a local `.env` file with `MONGO_URI` and a private `JWT_SECRET` of at least 32 characters (there is no checked-in `.env.example`); start local MongoDB.
3. `npm run dev`
4. Open http://localhost:5000/ .

## Routes
- `POST /api/auth/register` JSON `{ "name":"Alex", "email":"alex@example.com", "password":"Password123" }`
- `POST /api/auth/login` JSON `{ "email":"alex@example.com", "password":"Password123" }` -> token
- `GET /api/auth/me` protected
- `GET /api/users` protected; name/ID-only active user directory
- `POST /api/tasks` protected; fields title, description, status, priority, dueDate (YYYY-MM-DD), tags
- `GET /api/tasks` protected; query status,priority,search,tags,fromDate,toDate,sortBy,order,page,limit
- `GET /api/tasks/:id` protected
- `PUT /api/tasks/:id` protected; owner/admin may edit
- `PATCH /api/tasks/:id/status` protected; owner/assignee/admin may update status
- `PATCH /api/tasks/:id/assign` protected; body `{ "assignedTo":"userMongoId" }`; owner/admin only
- `DELETE /api/tasks/:id` protected; owner/admin only

## Permissions
Registration always creates `user`; public request bodies cannot specify admin, createdBy, assignedTo, timestamps. Users see their own created/assigned tasks. Task owner/admin edits fields, deletes, assigns; assignee may update status. No public admin-creation API. For a real Admin user, provision one out-of-band via a trusted administrator workflow.

## Notes
- Dates are treated as UTC calendar dates; date-range is inclusive of `toDate`.
- `tags=a,b` matches at least one of the two tags.
- Priority sorting maps High=3, Medium=2, Low=1.
- Middleware validates JWT and reloads active user from MongoDB.
- This is a learning baseline, not a production-hardened service (add input sanitization, rate limiting, restrictive CORS, integration tests and monitoring).

## Milestones 4–7 additions
- `GET /api/activities` — recent activity (admin: all, users: events involving them at the time).
- `GET /api/notifications` — current user's notifications and unread count.
- `PATCH /api/notifications/:id/read` — mark one owned notification read.
- `PATCH /api/notifications/read-all` — mark current user's notifications read.
- `GET /api/dashboard` — authorized task counts, byPriority, recent activity.
- `REMINDER_INTERVAL_MINUTES` in `.env` controls periodic due-date checks; starts after MongoDB connection.
- `node src/examples/promiseConcurrency.js` demonstrates all/allSettled/race/any.
- Activity/notification listeners are asynchronously scheduled **after task database writes**; output may appear shortly after the HTTP response.
- This is an educational in-process EventEmitter + timer. Events are not durable: process crashes can lose them. For production, consider a durable outbox, Redis/BullMQ and a dedicated scheduler.
- Overdue is **derived** from `dueDate < today UTC` for incomplete tasks. The existing status enum remains unchanged.
- Due-soon reminder applies to tasks due tomorrow (UTC); overdue notifications are deduplicated.
- Activity and notification records are added to MongoDB, but old tasks do not automatically produce historical activity records.

## Milestones 8–12 — additive upgrade
This update uses the uploaded CommonJS backend as its baseline. Existing routes, task status/priority values, ownership checks, reminder scheduler and environment variable names are retained. The upload contained asynchronous event listeners but no tracked job queue, so milestone 8 was added as a prerequisite. No new npm dependencies are required. Node 20+ recommended (Node 22 verified).

### New APIs (Bearer JWT required)
- `POST /api/reports/json`, `/api/reports/csv`, `/api/reports/summary`: optional JSON body with `status`, `priority`, `search`, `tags`, `fromDate`, `toDate` (same semantics as task filters). Empty body `{}` exports all visible tasks, not just one page. Returns HTTP 202 and `{job: {id, status, ...}}`.
- `GET /api/jobs`: lists jobs owned by the user (admin sees all job metadata).
- `GET /api/jobs/:id`: poll job status: pending, processing, completed, failed. `attempts`, `errors`, `nextRetryAt`, `result` are recorded. Detailed error messages are admin-only.
- `GET /api/reports/download/:id`: downloads a completed export using its job ID; only the requester can download. Returns 409 if not ready. Files are stored in `exports/` unless `EXPORT_DIR` is set. Use a dedicated non-public directory.

### Implementation details
- Existing task events enqueue activity and notification jobs. A bound worker callback processes up to two jobs concurrently. Three retries follow the initial attempt with 1s/2s/4s delays; invalid jobs fail without retry. A retry occupies its worker slot until it finishes. Activity event IDs and existing notification dedupe keys prevent duplicate records on retries. Existing reminder checks still use the compatible notification service method directly.
- Exports use the same ownership and filter query builder as task listing, reload the account at execution time, and stream MongoDB cursor rows to temporary files. A summary uses a MongoDB aggregation. Successful files are renamed into place. CSV protects against formula injection. JSON exports are arrays.
- `TaskService`, `NotificationService`, and `QueueWorker` are classes. Existing service exports remain available. Run `node src/examples/classCallbacks.js` to see lost `this`, bind, call, apply, and wrapper callbacks.
- Centralized error middleware handles malformed JSON, custom errors, Mongoose validation/cast errors, duplicate keys and common database connectivity errors. Existing response `message` is retained; centralized errors additionally include `success`, `code`, and `statusCode`. Some existing controller validation paths still return their original direct responses.

### Testing
Run `npm test` for unit tests and HTTP integration tests that do not require MongoDB. All 11 passed in the preparation environment. They cover retry, failure recovery, concurrency, CSV, custom errors, health endpoint, authentication rejection, 404 and invalid JSON. Full authenticated CRUD, report generation against MongoDB, and download integration remain to be tested with an isolated local test database. Never point test data operations at a production database.

### Limitations
This is an in-memory learning queue. Jobs and status metadata disappear on restart; existing export files remain on disk. No durable retry or automatic cleanup/retention is implemented, and historical report access is not automatically revoked when task permissions change. Use a durable queue, retention policy, resource limits and access revocation for production. Existing CORS policy remains permissive as in the original project. `.env` and `node_modules` are intentionally not distributed; use your original `.env` locally and install dependencies with `npm ci`.
