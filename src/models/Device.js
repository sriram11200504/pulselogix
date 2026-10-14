const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, trim: true },
    name: { type: String, default: null },
    type: { type: String, default: 'sensor', index: true },
    status: { type: String, enum: ['online', 'offline', 'degraded'], default: 'online', index: true },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true, versionKey: false }
);

module.exports = mongoose.models.Device || mongoose.model('Device', deviceSchema);
