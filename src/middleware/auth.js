const config = require('../config');
const ApiError = require('../utils/ApiError');
const sessionService = require('../services/session.service');

/**
 * Authentication middleware supporting dual strategies:
 * 1. Redis Session Tokens (via `Authorization: Bearer <sessionId>` or `x-session-id`)
 * 2. Static Admin API Key (via `x-api-key` and optional `x-role`)
 */
async function adminAuth(req, res, next) {
  try {
    const authHeader = req.header('authorization');
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const sessionId = req.header('x-session-id') || bearerToken;

    if (sessionId) {
      const session = await sessionService.getSession(sessionId);
      if (session) {
        req.admin = {
          role: session.role || 'viewer',
          userId: session.userId,
          sessionId: session.id,
          authType: 'session',
        };
        return next();
      }
    }

    const key = req.header('x-api-key');
    if (!key || key !== config.adminApiKey) {
      return next(ApiError.unauthorized('Missing or invalid authentication (x-api-key or session token)'));
    }

    const role = (req.header('x-role') || 'viewer').toLowerCase();
    req.admin = {
      role,
      keyPrefix: `${String(key).slice(0, 4)}***`,
      authType: 'api-key',
    };
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.admin) return next(ApiError.unauthorized('Not authenticated'));
    if (req.admin.role === 'admin') return next(); // admin bypasses
    if (!allowed.includes(req.admin.role)) {
      return next(ApiError.forbidden(`Requires role: ${allowed.join(', ')}`));
    }
    return next();
  };
}

module.exports = { adminAuth, requireRole };
