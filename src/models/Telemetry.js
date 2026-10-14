const mongoose = require('mongoose');

const telemetrySchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true, trim: true },
    metric: { type: String, required: true, index: true, trim: true },
    value: { type: Number, required: true },
    unit: { type: String, default: null },
    timestamp: { type: Date, default: Date.now, index: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, versionKey: false }
);

// Compound indexes for rapid querying + aggregation
telemetrySchema.index({ deviceId: 1, timestamp: -1 });
telemetrySchema.index({ metric: 1, timestamp: -1 });
telemetrySchema.index({ timestamp: -1 });
telemetrySchema.index({ deviceId: 1, metric: 1, timestamp: -1 });

module.exports = mongoose.models.Telemetry || mongoose.model('Telemetry', telemetrySchema);
