require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/pulselogix',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisEnabled: (process.env.REDIS_ENABLED || 'true') !== 'false',
  cacheTtl: {
    metricsSummary: parseInt(process.env.CACHE_TTL_METRICS_SUMMARY, 10) || 30,
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60_000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },
  adminApiKey: process.env.ADMIN_API_KEY || 'changeme-super-secret-key',
  logLevel: process.env.LOG_LEVEL || 'info',
};

module.exports = config;
