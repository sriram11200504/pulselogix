const express = require('express');
const mongoose = require('mongoose');
const { isRedisReady } = require('../config/redis');
const eventBus = require('../events/eventBus');
const { getRecentAlerts } = require('../events/handlers');
const metricsService = require('../services/metrics.service');
const sessionService = require('../services/session.service');
const Telemetry = require('../models/Telemetry');
const AuditLog = require('../models/AuditLog');
const memoryStore = require('../utils/memoryStore');

const router = express.Router();

// Server-rendered ops dashboard
router.get('/', async (req, res, next) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    const [summary, recent, audits, sessions] = await Promise.all([
      metricsService.getSummary({ sinceHours: 24 }).catch(() => null),
      isDbConnected
        ? Telemetry.find().sort({ createdAt: -1 }).limit(20).lean().catch(() => [])
        : Promise.resolve(memoryStore.getRecentTelemetry(20)),
      isDbConnected
        ? AuditLog.find().sort({ createdAt: -1 }).limit(20).lean().catch(() => [])
        : Promise.resolve(memoryStore.getRecentAudits(20)),
      sessionService.listActiveSessions().catch(() => []),
    ]);
    res.render('dashboard', {
      summary,
      recent,
      audits,
      alerts: getRecentAlerts(15),
      events: eventBus.getStats(),
      sessionsCount: sessions.length,
      infra: {
        mongo: isDbConnected ? 'up' : 'down (memory-fallback)',
        redis: isRedisReady() ? 'up' : 'memory-fallback',
        uptimeSec: Math.round(process.uptime()),
        nodeEnv: process.env.NODE_ENV || 'development',
      },
    });
  } catch (err) {
    next(err);
  }
});

// JSON feed for dashboard auto-refresh & real-time ops monitoring
router.get('/api/v1/dashboard/overview', async (req, res, next) => {
  try {
    const isDbConnected = mongoose.connection.readyState === 1;
    const [summary, recent, audits, sessions] = await Promise.all([
      metricsService.getSummary({ sinceHours: 24 }).catch(() => null),
      isDbConnected
        ? Telemetry.find().sort({ createdAt: -1 }).limit(15).lean().catch(() => [])
        : Promise.resolve(memoryStore.getRecentTelemetry(15)),
      isDbConnected
        ? AuditLog.find().sort({ createdAt: -1 }).limit(15).lean().catch(() => [])
        : Promise.resolve(memoryStore.getRecentAudits(15)),
      sessionService.listActiveSessions().catch(() => []),
    ]);
    res.json({
      summary,
      recent,
      audits,
      alerts: getRecentAlerts(15),
      events: eventBus.getStats(),
      sessionsCount: sessions.length,
      infra: {
        mongo: isDbConnected ? 'up' : 'down (memory-fallback)',
        redis: isRedisReady() ? 'up' : 'memory-fallback',
        uptimeSec: Math.round(process.uptime()),
        nodeEnv: process.env.NODE_ENV || 'development',
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
