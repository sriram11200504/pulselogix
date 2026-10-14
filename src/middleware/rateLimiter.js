const config = require('../config');
const { getRedis } = require('../config/redis');
const ApiError = require('../utils/ApiError');

// Sliding-window rate limiter: Redis sorted-set when available, in-memory otherwise.
// Keyed by IP (+ optional API key). Fail-open if Redis errors.
const memHits = new Map(); // key -> number[] timestamps

function slidingWindowMemory(key, windowMs, max) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const arr = (memHits.get(key) || []).filter((t) => t > cutoff);
  arr.push(now);
  memHits.set(key, arr);
  return { allowed: arr.length <= max, count: arr.length };
}

async function slidingWindowRedis(redis, key, windowMs, max) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const member = `${now}-${Math.random().toString(36).slice(2)}`;
  const multi = redis.multi();
  multi.zremrangebyscore(key, 0, cutoff);
  multi.zadd(key, now, member);
  multi.zcard(key);
  multi.pexpire(key, windowMs);
  const results = await multi.exec();
  const count = results?.[2]?.[1] ?? 0;
  return { allowed: count <= max, count };
}

function rateLimiter({ windowMs = config.rateLimit.windowMs, max = config.rateLimit.max } = {}) {
  return async (req, res, next) => {
    try {
      // Never rate-limit the test suite (supertest shares one IP across all tests)
      if (process.env.NODE_ENV === 'test') return next();
      const identifier = req.ip || 'unknown';
      const key = `rl:${identifier}:${Math.floor(Date.now() / windowMs)}:${req.path}`;
      // Use finer key for true sliding window
      const skey = `sliding:${identifier}:${req.path}`;
      let result;
      const redis = getRedis();
      if (redis) {
        try {
          result = await slidingWindowRedis(redis, skey, windowMs, max);
        } catch {
          result = slidingWindowMemory(skey, windowMs, max);
        }
      } else {
        result = slidingWindowMemory(skey, windowMs, max);
      }
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - result.count));
      if (!result.allowed) {
        return next(ApiError.tooManyRequests('Rate limit exceeded. Slow down.'));
      }
      return next();
    } catch {
      return next(); // fail open
    }
  };
}

module.exports = { rateLimiter, _memHits: memHits };
