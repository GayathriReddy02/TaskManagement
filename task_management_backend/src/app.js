const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");
const { errorHandler } = require("./middleware/errorHandler");
const activityRoutes = require("./routes/activityRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");

const app = express();
app.use(cors()); // Restrict allowed origins before production deployment.
app.use(express.json({ limit: "20kb" }));

app.get("/", (req, res) =>
  res.json({ message: "Task Management API working" }),
);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/jobs", require("./routes/jobRoutes"));
app.use("/api/reports", require("./routes/reportRoutes"));
app.use((req, res, next) =>
  next(new (require("./errors/AppError").NotFoundError)("Route not found")),
);
app.use(errorHandler);
module.exports = app;
