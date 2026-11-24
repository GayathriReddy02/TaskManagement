const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    _id: { type: String },
    type: { type: String, required: true, index: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: null },
    ownerId: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    attempts: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 3 },
    errors: { type: [mongoose.Schema.Types.Mixed], default: [] },
    createdAt: { type: Date, default: Date.now, index: true },
    nextRetryAt: { type: Date, default: null },
    processingAt: { type: Date, default: null },
    leaseUntil: { type: Date, default: null },
    leaseId: { type: String, default: null },
    finishedAt: { type: Date, default: null },
    result: { type: mongoose.Schema.Types.Mixed, default: null },
    error: { type: String, default: undefined },
  },
  { versionKey: false, collection: "jobs", suppressReservedKeysWarning: true },
);

jobSchema.index({ status:  1, nextRetryAt: 1, createdAt: 1 });
jobSchema.index({ status: 1, leaseUntil: 1 });
jobSchema.index({ status: 1, finishedAt: 1 });
jobSchema.index({ ownerId: 1, createdAt: -1 });
module.exports = mongoose.models.Job || mongoose.model("Job", jobSchema);
