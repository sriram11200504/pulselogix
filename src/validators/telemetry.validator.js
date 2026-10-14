const Joi = require('joi');

const telemetryValidator = Joi.object({
  deviceId: Joi.string().trim().min(1).max(128).required(),
  metric: Joi.string().trim().min(1).max(64).required(),
  value: Joi.number().required(),
  unit: Joi.string().max(16).allow(null, '').optional(),
  timestamp: Joi.date().iso().optional(),
  metadata: Joi.object().unknown(true).optional(),
});

const batchTelemetryValidator = Joi.object({
  batch: Joi.array().items(telemetryValidator).min(1).max(500).required(),
});

module.exports = { telemetryValidator, batchTelemetryValidator };
