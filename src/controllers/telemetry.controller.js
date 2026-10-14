const telemetryService = require('../services/telemetry.service');
const { asyncHandler } = require('../middleware/validate');

const ingest = asyncHandler(async (req, res) => {
  const { doc, latencyMs } = await telemetryService.ingest(req.body, { ip: req.ip });
  res.status(201).json({
    id: doc._id,
    deviceId: doc.deviceId,
    metric: doc.metric,
    value: doc.value,
    latencyMs: Math.round(latencyMs * 100) / 100,
  });
});

const ingestBatch = asyncHandler(async (req, res) => {
  const docs = await telemetryService.ingestBatch(req.body.batch, { ip: req.ip });
  res.status(201).json({ inserted: docs.length, ids: docs.map((d) => d._id) });
});

module.exports = { ingest, ingestBatch };
