const express = require('express');
const mongoose = require('mongoose');
const { isRedisReady } = require('../config/redis');
const eventBus = require('../events/eventBus');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptimeSec: Math.round(process.uptime()),
    time: new Date().toISOString(),
  });
});

router.get('/ready', async (req, res) => {
  const mongo = mongoose.connection.readyState === 1 ? 'up' : 'down';
  const redis = isRedisReady() ? 'up' : 'fallback-memory';
  const ok = mongo === 'up';
  res.status(ok ? 200 : 503).json({ mongo, redis, events: eventBus.getStats() });
});

module.exports = router;
