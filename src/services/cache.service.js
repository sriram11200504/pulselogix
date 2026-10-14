const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

// Transparent cache: Redis when available, LRU-ish in-memory Map otherwise.
const memory = new Map(); // key -> { value, expiresAt }

function memGet(key) {
  const entry = memory.get(key);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return entry.value;
}

function memSet(key, value, ttlSeconds) {
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (memory.size > 1000) {
    const first = memory.keys().next().value;
    memory.delete(first);
  }
}

async function get(key) {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(key);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      logger.warn({ msg: 'cache_get_failed', err: err.message });
      return memGet(key);
    }
  }
  return memGet(key);
}

async function set(key, value, ttlSeconds = 30) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return;
    } catch (err) {
      logger.warn({ msg: 'cache_set_failed', err: err.message });
    }
  }
  memSet(key, value, ttlSeconds);
}

async function del(patternOrKey) {
  const redis = getRedis();
  // Normalize: trailing '*' means "prefix delete"
  const prefix = patternOrKey.endsWith('*')
    ? patternOrKey.slice(0, -1)
    : patternOrKey;
  memory.delete(patternOrKey);
  // clear any memory keys with prefix
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
  if (redis) {
    try {
      if (patternOrKey.includes('*')) {
        const keys = await redis.keys(patternOrKey);
        if (keys.length) await redis.del(...keys);
      } else {
        // Exact key + any prefixed variants (e.g. metrics:summary + metrics:summary:24h)
        await redis.del(patternOrKey);
        const keys = await redis.keys(`${patternOrKey}*`);
        if (keys.length) await redis.del(...keys);
      }
    } catch (err) {
      logger.warn({ msg: 'cache_del_failed', err: err.message });
    }
  }
}

function cacheMiddleware(keyBuilder, ttlSeconds = 30) {
  return async (req, res, next) => {
    try {
      const key = typeof keyBuilder === 'function' ? keyBuilder(req) : keyBuilder;
      const cached = await get(key);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        return res.json({ ...cached, _cache: 'hit' });
      }
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        set(key, body, ttlSeconds).catch(() => {});
        res.setHeader('X-Cache', 'MISS');
        return originalJson({ ...body, _cache: 'miss' });
      };
      return next();
    } catch {
      return next();
    }
  };
}

module.exports = { get, set, del, cacheMiddleware, _memory: memory };
