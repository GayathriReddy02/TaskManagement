class AppError extends Error {
  constructor(message, statusCode = 500, code = "INTERNAL_ERROR", options) {
    super(message, options);
    this.statusCode = statusCode;
    this.code = code;
    this.name = this.constructor.name;
  }
}
class ValidationError extends AppError {
  constructor(message) {
    super(message, 400, "VALIDATION_ERROR");
  }
}
class NotFoundError extends AppError {
  constructor(message) {
    super(message, 404, "NOT_FOUND");
  }
}
class UnauthorizedError extends AppError {
  constructor(message) {
    super(message, 401, "UNAUTHORIZED");
  }
}
class ForbiddenError extends AppError {
  constructor(message) {
    super(message, 403, "FORBIDDEN");
  }
}
class DatabaseError extends AppError {
  constructor(cause) {
    super("Database operation failed", 503, "DATABASE_ERROR", { cause });
  }
}
class QueueError extends AppError {
  constructor(message, retryable = false) {
    super(message, 503, "QUEUE_ERROR");
    this.retryable = retryable;
  }
}
module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  DatabaseError,
  QueueError,
};
