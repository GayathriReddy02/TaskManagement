# Taskora API Reference

The API is served by the Express backend. Prefix endpoints with `http://localhost:5000` for local calls. The Angular development proxy forwards `/api` to the backend.

## Conventions

- JSON request and response bodies unless noted.
- Protected routes require `Authorization: Bearer <JWT>`.
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
| Auth | POST | `/api/auth/register` | Public | `name`, `email`, `password` | `{ "user", "token" }` (201) | 201, 400, 409 |
| Auth | POST | `/api/auth/login` | Public | `email`, `password` | `{ "user", "token" }` | 200, 400, 401 |
| Auth | GET | `/api/auth/me` | Bearer JWT; active user | — | `{ "user" }` | 200, 401 |
| Users | GET | `/api/users` | Bearer JWT; user/admin | — | `{ "users": [{ "_id", "name" }] }` | 200, 401 |
| Tasks | POST | `/api/tasks` | Bearer JWT; user/admin | Task fields listed below | `{ "task" }` (201) | 201, 400, 401 |
| Tasks | GET | `/api/tasks` | Bearer JWT; user/admin | Filter, sort and pagination query | `{ "tasks", "total", "page", "limit", "totalPages" }` | 200, 400, 401 |
| Tasks | GET | `/api/tasks/:id` | Bearer JWT; visible task | `id` path parameter | `{ "task" }` | 200, 400, 401, 404 |
| Tasks | PUT | `/api/tasks/:id` | Bearer JWT; owner/admin | Allowed task fields | `{ "task" }` | 200, 400, 401, 403, 404 |
| Tasks | PATCH | `/api/tasks/:id/status` | Bearer JWT; owner/assignee/admin | `{ "status" }` | `{ "task" }` | 200, 400, 401, 403, 404 |
| Tasks | PATCH | `/api/tasks/:id/assign` | Bearer JWT; owner/admin | `{ "assignedTo": "userId" }` | `{ "task" }` | 200, 400, 401, 403, 404 |
| Tasks | DELETE | `/api/tasks/:id` | Bearer JWT; owner/admin | `id` path parameter | `{ "message": "Task deleted" }` | 200, 400, 401, 403, 404 |
| Activity | GET | `/api/activities` | Bearer JWT; user/admin | — | `{ "activities": [...] }` (max 50) | 200, 401 |
| Notifications | GET | `/api/notifications` | Bearer JWT; user/admin | — | `{ "notifications": [...], "unreadCount": number }` | 200, 401 |
| Notifications | PATCH | `/api/notifications/:id/read` | Bearer JWT; notification owner | `id` path parameter | `{ "notification": {...} }` | 200, 400, 401, 404 |
| Notifications | PATCH | `/api/notifications/read-all` | Bearer JWT; current user | — | `{ "updated": number }` | 200, 401 |
| Dashboard | GET | `/api/dashboard` | Bearer JWT; user/admin | — | Counts, priority distribution, recent activity and unread count | 200, 401 |
| Jobs | GET | `/api/jobs` | Bearer JWT; own jobs, admin all | — | `{ "jobs": [...] }` | 200, 401 |
| Jobs | GET | `/api/jobs/:id` | Bearer JWT; owner/admin | `id` path parameter | `{ "job": {...} }` | 200, 401, 404 |
| Reports | POST | `/api/reports/json` | Bearer JWT; user/admin, scoped tasks | Optional report filters | `{ "job": {...} }` (202) | 202, 400, 401 |
| Reports | POST | `/api/reports/csv` | Bearer JWT; user/admin, scoped tasks | Optional report filters | `{ "job": {...} }` (202) | 202, 400, 401 |
| Reports | POST | `/api/reports/summary` | Bearer JWT; user/admin, scoped tasks | Optional report filters | `{ "job": {...} }` (202) | 202, 400, 401 |
| Reports | GET | `/api/reports/download/:id` | Bearer JWT; original requester only | Report job `id` | File download | 200, 401, 404, 409 |

Authentication is implemented by `protect` middleware in `src/middleware/auth.js`. There is no standalone `requireRole` use in current route files; task/job/report access is checked in middleware or domain/controller logic.

## Authentication examples

### Register

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

Example response (201; token is illustrative, not a real credential):

```json
{
  "user": {
    "id": "665000000000000000000001",
    "name": "Alex Morgan",
    "email": "alex@example.com",
    "role": "user"
  },
  "token": "<JWT>"
}
```

Passwords must contain 8–72 characters. Names are required and limited to 80 characters. Public input cannot set role or account state.

### Login and current user

`POST /api/auth/login` accepts `email` and `password`, and returns the same `{ "user", "token" }` structure. Use the returned token on protected routes:

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
Authorization: Bearer <JWT>
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
Authorization: Bearer <JWT>
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

- `PUT /api/tasks/:id`: owner/admin only; accepts allowed task fields.
- `PATCH /api/tasks/:id/status`: accepts only `{ "status": "In Progress" }`; task must be visible to caller, so owner/assignee/admin may update.
- `PATCH /api/tasks/:id/assign`: accepts only `{ "assignedTo": "<active-user-id>" }`; owner/admin only.
- `DELETE /api/tasks/:id`: owner/admin only.

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
  "recentActivity": [],
  "unreadNotifications": 2
}
```

Counts are server-scoped to all tasks for admin or owned/assigned tasks for regular users. Overdue means incomplete with `dueDate` earlier than today's UTC midnight.

### Activity

`GET /api/activities` returns up to 50 newest records. Regular users receive records whose `visibleTo` includes them; admin receives all. Events are `taskCreated`, `taskUpdated`, `taskAssigned` and `taskCompleted`.

### Notifications

`GET /api/notifications` returns the current user's newest 100 notifications plus `unreadCount`. Notification types include assignment, completion, priority changes, due soon and overdue.

- `PATCH /api/notifications/:id/read`: mark one owned notification as read.
- `PATCH /api/notifications/read-all`: mark all current user's unread notifications as read.

## Jobs and reports

### Job status

`GET /api/jobs` lists jobs visible to caller. `GET /api/jobs/:id` returns one visible job. Owners see their jobs; admins see all metadata. Job payloads are omitted and non-admin error details are redacted.

Job response may include `id`, `type`, `ownerId`, `status`, `attempts`, `maxRetries`, `errors`, `createdAt`, `nextRetryAt`, `result`, and terminal error metadata.

Statuses are `pending`, `processing`, `completed` and `failed`. The in-memory worker allows two concurrent jobs by default, makes up to three retries after the initial attempt, and uses 1s/2s/4s backoff. Job metadata is lost when the process restarts.

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
| 401 | Missing/invalid/expired token or inactive account |
| 403 | Authenticated account lacks operation permission |
| 404 | Resource missing or intentionally hidden from caller |
| 409 | Duplicate email or report not ready |
| 413 | Request JSON exceeds the 20 KB parser limit |
| 503 | Common MongoDB connectivity errors or queue-related error |
| 500 | Unexpected internal error |

Exact response messages may differ for direct controller validation responses versus centralized errors.
