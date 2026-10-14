const Joi = require('joi');

const metricsQueryValidator = Joi.object({
  sinceHours: Joi.number().integer().min(1).max(168).default(24).optional(),
});

const auditLogQueryValidator = Joi.object({
  page: Joi.number().integer().min(1).default(1).optional(),
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  action: Joi.string().trim().max(128).optional(),
  actor: Joi.string().trim().max(128).optional(),
  from: Joi.date().iso().optional(),
  to: Joi.date().iso().optional(),
});

module.exports = {
  metricsQueryValidator,
  auditLogQueryValidator,
};
