const crypto = require('crypto');
const { getRedis } = require('../config/redis');
const logger = require('../utils/logger');

// Redis session store with in-memory fallback
const memorySessions = new Map(); // sessionId -> { session, expiresAt }
const DEFAULT_SESSION_TTL = 86400; // 24 hours

function memGet(sessionId) {
  const entry = memorySessions.get(sessionId);
  if (!entry) return null;
  if (entry.expiresAt && entry.expiresAt < Date.now()) {
    memorySessions.delete(sessionId);
    return null;
  }
  return entry.session;
}

function memSet(sessionId, session, ttlSeconds) {
  memorySessions.set(sessionId, {
    session,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/**
 * Creates and stores a session in Redis (or memory fallback).
 * @param {string} userId - Identity of user/service
 * @param {object} data - Session payload (role, metadata, permissions)
 * @param {number} [ttlSeconds=86400]
 * @returns {Promise<object>} Stored session object
 */
async function createSession(userId, data = {}, ttlSeconds = DEFAULT_SESSION_TTL) {
  const sessionId = crypto.randomUUID();
  const session = {
    id: sessionId,
    userId,
    role: data.role || 'viewer',
    metadata: data.metadata || {},
    createdAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
  };

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(`session:${sessionId}`, JSON.stringify(session), 'EX', ttlSeconds);
      return session;
    } catch (err) {
      logger.warn({ msg: 'session_redis_set_failed', err: err.message });
    }
  }

  memSet(sessionId, session, ttlSeconds);
  return session;
}

/**
 * Retrieves a session by ID and optionally refreshes TTL.
 * @param {string} sessionId
 * @param {boolean} [refresh=true]
 * @returns {Promise<object|null>}
 */
async function getSession(sessionId, refresh = true) {
  if (!sessionId) return null;
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(`session:${sessionId}`);
      if (!raw) return null;
      const session = JSON.parse(raw);
      session.lastActiveAt = new Date().toISOString();
      if (refresh) {
        await redis.set(`session:${sessionId}`, JSON.stringify(session), 'EX', DEFAULT_SESSION_TTL);
      }
      return session;
    } catch (err) {
      logger.warn({ msg: 'session_redis_get_failed', err: err.message });
      return memGet(sessionId);
    }
  }

  const s = memGet(sessionId);
  if (s && refresh) {
    s.lastActiveAt = new Date().toISOString();
    memSet(sessionId, s, DEFAULT_SESSION_TTL);
  }
  return s;
}

/**
 * Invalidates / deletes a session.
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
async function destroySession(sessionId) {
  if (!sessionId) return false;
  memorySessions.delete(sessionId);
  const redis = getRedis();
  if (redis) {
    try {
      await redis.del(`session:${sessionId}`);
    } catch (err) {
      logger.warn({ msg: 'session_redis_del_failed', err: err.message });
    }
  }
  return true;
}

/**
 * Lists active sessions (for ops dashboard inspection).
 * @returns {Promise<object[]>}
 */
async function listActiveSessions() {
  const redis = getRedis();
  if (redis) {
    try {
      const keys = await redis.keys('session:*');
      if (!keys.length) return [];
      const values = await redis.mget(...keys);
      return values.map((v) => JSON.parse(v)).filter(Boolean);
    } catch {
      // fallback to memory
    }
  }
  const now = Date.now();
  const active = [];
  for (const [id, entry] of memorySessions.entries()) {
    if (!entry.expiresAt || entry.expiresAt > now) {
      active.push(entry.session);
    } else {
      memorySessions.delete(id);
    }
  }
  return active;
}

module.exports = {
  createSession,
  getSession,
  destroySession,
  listActiveSessions,
  _memorySessions: memorySessions,
};
