const express = require('express');
const config = require('../config');
const sessionService = require('../services/session.service');
const { adminAuth, requireRole } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');
const { asyncHandler } = require('../middleware/validate');

const router = express.Router();

// Create new session via API Key credentials
router.post(
  '/session',
  asyncHandler(async (req, res) => {
    const { apiKey, role = 'viewer', userId = 'ops-user' } = req.body;
    if (!apiKey || apiKey !== config.adminApiKey) {
      throw ApiError.unauthorized('Invalid API key provided for session initiation');
    }
    const session = await sessionService.createSession(userId, { role });
    res.status(201).json({
      message: 'Session created successfully',
      session,
    });
  })
);

// Get current session status
router.get(
  '/session',
  adminAuth,
  asyncHandler(async (req, res) => {
    if (req.admin.sessionId) {
      const session = await sessionService.getSession(req.admin.sessionId);
      return res.json({ session });
    }
    res.json({
      admin: req.admin,
      message: 'Authenticated via static API key (stateless)',
    });
  })
);

// Destroy session (logout)
router.delete(
  '/session',
  adminAuth,
  asyncHandler(async (req, res) => {
    if (req.admin.sessionId) {
      await sessionService.destroySession(req.admin.sessionId);
      return res.json({ message: 'Session terminated successfully' });
    }
    res.json({ message: 'No active session to terminate (stateless API key)' });
  })
);

// Admin-only: list all active sessions stored in Redis
router.get(
  '/sessions',
  adminAuth,
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const sessions = await sessionService.listActiveSessions();
    res.json({ count: sessions.length, sessions });
  })
);

module.exports = router;
