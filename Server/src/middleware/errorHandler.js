const { AppError } = require("../errors/AppError");
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  let status = 500,
    message = "Internal server error",
    code = "INTERNAL_ERROR";
  if (err instanceof AppError) {
    status = err.statusCode;
    message = err.message;
    code = err.code;
  } else if (err.name === "ValidationError") {
    status = 400;
    message = err.message;
    code = "VALIDATION_ERROR";
  } else if (err.name === "CastError") {
    status = 400;
    message = "Invalid ID or field value";
    code = "VALIDATION_ERROR";
  } else if (err.type === "entity.parse.failed") {
    status = 400;
    message = "Invalid JSON";
    code = "VALIDATION_ERROR";
  } else if (err.type === "entity.too.large") {
    status = 413;
    message = "Request too large";
    code = "PAYLOAD_TOO_LARGE";
  } else if (
    err.code === 20 &&
    err.codeName === "IllegalOperation" &&
    err.message === "Transaction numbers are only allowed on a replica set member or mongos"
  ) {
    status = 503;
    message = "MongoDB transactions require a replica set. Configure MongoDB as a replica set and retry.";
    code = "TRANSACTIONS_REQUIRED";
  } else if (err.code === 11000) {
    status = 409;
    message = "Request conflicts with existing data";
    code = "CONFLICT";
  } else if (
    [
      "MongoNetworkError",
      "MongoServerSelectionError",
      "MongooseServerSelectionError",
      "MongoNotConnectedError",
    ].includes(err.name)
  ) {
    status = 503;
    message = "Database unavailable";
    code = "DATABASE_ERROR";
  }
  if (status >= 500) console.error(err);
  res
    .status(status)
    .json({ message, success: false, code, statusCode: status });
}
module.exports = { errorHandler };
