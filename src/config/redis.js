const config = require('./index');
const logger = require('../utils/logger');

let redis = null;
let memoryFallback = true;

async function initRedis() {
  if (!config.redisEnabled) {
    logger.warn({ msg: 'redis_disabled_using_memory_fallback' });
    return null;
  }
  try {
    const Redis = require('ioredis');
    redis = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: true,
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 2000)),
    });
    redis.on('error', (err) => logger.warn({ msg: 'redis_error', err: err.message }));
    await redis.connect().catch(() => null);
    if (redis.status === 'ready' || redis.status === 'connect') {
      // ping with timeout so app never hangs without redis
      const pong = await Promise.race([
        redis.ping(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('ping timeout')), 1500)),
      ]).catch(() => null);
      if (pong) {
        memoryFallback = false;
        logger.info({ msg: 'redis_connected' });
        return redis;
      }
    }
    logger.warn({ msg: 'redis_unreachable_using_memory_fallback' });
    try { redis.disconnect(); } catch { /* noop */ }
    redis = null;
    return null;
  } catch (err) {
    logger.warn({ msg: 'redis_init_failed', err: err.message });
    redis = null;
    return null;
  }
}

function getRedis() {
  return memoryFallback ? null : redis;
}

function isRedisReady() {
  return !!redis && !memoryFallback && redis.status === 'ready';
}

async function closeRedis() {
  if (redis) {
    try { await redis.quit(); } catch { try { redis.disconnect(); } catch { /* noop */ } }
    redis = null;
  }
}

module.exports = { initRedis, getRedis, isRedisReady, closeRedis };
