# Update manifest

Baseline: user-uploaded task_management_backend.zip. No frontend was supplied or changed.

Added:
- src/errors/AppError.js (seven custom error classes)
- src/utils/retry.js, csvUtils.js
- src/queues/jobQueue.js
- src/workers/queueWorker.js, jobHandlers.js
- src/services/jobService.js, exportService.js
- src/controllers/reportController.js
- src/routes/jobRoutes.js, reportRoutes.js
- src/examples/classCallbacks.js
- tests/core.test.js, api.test.js
- .env.example, UPDATE_NOTES.md

Modified:
- server.js, src/app.js (worker startup, new routes)
- src/services/taskService.js, notificationService.js (classes, compatible exports)
- src/services/activityService.js (enqueue, idempotent writes)
- src/models/Activity.js (optional event ID, sparse unique index)
- src/controllers/taskController.js (class usage, custom errors)
- src/middleware/auth.js, errorHandler.js, src/utils/asyncHandler.js (error propagation)
- package.json (test scripts), .gitignore, README.md

All other original source files retained unchanged. No secrets or installed dependencies included. No new package dependencies.
