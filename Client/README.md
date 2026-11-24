# Taskora — Angular + PrimeNG frontend

Frontend only. Built against the actual `task_management_backend(1).zip` source and the 12-milestone learning plan. No backend files or secrets are included or modified. Modern Angular 19 standalone TypeScript components (not legacy AngularJS 1.x), PrimeNG 19 with Aura, PrimeIcons, RxJS, CSS and Angular Router. Node 22.x recommended for this version pairing.

## Run on Windows

1. Keep your existing backend folder unchanged. Start MongoDB and the existing backend using `npm.cmd run dev` in its own terminal. It should listen at `http://localhost:5000`.
2. Extract this ZIP beside your backend. Open `taskora-angular-frontend` in a second terminal.
3. Run `npm.cmd install` then `npm.cmd start`.
4. Open `http://localhost:4200/login`. The Angular development proxy sends `/api` to port 5000. If your backend uses another port, change `proxy.conf.json` and restart Angular. No frontend .env or JWT secret is needed.
5. Run `npm.cmd run build` to check full Angular compilation. For deployment, configure a reverse proxy for `/api` and SPA fallback to `index.html`; do not expose JWT secrets or serve backend exports publicly.

## Authentication and permissions

Registration validates name/email/password and returns a neutral response; sign in afterward. Normal login uses backend role: `/admin/dashboard` or `/dashboard`. Public registration cannot create admins; use an already authorized admin account provisioned by your trusted backend/database administrator. There is no admin self-registration or user-management mutation endpoint. Login returns a bearer JWT that the client stores in local storage and sends in the `Authorization` header; `/auth/me` restores the session after reload. Explicit 401 responses clear the local session; network and server errors do not. Backend authorization remains authoritative, and login/registration are rate-limited.

## Feature / API mapping

All endpoint paths below are prefixed by `/api`. The browser sends the bearer token in the `Authorization` header; no CSRF token is required.

| Screen | Actual backend contract |
|---|---|
| Register | POST /auth/register `{name,email,password}` -> neutral `{message}`; sign in afterward |
| Login | POST /auth/login `{email,password}` -> `{token,user}` |
| Session | GET /auth/me -> `{user}` |
| Admin & user dashboard | GET /dashboard -> `total,completed,pending,inProgress,overdue,byPriority,recentActivity,unreadNotifications` (server-scoped) |
| Task list | GET /tasks -> `{tasks,total,page,limit,totalPages}` |
| Task details | GET /tasks/:id -> `{task}` |
| Create | POST /tasks with `title,description,status,priority,dueDate,tags` |
| Edit | PUT /tasks/:id with same permitted fields and `If-Match: "<updatedAt>"`; stale edits return 409 |
| Update status | PATCH /tasks/:id/status `{status}` |
| Assign / unassign | PATCH /tasks/:id/assign `{assignedTo}` or `{assignedTo:null}` |
| Delete | DELETE /tasks/:id |
| Team directory | GET /users -> admin-only `{users}` |
| Task assignee lookup | GET /tasks/:id/assignees -> owner/admin-only active users |
| Activity | GET /activities -> `{activities}` (latest 50) |
| Notifications | GET /notifications -> `{notifications,unreadCount}`; PATCH /notifications/:id/read; PATCH /notifications/read-all |
| Reports | POST /reports/json, /reports/csv, /reports/summary -> `{job}` (202) |
| Background jobs | GET /jobs -> `{jobs}`; automatic polling every 5 seconds on report screen |
| Download | GET /reports/download/:id -> blob; only job owner can download completed report |

Task enums exactly match backend: `Pending`, `In Progress`, `Completed`; `Low`, `Medium`, `High`. Dates sent as UTC calendar strings `YYYY-MM-DD` or null. Filters send `search,status,priority,tags,fromDate,toDate,sortBy,order,page,limit`; pagination is server-side. Report filter body excludes pagination and sorting. Tags are comma-separated for filters and arrays for writes. Users see owned or assigned tasks. Owner/admin may edit/assign/delete; assignee may change status. Task deletion removes related notifications for all recipients but preserves activity history. Admin sees all tasks/jobs/activity, but can only download own reports and see own notifications. Reminder notifications appear in the inbox; no manual reminder control API exists. No fabricated dashboard metrics, no fake manual retry or user CRUD buttons. Jobs are durable across server restarts. CSV/JSON exports are limited to 50,000 rows and 25 MiB. Milestones 11–12 are backend architecture/testing, not separate frontend pages.

## Local verification checklist

- Register a user and verify user dashboard; reload, verify session; sign out.
- Login with a pre-provisioned admin, verify admin dashboard and team directory. Attempt `/admin/dashboard` as user and confirm redirect.
- Create task; filter, search, sort, paginate; edit, assign, update status, delete. Login as assignee and check only authorized operations.
- Check activity and notification screens after worker runs. Mark one and all read.
- Generate CSV/JSON/summary report, check job status and download when completed. Admin should not see download action on another user's report.
- Stop backend and ensure errors display; restart and sign in again if needed.
- Run production build.

## Validation in preparation environment

All 10 TypeScript source files parsed without syntax errors using the installed TypeScript parser. Angular/PrimeNG dependencies were not installed in this offline environment; Angular template type checking, production build and live browser/MongoDB integration were not performed. Run the above steps locally to verify. No node_modules or lockfile included; npm install generates the lockfile.
