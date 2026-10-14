const express = require('express');
const metricsController = require('../controllers/metrics.controller');
const { rateLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { metricsQueryValidator } = require('../validators/query.validator');

const router = express.Router();

router.get(
  '/summary',
  rateLimiter({ windowMs: 60_000, max: 120 }),
  validate(metricsQueryValidator, 'query'),
  metricsController.summary
);

module.exports = router;
