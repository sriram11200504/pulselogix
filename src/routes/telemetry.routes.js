const express = require('express');
const telemetryController = require('../controllers/telemetry.controller');
const { validate } = require('../middleware/validate');
const { rateLimiter } = require('../middleware/rateLimiter');
const { telemetryValidator, batchTelemetryValidator } = require('../validators/telemetry.validator');

const router = express.Router();

// Strict per-IP sliding window on ingest (high-volume protection)
router.post(
  '/',
  rateLimiter({ windowMs: 60_000, max: 300 }),
  validate(telemetryValidator),
  telemetryController.ingest
);

router.post(
  '/batch',
  rateLimiter({ windowMs: 60_000, max: 60 }),
  validate(batchTelemetryValidator),
  telemetryController.ingestBatch
);

module.exports = router;
