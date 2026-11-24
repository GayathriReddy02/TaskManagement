const mongoose = require("mongoose");

const queueStateSchema = new mongoose.Schema(
  { _id: String, generation: { type: Number, default: 0 } },
  { versionKey: false, collection: "queue_state" },
);

module.exports =
  mongoose.models.QueueState || mongoose.model("QueueState", queueStateSchema);
