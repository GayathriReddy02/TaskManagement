const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    description: { type: String, default: "", maxlength: 2000 },
    status: {
      type: String,
      enum: ["Pending", "In Progress", "Completed"],
      default: "Pending",
    },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High"],
      default: "Medium",
    },
    dueDate: { type: Date, default: null },
    tags: { type: [String], default: [] },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    notificationVersion: { type: Number, default: 0, select: false },
  },
  { timestamps: true },
);

function removeInternalFields(_document, value) {
  delete value.notificationVersion;
  return value;
}

taskSchema.set("toJSON", { transform: removeInternalFields });
taskSchema.set("toObject", { transform: removeInternalFields });
taskSchema.index({ createdBy: 1, createdAt: -1 });
taskSchema.index({ assignedTo: 1, createdAt: -1 });
taskSchema.index({ status: 1, dueDate: 1 });
taskSchema.index({ tags: 1, createdAt: -1 });
module.exports = mongoose.model("Task", taskSchema);
