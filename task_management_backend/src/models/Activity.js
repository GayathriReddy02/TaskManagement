const mongoose = require("mongoose");
const activitySchema = new mongoose.Schema(
  {
    eventId: { type: String },
    taskId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Task",
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    event: {
      type: String,
      enum: ["taskCreated", "taskUpdated", "taskAssigned", "taskCompleted"],
      required: true,
    },
    message: { type: String, required: true },
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    visibleTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);
activitySchema.index({ eventId: 1 }, { unique: true, sparse: true });
activitySchema.index({ visibleTo: 1, createdAt: -1 });
module.exports = mongoose.model("Activity", activitySchema);
