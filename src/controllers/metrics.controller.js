const metricsService = require('../services/metrics.service');
const cache = require('../services/cache.service');
const config = require('../config');
const { asyncHandler } = require('../middleware/validate');

const summary = asyncHandler(async (req, res) => {
  const sinceHours = Math.min(168, Math.max(1, parseInt(req.query.sinceHours, 10) || 24));
  const cacheKey = `metrics:summary:${sinceHours}h`;
  const cached = await cache.get(cacheKey);
  if (cached) {
    res.setHeader('X-Cache', 'HIT');
    return res.json({ ...cached, _cache: 'hit' });
  }
  const data = await metricsService.getSummary({ sinceHours });
  await cache.set(cacheKey, data, config.cacheTtl.metricsSummary);
  res.setHeader('X-Cache', 'MISS');
  return res.json({ ...data, _cache: 'miss' });
});

module.exports = { summary };
