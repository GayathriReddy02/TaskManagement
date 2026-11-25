# Taskora Architecture and Onboarding Guide

This guide documents the current source workspace: the Angular frontend, Express backend, MongoDB data model, API integration, setup, and known gaps. It describes implemented behavior, not a proposed design.

## Contents

- [System architecture](#system-architecture)
- [Folder structure](#folder-structure)
- [Frontend architecture](#frontend-architecture)
- [Backend architecture](#backend-architecture)
- [End-to-end workflows](#end-to-end-workflows)
- [Module guide](#module-guide)
- [Database design](#database-design)
- [Roles and permissions](#roles-and-permissions)
- [Configuration and local setup](#configuration-and-local-setup)
- [Error handling and security](#error-handling-and-security)
- [Testing](#testing)
- [Feature status](#feature-status)
- [Future enhancements](#future-enhancements)
- [Troubleshooting](#troubleshooting)

## System architecture

The UI is an Angular 19 single-page application. It sends HTTP requests to the Express API using `/api` paths. During local development, Angular CLI's proxy forwards them to `http://localhost:5000`. The backend validates requests and the JWT, applies task visibility and ownership rules, and uses Mongoose to read or write MongoDB.

Task changes publish events after successful database writes. Event listeners enqueue work in a process-local FIFO queue. A worker handles activity, notification, and report jobs. Reports are written under the configured export directory. The reminder scheduler independently checks task due dates and writes deduplicated notifications.

```mermaid
flowchart LR
    subgraph Client["Browser · Angular 19"]
        Routes[Angular Router]
        Pages[Standalone pages]
        ApiClient[Api service]
        Auth[Auth signal and guards]
        Routes --> Pages
        Pages --> ApiClient
        Auth --> ApiClient
    end
    Proxy[Angular dev proxy /api] --> Express
    ApiClient -->|HTTP + bearer JWT| Proxy
    subgraph Server["Node.js backend"]
        Express[Express app]
        Middleware[Auth and error middleware]
        RoutesBackend[Routes]
        Controllers[Controllers]
        Services[Services and query rules]
        Events[Durable event jobs]
        Queue[MongoDB queue + worker]
        Scheduler[Reminder scheduler]
        Express --> Middleware --> RoutesBackend --> Controllers --> Services
        Controllers --> Events --> Queue
        Scheduler --> Services
    end
    Services --> Mongo[(MongoDB)]
    Queue --> Services
    Queue --> Exports[Private export directory]
```

### Request path

```mermaid
flowchart TD
    UI[Angular page] --> API[API client and interceptor]
    API -->|Send bearer JWT| Router[Express route]
    Router --> Auth[Authentication middleware]
    Auth -->|Verify token and load active user| DB[(MongoDB)]
    Auth -->|Set authenticated user| Ctrl[Controller]
    Ctrl -->|Validate input and authorize| Svc[Service]
    Svc -->|Read or write data| DB
    DB -->|Return result| Svc
    Svc --> Ctrl
    Ctrl -->|JSON response or error| UI
```

## Folder structure

Generated files, dependency directories, and local secret files are intentionally omitted.

```text
TaskManagement/
├── README.md
├── docs/
│   ├── API.md
│   └── ARCHITECTURE.md
├── Server/
│   ├── README.md
│   ├── UPDATE_NOTES.md
│   ├── SPECIFICATION.md
│   ├── package.json
│   ├── package-lock.json
│   ├── server.js
│   ├── .gitignore
│   ├── src/
│   │   ├── app.js
│   │   ├── config/db.js
│   │   ├── controllers/
│   │   │   ├── activityController.js
│   │   │   ├── authController.js
│   │   │   ├── dashboardController.js
│   │   │   ├── notificationController.js
│   │   │   ├── reportController.js
│   │   │   ├── taskController.js
│   │   │   └── userController.js
│   │   ├── errors/AppError.js
│   │   ├── events/eventPayload.js
│   │   ├── examples/
│   │   │   ├── classCallbacks.js
│   │   │   └── promiseConcurrency.js
│   │   ├── jobs/reminderScheduler.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   ├── authRateLimit.js
│   │   │   └── errorHandler.js
│   │   ├── models/
│   │   │   ├── Activity.js
│   │   │   ├── Job.js
│   │   │   ├── Notification.js
│   │   │   ├── QueueState.js
│   │   │   ├── Task.js
│   │   │   └── User.js
│   │   ├── queues/jobQueue.js
│   │   ├── routes/
│   │   │   ├── activityRoutes.js
│   │   │   ├── authRoutes.js
│   │   │   ├── dashboardRoutes.js
│   │   │   ├── jobRoutes.js
│   │   │   ├── notificationRoutes.js
│   │   │   ├── reportRoutes.js
│   │   │   ├── taskRoutes.js
│   │   │   └── userRoutes.js
│   │   ├── services/
│   │   │   ├── activityService.js
│   │   │   ├── dashboardService.js
│   │   │   ├── exportService.js
│   │   │   ├── jobService.js
│   │   │   ├── notificationService.js
│   │   │   └── taskService.js
│   │   ├── utils/
│   │   │   ├── asyncHandler.js
│   │   │   ├── csvUtils.js
│   │   │   └── retry.js
│   │   └── workers/
│   │       ├── jobHandlers.js
│   │       └── queueWorker.js
│   └── tests/
│       ├── api.test.js
│       ├── core.test.js
│       ├── jobRetention.test.js
│       └── securityLimits.test.js
└── Client/
    ├── README.md
    ├── angular.json
    ├── package.json
    ├── package-lock.json
    ├── proxy.conf.json
    ├── tsconfig.json
    ├── tsconfig.app.json
    └── src/
        ├── index.html
        ├── main.ts
        ├── styles.css
        └── app/
            ├── routes.ts
            ├── core/
            │   ├── api.ts
            │   └── models.ts
            └── pages/
                ├── auth.ts
                ├── dashboard.ts
                ├── feeds.ts
                ├── reports.ts
                ├── shell.ts
                └── tasks.ts
```

### Important root and configuration files

- [`README.md`](../README.md): project overview and quick start.
- [`Server/server.js`](../Server/server.js): validates startup configuration, connects to MongoDB, initializes indexes, starts listeners, worker, scheduler and HTTP server.
- [`Server/src/app.js`](../Server/src/app.js): configures CORS, JSON parsing, API mount points, 404 handling and error middleware.
- [`Server/package.json`](../Server/package.json): backend scripts and direct dependencies.
- [`Client/angular.json`](../Client/angular.json): Angular CLI build and serve targets.
- [`Client/proxy.conf.json`](../Client/proxy.conf.json): local `/api` proxy target.
- [`Client/src/main.ts`](../Client/src/main.ts): standalone Angular bootstrap, router, HTTP interceptor, animations and PrimeNG Aura preset.

## Frontend architecture

The client uses standalone Angular components and lazy-loaded route components. There is no separate `components/`, `services/`, or `guards/` folder; corresponding functionality lives in the `pages/` and `core/` files listed below. No separate state-management library is present.

### Routes and layout

[`routes.ts`](../Client/src/app/routes.ts) defines:

- Public `/login` and `/register`.
- Protected shell routes for dashboards, tasks, notifications, activity and reports.
- Admin-only `/admin/dashboard` and `/admin/team`.
- Lazy-loaded page components via `loadComponent`.
- A default redirect to the role-specific dashboard and a wildcard redirect to login.

[`shell.ts`](../Client/src/app/pages/shell.ts) provides the sidebar, top bar, role indicator, theme toggle, responsive navigation and sign-out.

### Pages and their responsibilities

| Page/module | File | Responsibility |
|---|---|---|
| Authentication | [`auth.ts`](../Client/src/app/pages/auth.ts) | Register and sign in with email/password |
| Dashboard | [`dashboard.ts`](../Client/src/app/pages/dashboard.ts) | Render server-returned task counts, priority distribution, completion visualization and recent activity; same page for admin and user scopes |
| Tasks | [`tasks.ts`](../Client/src/app/pages/tasks.ts) | Task listing, filters, sorting, pagination, details dialog and create/edit/status/assign/delete operations |
| Notifications | [`feeds.ts`](../Client/src/app/pages/feeds.ts) | Notification list and mark-read actions; polls every 15 seconds while mounted |
| Activity | [`feeds.ts`](../Client/src/app/pages/feeds.ts) | Display latest server-authorized activity |
| Team directory | Tasks page and `GET /api/tasks/:id/assignees` | Task-scoped assignee lookup; general directory is admin-only |
| Reports and jobs | [`reports.ts`](../Client/src/app/pages/reports.ts) | Start report jobs, poll paginated report metadata every five seconds only while visible report jobs are active, and download the requester's completed export |

### API client, state, guards and models

- [`api.ts`](../Client/src/app/core/api.ts) defines `Api`, a typed wrapper around Angular `HttpClient`, with methods for auth, dashboard, tasks, users, activity, notifications, jobs and reports.
- `Auth` holds the signed-in user in an Angular signal, restores it through `/auth/me`, and handles logout. Existing bearer tokens are stored in local storage.
- The functional `authInterceptor` attaches the bearer JWT to API requests and clears the local session only after an explicit 401.
- The functional `signedIn` and `roleGuard` route guards restore/check the session and role. They are user-experience controls, not substitutes for backend authorization.
- [`models.ts`](../Client/src/app/core/models.ts) contains TypeScript interfaces and enum-like string unions matching backend payloads.
- No shared component library, separate frontend validator module, or dedicated state store exists in this source tree.

### UI and styles

- PrimeNG 19 components are used for buttons, forms, password inputs, cards, tables, dialogs, tags, paginator, progress bars and selects.
- PrimeNG Aura is configured in `main.ts`; PrimeIcons are imported by `styles.css`.
- `styles.css` defines the responsive layout, light/dark CSS variables, workspace pages and simple CSS-generated completion visualization.
- No charting library or frontend test script is configured in `package.json`.

### Frontend API flow

Page components call `Api` methods and keep view-specific data and loading/error state locally. `HttpClient` serializes JSON and returns observables; `Api` exposes promises using `firstValueFrom`. The interceptor attaches the session token, the development proxy forwards the call, and the page renders the returned typed response. Backend errors are converted to display text by `errorText`.

## Backend architecture

### Layer responsibilities

| Layer | Location | Responsibility |
|---|---|---|
| Routes | [`src/routes/`](../Server/src/routes/) | Map HTTP verbs/paths to handlers and apply `protect` to private endpoints |
| Controllers | [`src/controllers/`](../Server/src/controllers/) | Validate request shape, enforce resource-level permissions, invoke services, publish events and form responses |
| Services | [`src/services/`](../Server/src/services/) | Task filters/queries, dashboard aggregation, activity and notification logic, job visibility and export generation |
| Models | [`src/models/`](../Server/src/models/) | Define Mongoose schemas, validators, references, timestamps and indexes |
| Middleware | [`src/middleware/`](../Server/src/middleware/) | Verify bearer JWT/reload active user; normalize errors into API responses |
| Utilities | [`src/utils/`](../Server/src/utils/) | Promise error forwarding, retry policy and CSV cell escaping |
| Configuration | [`src/config/db.js`](../Server/src/config/db.js) | Connect Mongoose to `MONGO_URI` |
| Events | [`src/events/`](../Server/src/events/) | Build compact task-event payloads |
| Background processing | [`src/queues/`](../Server/src/queues/) and [`src/workers/`](../Server/src/workers/) | Persist jobs in MongoDB; atomically claim, lease and retry handlers |
| Scheduler | [`src/jobs/reminderScheduler.js`](../Server/src/jobs/reminderScheduler.js) | Periodically scan incomplete tasks for due-tomorrow and overdue reminders |
| Tests | [`tests/`](../Server/tests/) | Unit-test retry/queue/CSV/error behavior and HTTP routes |

There is no standalone validators directory. `validateTask` and `validateListParams` in `taskService.js`, plus controller checks, implement validation.

### Selected backend module flows

- **Authentication:** `authRoutes` → `authController` → `User` model; bcrypt verifies password login. `auth.js` verifies tokens and reloads an active user per protected request.
- **Task operation:** `taskRoutes` → `taskController` → validation and authorization → `taskService` → `Task`/`User` model. Task mutations and activity/notification jobs are separate writes; a later failure does not roll back an earlier write.
- **Dashboard:** `dashboardRoutes` → `dashboardController` → `dashboardService`; parallel MongoDB counts/aggregations are scoped to the current user unless admin.
- **Activity/notification:** task mutation → durable `JobQueue` → `QueueWorker` → handler → activity/notification service → Mongoose model. Event IDs and notification dedupe keys make retried writes idempotent.
- **Report:** report route/controller validates filters and enqueues a report job. `exportService` reloads the requester, applies the same visibility/filter query builder, streams rows or aggregates a summary, writes a temporary file and renames it when complete.
- **Error:** rejected async handler → `asyncHandler` → Express `next(err)` → `errorHandler`; known custom, Mongoose, JSON parser and database errors receive mapped status/code/message.

### Task event sequence

```mermaid
sequenceDiagram
    participant C as Task controller
    participant DB as MongoDB
    participant E as Outbox jobs
    participant Q as JobQueue
    participant W as QueueWorker
    participant S as Activity/Notification service
    C->>DB: Save task
    C->>E: Insert activity/notification jobs separately
    DB-->>C: Individual writes complete
    Q-->>W: ready event
    W->>S: Process activity and/or notification job
    S->>DB: Idempotent insert/upsert
    Note over E,W: Side effects may complete after the HTTP response; persisted jobs recover after restart.
```

## End-to-end workflows

### Registration, login and protected navigation

1. The auth page submits email/password through `Api`; registration always assigns `user`.
2. The backend hashes new passwords with bcrypt and compares submitted passwords during login.
3. Successful login returns a bearer JWT and public user.
4. `Auth.accept` updates the user signal and navigates to `/dashboard` or `/admin/dashboard`.
5. On reload, `signedIn` calls `/api/auth/me`. The backend verifies the bearer JWT and confirms the account is active.
6. Route guards check roles for admin pages. Protected backend endpoints independently enforce authorization.

### Task creation and assignment

1. The task page submits only the permitted task fields.
2. The backend validates title, description, enums, dates and tags; `createdBy` comes from the authenticated user rather than request input.
3. Task ownership and assignment determine subsequent visibility.
4. The owner/admin may assign an active user; assignee receives an asynchronous assignment notification unless they were the actor.
5. Task event jobs add activity and relevant notification records.

### Search and list flow

The UI submits status, priority, search, tags, due-date bounds, sort, order, page and limit to `GET /api/tasks`. Backend validation builds a MongoDB match with mandatory visibility scope, escapes the search string, treats the `toDate` as inclusive, and computes results/page metadata. Matching any supplied tag qualifies.

### Report generation

```mermaid
flowchart TD
    A[Reports page submits filters + format] --> B[Submit report as JSON, CSV, or summary]
    B --> C[Validate filter keys and values]
    C --> D[Create MongoDB report job]
    D --> E[Return HTTP 202 and job metadata]
    D --> F[Worker processes report]
    F --> G[Reload active requester and apply task visibility]
    G --> H{Requested format}
    H -->|JSON or CSV| I[Stream MongoDB cursor to temporary file]
    H -->|Summary| J[Aggregate status counts]
    I --> K[Rename temporary file]
    J --> K
    K --> L[Mark job completed]
    L --> M[Frontend polls GET /api/jobs]
    M --> N[Requester downloads via report job ID]
```

### Reminders

The scheduler runs an initial check after startup and then repeats every `REMINDER_INTERVAL_MINUTES`. It finds incomplete tasks due before the UTC day after tomorrow, emits due-tomorrow or overdue notifications to the creator and assignee, and uses a unique dedupe key per recipient/task/type/due date.

## Module guide

| Module | Key files | Responsibility, behavior and dependencies |
|---|---|---|
| Auth | `src/controllers/authController.js`, `src/routes/authRoutes.js`, `src/middleware/auth.js`, `src/models/User.js`; frontend `core/api.ts`, `pages/auth.ts`, `pages/shell.ts` | Bcrypt password registration/login, logout and protected session restoration |
| Users/team | `src/controllers/userController.js`, `src/routes/userRoutes.js`; frontend `pages/tasks.ts` | Admin-only general directory; task owner/admin receive active assignee candidates from a task-scoped endpoint |
| Tasks | `src/controllers/taskController.js`, `src/services/taskService.js`, `src/routes/taskRoutes.js`, `src/models/Task.js`; frontend `pages/tasks.ts` | Ownership/assignee checks; field validation; stale-edit detection; list filtering, MongoDB aggregation pagination, sorting and CRUD/status/assignment |
| Dashboard | `src/controllers/dashboardController.js`, `src/services/dashboardService.js`, `src/routes/dashboardRoutes.js`; frontend `pages/dashboard.ts` | Counts total/completed/pending/in-progress/overdue tasks, priority distribution, recent activity and unread notifications |
| Activity | `src/controllers/activityController.js`, `src/services/activityService.js`, `src/models/Activity.js`; frontend `pages/feeds.ts` | Writes deduplicated event records asynchronously; returns latest 50 records visible to the caller or all for admin |
| Notifications | `src/controllers/notificationController.js`, `src/services/notificationService.js`, `src/models/Notification.js`; frontend `pages/feeds.ts` | Creates event/reminder notices, deduplicates, lists current user's notices, marks one or all read |
| Jobs | `src/queues/jobQueue.js`, `src/workers/queueWorker.js`, `src/workers/jobHandlers.js`, `src/services/jobService.js`, `src/routes/jobRoutes.js`; frontend `pages/reports.ts` | Persists work status/errors/results in MongoDB, recovers expired leases, retries eligible failures, exposes paginated owner/admin report metadata and hides internal jobs |
| Reports | `src/controllers/reportController.js`, `src/services/exportService.js`, `src/routes/reportRoutes.js`, `src/utils/csvUtils.js`; frontend `pages/reports.ts` | Validates and schedules JSON/CSV/summary exports, limits row/byte sizes, streams files, protects CSV formula values and restricts downloads to requester |
| Errors/utilities | `src/errors/AppError.js`, `src/middleware/errorHandler.js`, `src/utils/asyncHandler.js`, `src/utils/retry.js` | Typed HTTP errors, Express async propagation, centralized mapping and exponential retry |
| Learning examples | `src/examples/classCallbacks.js`, `src/examples/promiseConcurrency.js` | Standalone Node demonstrations of callback `this` binding and Promise concurrency combinators |

Input/output details and response examples are in the [API reference](API.md).

## Database design

MongoDB stores four Mongoose collections. ObjectId references are logical relations; the application does not configure automatic cascade deletion.

```mermaid
erDiagram
    USER ||--o{ TASK : creates
    USER o|--o{ TASK : assigned_to
    TASK ||--o{ ACTIVITY : has
    USER ||--o{ ACTIVITY : acts
    USER ||--o{ NOTIFICATION : receives
    TASK o|--o{ NOTIFICATION : relates_to
    USER {
        ObjectId _id
        String name
        String email UK
        String password
        String role
        Boolean isActive
        Date createdAt
        Date updatedAt
    }
    TASK {
        ObjectId _id
        String title
        String description
        String status
        String priority
        Date dueDate
        String[] tags
        ObjectId createdBy FK
        ObjectId assignedTo FK
        Date createdAt
        Date updatedAt
    }
    ACTIVITY {
        ObjectId _id
        String eventId UK
        ObjectId taskId FK
        ObjectId actorId FK
        String event
        String message
        Mixed details
        ObjectId[] visibleTo
        Date createdAt
        Date updatedAt
    }
    NOTIFICATION {
        ObjectId _id
        ObjectId userId FK
        ObjectId taskId FK
        String type
        String message
        Boolean isRead
        String dedupeKey
        Date createdAt
        Date updatedAt
    }
```

| Model | Important constraints and defaults | Indexes |
|---|---|---|
| `User` | Name required/trimmed/max 80; email required/unique/lowercase/trimmed; required bcrypt password hash hidden from normal queries; role is `user` or `admin`, default `user`; `isActive` defaults true; timestamps | Unique email |
| `Task` | Title required/trimmed/max 150; description default empty/max 2000; status defaults `Pending`; priority defaults `Medium`; due date defaults null; tags default empty; creator required; assignee optional; timestamps | `{ createdBy: 1, createdAt: -1 }`, `{ assignedTo: 1, createdAt: -1 }`, `{ status: 1, dueDate: 1 }`, `{ tags: 1, createdAt: -1 }` |
| `Activity` | Event enum; task, actor and message required; details defaults `{}`; visible user IDs; timestamps | Sparse unique `eventId`; `{ visibleTo: 1, createdAt: -1 }` |
| `Notification` | Type enum; recipient/message/dedupe key required; `isRead` defaults false; task optional; timestamps | Unique `{ userId: 1, dedupeKey: 1 }`; `{ userId: 1, createdAt: -1 }` |

Task field and list-filter validation is performed in `taskService.js` and controllers in addition to schema-level checks. Activity and notification indexes are explicitly initialized during server startup.

## Roles and permissions

The backend enforces role and ownership in middleware/controllers/services. Public registration cannot select a role, and there is no public admin-creation or user-mutation endpoint.

| Capability | Unauthenticated | Regular user | Admin |
|---|---:|---:|---:|
| Register/login | Yes | Yes | Yes |
| View own or assigned tasks | No | Yes | Yes |
| View all tasks | No | No | Yes |
| Create task | No | Yes | Yes |
| Edit/delete/assign a task | No | Own tasks only | Yes |
| Change task status | No | Own or assigned tasks | Yes |
| Read activity | No | Visible-to user records | All recent records |
| Read/mark notifications | No | Own notifications | Own notifications |
| Read general user directory | No | No | Yes |
| Look up task assignees | No | Owner/admin only | Yes |
| View job metadata | No | Own jobs | All job metadata |
| Download report | No | Own completed reports | Only reports requested by that admin |
| Create/manage users or promote role | No | No | No API implemented |

Task routes use `protect` for authentication, then task-level checks. Admin access to all data does not grant access to another user's notification inbox or report file.

### JWT flow and restrictions

`authController.js` hashes registration passwords with bcrypt cost 12 and compares them on login. It signs HS256 tokens with `sub = user.id` and configured expiry. `middleware/auth.js` verifies `Authorization: Bearer <token>` and reloads the active user on each protected request. The Angular client stores and sends the bearer token. Passwords are visible to the browser owner in DevTools; use HTTPS in production.

## Configuration and local setup

### Prerequisites and commands

- Node.js 20+ is supported by the backend; Node.js 22+ is recommended for the Angular 19 dependency pairing.
- npm and a MongoDB server.
- No repository-root `package.json`; install and run dependencies separately in each application directory.

Backend PowerShell:

```powershell
cd Server
copy .env.example .env
npm.cmd install
npm.cmd run dev
```

Frontend PowerShell (separate terminal):

```powershell
cd Client
npm.cmd install
npm.cmd start
```

Configure the copied, ignored `Server\.env` file. MongoDB can run standalone; no replica set is required. Task and event-job writes are not atomic. Example values below are placeholders:

```dotenv
MONGO_URI=mongodb://127.0.0.1:27017/task_management
JWT_SECRET=<random-secret-of-at-least-32-characters>
JWT_EXPIRES_IN=1d
PORT=5000
REMINDER_INTERVAL_MINUTES=60
CLIENT_ORIGIN=http://localhost:4200
# Optional, choose a private location: EXPORT_DIR=C:\private\taskora-exports
```

| Variable | Required | Behavior |
|---|---:|---|
| `MONGO_URI` | Yes for DB-backed startup | Mongoose connection URI |
| `JWT_SECRET` | Yes | Startup requires at least 32 characters; keep private |
| `JWT_EXPIRES_IN` | No | JWT lifetime; default `1d` |
| `PORT` | No | API port; default `5000` |
| `REMINDER_INTERVAL_MINUTES` | No | Reminder interval; default `60`, minimum `1` |
| `CLIENT_ORIGIN` | No | Exact allowed browser origin; default `http://localhost:4200` |
| `EXPORT_DIR` | No | Report destination; default `Server/exports`; use a non-public directory |

The Angular app has no `.env` file or frontend secret. [`proxy.conf.json`](../Client/proxy.conf.json) targets port 5000. The backend root endpoint is `http://localhost:5000/`; the app opens at `http://localhost:4200/login`.

### Tests and build

```powershell
# In Server
npm.cmd test
npm.cmd run test:integration

# In Client
npm.cmd run build
```

The backend tests do not require MongoDB for their current scenarios. Do not direct DB-backed tests toward production data.

## Error handling and security

- `asyncHandler` forwards rejected controller promises to Express error middleware.
- `AppError.js` defines `AppError`, `ValidationError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `DatabaseError` and `QueueError`.
- `errorHandler.js` maps custom, Mongoose validation/cast, malformed/oversized JSON, duplicate-key and common MongoDB connection errors. Unknown errors return generic 500 messages and are logged.
- Input checks reject unknown/protected task fields, validate date formats/enums/tags/pagination, and cap JSON body size at 20 KB.
- Search terms are escaped before use in a MongoDB regular expression.
- CSV output prefixes potentially executable spreadsheet formula values.
- bcrypt protects stored password values; JWT verification enforces HS256 and reloads active user state.
- Helmet security headers are enabled. CORS allows configured `CLIENT_ORIGIN` values, defaulting to `http://localhost:4200`.
- Login and registration endpoints are limited to 10 requests per IP address per 15 minutes. The limiter uses an in-memory store.
- Frontend route guards and the UI are not security boundaries. The backend enforces ownership and role checks.
- Bearer-token authentication remains compatible with existing client sessions.
- Export files should be stored outside public static directories. Files expire after 24 hours and are cleaned hourly; downloads reject expired files.
- Report requests are limited to five per user per rolling hour using process-local counters.

This is not a production-hardened system. Configure production CORS, TLS, request throttling, secret management and operational controls before deployment.

## Testing

Backend uses `node:test` and `node:assert/strict`.

- `tests/core.test.js`: retry backoff, permanent/non-retryable failures, worker recovery and concurrency, CSV escaping/formula protection, custom error metadata.
- `tests/api.test.js`: health endpoint, centralized 404, rejection of unauthenticated protected APIs, invalid JSON.
- `npm test` executes `node --test tests/*.test.js`.
- `npm run test:integration` executes `node --test tests/api.test.js`; these API tests use an ephemeral HTTP server and do not test a live MongoDB integration.
- No frontend test script or frontend test files are present.
- Missing coverage includes MongoDB-backed registration/CRUD/role authorization, report generation/download against an isolated DB, reminder timing, Angular component/route behavior and browser end-to-end flows.

## Feature status

Status reflects implementation in the current workspace, not a claim that every production concern is complete.

| Feature | Status | Related modules | Notes |
|---|---|---|---|
| Account registration and login | Implemented | Backend auth controller/model/middleware; frontend auth page | Regular-user registration only |
| Role-scoped dashboards | Implemented | Dashboard service/controller; frontend dashboard/routes | Uses one dashboard component with backend-scoped counts |
| Task CRUD and assignment | Implemented | Task routes/controller/service/model; frontend tasks page | Owner/admin edits/deletes/assigns; assignee can change status; stale edits conflict |
| Filtering, sorting, pagination | Implemented | `taskService.js`; frontend tasks page | Server-side; filters include text/tags/date/status/priority |
| Activity feed | Implemented | Event services/model; frontend feeds | Durable asynchronous processing; deletion retains activity history |
| Notifications and reminders | Implemented | Notification service/model; reminder scheduler; frontend feeds | Deduplicated writes; reminder checks are timer based |
| MongoDB job queue/retries | Implemented | Queue, worker and job handlers | Task/job writes are not atomic; capacity serialization is process-local |
| JSON/CSV/summary reports | Implemented with operational limits | Report controller/export service; frontend reports | 50,000-row/25 MiB caps, CSV formula protection and requester-only download |
| Admin team directory | Implemented, read-only | User controller; frontend team page | No user-management mutation API |
| Frontend unit/e2e tests | Not implemented | — | No frontend test command configured |
| Auth rate limiting, restrictive CORS and Helmet | Implemented | Auth middleware, `app.js` | In-memory IP limiter; configure `CLIENT_ORIGIN` |

## Future enhancements

These are recommendations, not current features:

- Use shared rate-limit and export-quota stores for multi-process deployments, and revoke export access when permissions change.
- Configure HTTPS, shared rate-limit/quota stores for multi-process deployments, broader API rate limits, and operational security controls.
- Add request correlation IDs, structured logs, metrics, tracing, health/readiness endpoints and alerting.
- Add MongoDB-backed integration tests with isolated test databases and frontend unit/e2e coverage.
- Add schema/API contract validation shared between client and server, plus automated API documentation generation.
- Add user administration through a trusted, audited admin-only workflow if business needs require it.
- Consider frontend pagination and list refresh behavior under large datasets, accessibility audits and more complete automated UI tests.
- Document and automate production deployment, environment/secrets provisioning, backups and database migrations/index management.

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---|---|---|
| Backend exits with JWT secret error | `JWT_SECRET` is absent or shorter than 32 characters | Set a private random secret in backend `.env`; do not commit it |
| Backend cannot connect to MongoDB | MongoDB is stopped or `MONGO_URI` is wrong | Start MongoDB and verify the URI/database access |
| Frontend shows “Cannot connect to backend” | API is stopped or proxy points at wrong port | Start backend on port 5000 or update `proxy.conf.json`, then restart Angular |
| Protected request returns 401 | Missing/invalid/expired bearer token or inactive account | Sign in again and verify backend account status |
| Admin page redirects to user dashboard/login | Account role is not `admin` or the session cannot restore | Use an admin account provisioned through a trusted workflow |
| Report stays pending/failed | Worker not running, job handler error, MongoDB issue, or export path permission problem | Inspect backend logs and job metadata; verify `EXPORT_DIR` is writable |
| Download returns not ready or not found | Job has not completed, was created by another user, or its retained metadata expired | Poll the job while backend is running; download using the original requester session |
| `npm` command is blocked in PowerShell | Execution policy blocks the npm PowerShell shim | Use `npm.cmd` as shown in the setup commands |
| Angular build reports dependency/version issues | Incompatible local Node version or incomplete dependency install | Use the recommended Node 22 version and run `npm.cmd install` inside the frontend |

