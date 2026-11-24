# Taskora API Reference

The API is served by the Express backend. Prefix endpoints with `http://localhost:5000` for local calls. The Angular development proxy forwards `/api` to the backend.

## Conventions

- JSON request and response bodies unless noted.
- Protected routes require `Authorization: Bearer <token>`. Login continues to issue JWT bearer tokens; state-changing requests do not require CSRF tokens.
- Registration and login are public.
- Public registration always assigns the `user` role.
- Task visibility is owned or assigned for regular users; admins can view all tasks.
- Error response from centralized middleware:

```json
{
  "message": "Task not found",
  "success": false,
  "code": "NOT_FOUND",
  "statusCode": 404
}
```

Some controller validation paths retain their original `{ "message": "..." }` response shape.

## Endpoint summary

| Module | Method | Endpoint | Auth / allowed roles | Parameters or body | Success response | Common status codes |
|---|---|---|---|---|---|---|
| Health | GET | `/` | Public | — | `{ "message": "Task Management API working" }` | 200 |
| Auth | POST | `/api/auth/register` | Public | `name`, `email`, `password` | Neutral `{ "message" }` (202) | 202, 400, 429 |
| Auth | POST | `/api/auth/login` | Public | `email`, `password` | `{ "token", "user" }` | 200, 400, 401, 429 |
| Auth | POST | `/api/auth/logout` | Public | — | Empty response | 204 |
| Auth | GET | `/api/auth/me` | Bearer token; active user | — | `{ "user" }` | 200, 401 |
| Users | GET | `/api/users` | Bearer token; admin only | — | `{ "users": [...] }` | 200, 401, 403 |
| Tasks | POST | `/api/tasks` | Bearer token; user/admin | Task fields listed below | `{ "task" }` (201) | 201, 400, 401 |
| Tasks | GET | `/api/tasks` | Bearer token; user/admin | Filter, sort and pagination query | `{ "tasks", "total", "page", "limit", "totalPages" }` | 200, 400, 401 |
| Tasks | GET | `/api/tasks/:id` | Bearer token; visible task | `id` path parameter | `{ "task" }` | 200, 400, 401, 404 |
| Tasks | GET | `/api/tasks/:id/assignees` | Bearer token; task owner/admin | `id` path parameter | `{ "users": [...] }` | 200, 401, 403, 404 |
| Tasks | PUT | `/api/tasks/:id` | Bearer token; owner/admin | `If-Match: "<updatedAt>"`; allowed task fields | `{ "task" }` | 200, 400, 401, 403, 404, 409 |
| Tasks | PATCH | `/api/tasks/:id/status` | Bearer token; owner/assignee/admin | `{ "status" }` | `{ "task" }` | 200, 400, 401, 403, 404 |
| Tasks | PATCH | `/api/tasks/:id/assign` | Bearer token; owner/admin | `{ "assignedTo": "userId" }` or `{ "assignedTo": null }` | `{ "task" }` | 200, 400, 401, 403, 404 |
| Tasks | DELETE | `/api/tasks/:id` | Bearer token; owner/admin | `id` path parameter | `{ "message": "Task deleted" }` | 200, 400, 401, 403, 404 |
| Activity | GET | `/api/activities` | Bearer token; user/admin | — | `{ "activities": [...] }` (max 50) | 200, 401 |
| Notifications | GET | `/api/notifications` | Bearer token; user/admin | — | `{ "notifications": [...], "unreadCount": number }` | 200, 401 |
| Notifications | PATCH | `/api/notifications/:id/read` | Bearer token; notification owner | `id` path parameter | `{ "notification": {...} }` | 200, 400, 401, 404 |
| Notifications | PATCH | `/api/notifications/read-all` | Bearer token; current user | — | `{ "updated": number }` | 200, 401 |
| Dashboard | GET | `/api/dashboard` | Bearer token; user/admin | — | Counts, priority distribution, recent activity and unread count | 200, 401 |
| Jobs | GET | `/api/jobs` | Bearer token; own reports, admin all reports | `page`, `limit` | `{ "jobs": [...], "page": 1, "limit": 10, "total": 0, "activeCount": 0 }` | 200, 400, 401 |
| Jobs | GET | `/api/jobs/:id` | Bearer token; owner/admin | `id` path parameter | `{ "job": {...} }` | 200, 401, 404 |
| Reports | POST | `/api/reports/json` | Bearer token; user/admin | Optional report filters | `{ "job": {...} }` (202) | 202, 400, 401, 429, 503 |
| Reports | POST | `/api/reports/csv` | Bearer token; user/admin | Optional report filters | `{ "job": {...} }` (202) | 202, 400, 401 |
| Reports | POST | `/api/reports/summary` | Bearer token; user/admin | Optional report filters | `{ "job": {...} }` (202) | 202, 400, 401 |
| Reports | GET | `/api/reports/download/:id` | Bearer token; original requester only | Report job `id` | File download | 200, 401, 404, 409 |

Authentication is implemented by `protect` middleware in `src/middleware/auth.js`. There is no standalone `requireRole` use in current route files; task/job/report access is checked in middleware or domain/controller logic.

## Authentication examples

### Register and login

Registration always returns the same neutral response for valid details, whether or not an account already exists; it does not sign in the user. Sign in afterward.

```http
POST /api/auth/register
Content-Type: application/json
```

```json
{
  "name": "Alex Morgan",
  "email": "alex@example.com",
  "password": "replace-with-a-private-password"
}
```

Response (202), regardless of whether an account was created:

```json
{
  "message": "If the account can be created, you may now sign in."
}
```

Passwords must contain 8–72 characters. Names are required and limited to 80 characters. Public input cannot set role or account state.

### Login and current user

`POST /api/auth/login` accepts `email` and `password`, and returns `{ "token", "user" }`. Send the token as `Authorization: Bearer <token>` on protected requests. The Angular client stores the token in local storage and sends it automatically. `/api/auth/logout` returns 204; the client removes the locally stored token.

```http
Authorization: Bearer <JWT>
```

`GET /api/auth/me` returns `{ "user": { "id", "name", "email", "role" } }`. The server verifies HS256 and reloads the active account from MongoDB on protected requests.

## Task API details

### Task object

Fields accepted on create/update:

| Field | Type | Constraints/default |
|---|---|---|
| `title` | string | Required on create; trimmed; 1–150 characters |
| `description` | string | Optional; max 2000; defaults to empty string |
| `status` | string | `Pending`, `In Progress`, or `Completed`; defaults to `Pending` |
| `priority` | string | `Low`, `Medium`, or `High`; defaults to `Medium` |
| `dueDate` | string or null | Valid UTC calendar string `YYYY-MM-DD`; defaults to null |
| `tags` | string array | Up to 20 nonempty strings, max 40 characters each; defaults to `[]` |

The API rejects unknown/protected request fields such as `createdBy`, `assignedTo` (except the dedicated assign endpoint), timestamps and `_id`. Creator is derived from the authenticated account.

### Create task example

```http
POST /api/tasks
Content-Type: application/json
```

```json
{
  "title": "Prepare release checklist",
  "description": "Review the launch criteria",
  "status": "Pending",
  "priority": "High",
  "dueDate": "2026-12-10",
  "tags": ["release", "review"]
}
```

Response (201):

```json
{
  "task": {
    "_id": "665000000000000000000010",
    "title": "Prepare release checklist",
    "description": "Review the launch criteria",
    "status": "Pending",
    "priority": "High",
    "dueDate": "2026-12-10T00:00:00.000Z",
    "tags": ["release", "review"],
    "createdBy": "665000000000000000000001",
    "assignedTo": null,
    "createdAt": "2026-11-24T00:00:00.000Z",
    "updatedAt": "2026-11-24T00:00:00.000Z"
  }
}
```

IDs and timestamps above are illustrative.

### List and filter tasks

Example:

```http
GET /api/tasks?status=Pending&priority=High&tags=release,review&fromDate=2026-12-01&toDate=2026-12-31&sortBy=priority&order=desc&page=1&limit=10
```

Supported query parameters:

| Parameter | Values / behavior |
|---|---|
| `status` | `Pending`, `In Progress`, `Completed` |
| `priority` | `Low`, `Medium`, `High` |
| `search` | Case-insensitive match in title or description; regex metacharacters are escaped |
| `tags` | Comma-separated; matches at least one tag |
| `fromDate`, `toDate` | Valid `YYYY-MM-DD`; both bounds inclusive in UTC |
| `sortBy` | `dueDate`, `priority`, `createdAt`; default `createdAt` |
| `order` | `asc` or `desc`; default `desc` |
| `page` | Positive integer; default `1` |
| `limit` | Integer 1–100; default `10` |

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

Priority sort order is High, Medium, Low for descending. Regular users see tasks they created or are assigned; admins see all.

### Update, status, assign, delete

- `PUT /api/tasks/:id`: owner/admin only; accepts allowed task fields and the task's current `updatedAt` in `If-Match`. Stale or missing versions return HTTP 409.
- `GET /api/tasks/:id/assignees`: owner/admin only; returns active assignment candidates for that task. The general `/api/users` directory is admin-only.
- `PATCH /api/tasks/:id/status`: accepts only `{ "status": "In Progress" }`; task must be visible to caller, so owner/assignee/admin may update.
- `PATCH /api/tasks/:id/assign`: accepts `{ "assignedTo": "<active-user-id>" }` to assign or `{ "assignedTo": null }` to unassign; owner/admin only.
- `DELETE /api/tasks/:id`: owner/admin only; removes every notification linked to the task while preserving its historical activity.

The backend publishes task events after successful writes. Activity and notification processing may happen after the HTTP response.

## Dashboard, activity and notifications

### Dashboard

`GET /api/dashboard` returns:

```json
{
  "total": 12,
  "completed": 4,
  "pending": 3,
  "inProgress": 5,
  "overdue": 1,
  "byPriority": { "Low": 2, "Medium": 6, "High": 4 },
  "byTag": [{ "tag": "release", "count": 5 }],
  "recentActivity": [],
  "unreadNotifications": 2
}
```

Counts are server-scoped to all tasks for admin or owned/assigned tasks for regular users. `byTag` contains the ten most-used tags, with each task counted once per tag. Overdue means incomplete with `dueDate` earlier than today's UTC midnight.

### Activity

`GET /api/activities` returns up to 50 newest records. Regular users receive records whose `visibleTo` includes them; admin receives all. Events are `taskCreated`, `taskUpdated`, `taskAssigned` and `taskCompleted`.

### Notifications

`GET /api/notifications` returns the current user's newest 100 notifications plus `unreadCount`. Notification types include assignment, completion, priority changes, due soon and overdue.

- `PATCH /api/notifications/:id/read`: mark one owned notification as read.
- `PATCH /api/notifications/read-all`: mark all current user's unread notifications as read.

## Jobs and reports

### Job status

`GET /api/jobs?page=1&limit=10` lists report jobs visible to the caller, newest first. `page` defaults to 1 (maximum 1,000,000); `limit` defaults to 10 (maximum 100). Both must be positive integer query strings. The response contains `jobs`, `page`, `limit`, `total`, and `activeCount` (all visible non-terminal report jobs, across pages). `GET /api/jobs/:id` returns one visible report job. Owners see their own report jobs; admins see all report metadata. Internal activity/notification jobs are hidden from both endpoints. Job payloads are omitted and non-admin error details are redacted.

Job response may include `id`, `type`, `ownerId`, `status`, `attempts`, `maxRetries`, `errors`, `createdAt`, `nextRetryAt`, `result`, and terminal error metadata.

Statuses are `pending`, `processing`, `completed` and `failed`. MongoDB persists jobs; workers atomically claim jobs, recover expired leases after restarts, allow two concurrent jobs by default, make up to three retries after the initial attempt, and use 1s/2s/4s backoff. Terminal metadata expires after configurable retention periods (24 hours completed, 7 days failed by default), can be evicted earlier under capacity pressure. Pending, processing and retrying jobs are never evicted. Capacity exhaustion returns HTTP 503. Each user may request at most five reports per rolling hour; generated report files expire after 24 hours and are cleaned hourly. CSV/JSON exports are limited to 50,000 rows and 25 MiB.

Login and registration are limited to 10 requests per IP address per 15 minutes. Configure allowed browser origins through `CLIENT_ORIGIN` (comma-separated); its default is `http://localhost:4200`.

### Request a report

`POST /api/reports/json`, `/api/reports/csv`, or `/api/reports/summary` accepts an optional JSON body with these filter keys only:

```json
{
  "status": "Pending",
  "priority": "High",
  "search": "release",
  "tags": "release,review",
  "fromDate": "2026-12-01",
  "toDate": "2026-12-31"
}
```

An empty body or `{}` means all tasks visible to the caller. Report filters use task list semantics but do not use pagination or sorting. Response is HTTP 202:

```json
{
  "job": {
    "id": "<job-id>",
    "type": "report",
    "status": "pending",
    "attempts": 0,
    "maxRetries": 3
  }
}
```

JSON export is an array of task records; CSV uses a header and formula-protected cells; summary is JSON with `generatedAt`, `total`, and counts by status. Output files are stored under `EXPORT_DIR` or the backend `exports/` directory.

### Download report

`GET /api/reports/download/:id` downloads a completed report. Only the original requester can download it, including when another admin can inspect its job metadata. It returns 409 while the job is incomplete and 404 when inaccessible or the file is absent.

## Error responses

Centralized errors include `message`, `success: false`, `code` and `statusCode`. Common outcomes:

| Status | Example situations |
|---:|---|
| 400 | Invalid task fields, filters, IDs, pagination or JSON |
| 401 | Missing/invalid/expired bearer token or inactive account |
| 403 | Authenticated account lacks operation permission |
| 404 | Resource missing or intentionally hidden from caller |
| 409 | Report not ready |
| 409 | Task changed since it was loaded |
| 413 | Request JSON exceeds the 20 KB parser limit |
| 503 | Common MongoDB connectivity errors or queue-related error |
| 500 | Unexpected internal error |

Exact response messages may differ for direct controller validation responses versus centralized errors.
