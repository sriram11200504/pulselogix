const mongoose = require('mongoose');
const eventBus = require('./eventBus');
const logger = require('../utils/logger');
const memoryStore = require('../utils/memoryStore');

let AuditLog = null;
const getAuditLog = () => {
  if (!AuditLog) AuditLog = require('../models/AuditLog');
  return AuditLog;
};

// In-memory alert buffer (exposed to dashboard API)
const recentAlerts = [];
const MAX_ALERTS = 50;

// Thresholds for demo alerting
const THRESHOLDS = { temperature: 80, cpu: 90, humidity: 95, battery: 10 };

function pushAlert(alert) {
  recentAlerts.unshift({ ...alert, at: new Date().toISOString() });
  if (recentAlerts.length > MAX_ALERTS) recentAlerts.length = MAX_ALERTS;
  eventBus.publish('alert.triggered', alert);
}

function registerHandlers() {
  // Background persistence + audit for every ingested telemetry point.
  // Alert dispatch runs FIRST and never awaits the audit write.
  eventBus.subscribe('telemetry.ingested', async ({ payload }) => {
    // Threshold-based alert dispatch (background job, never on hot path)
    const threshold = THRESHOLDS[payload.metric];
    if (typeof threshold === 'number' && typeof payload.value === 'number') {
      const breach =
        payload.metric === 'battery' ? payload.value < threshold : payload.value > threshold;
      if (breach) {
        const alert = {
          deviceId: payload.deviceId,
          metric: payload.metric,
          value: payload.value,
          threshold,
          severity: 'warning',
          message: `${payload.metric}=${payload.value} breached threshold ${threshold} on ${payload.deviceId}`,
        };
        pushAlert(alert);
        logger.warn({ msg: 'alert_dispatched', ...alert });
      }
    }

    const auditEntry = {
      action: 'telemetry.ingested',
      actor: payload.deviceId || 'device',
      resource: 'telemetry',
      details: { metric: payload.metric, value: payload.value },
      latencyMs: payload.ingestLatencyMs ?? null,
    };

    if (mongoose.connection.readyState === 1) {
      try {
        const Audit = getAuditLog();
        await Audit.create(auditEntry);
      } catch (err) {
        logger.warn({ msg: 'audit_write_failed', err: err.message });
      }
    } else {
      memoryStore.addAudit(auditEntry);
    }
  });

  eventBus.subscribe('audit.write', async ({ payload }) => {
    if (mongoose.connection.readyState === 1) {
      try {
        const Audit = getAuditLog();
        await Audit.create(payload);
      } catch (err) {
        logger.warn({ msg: 'audit_write_failed', err: err.message });
      }
    } else {
      memoryStore.addAudit(payload);
    }
  });
}

function getRecentAlerts(limit = 20) {
  return recentAlerts.slice(0, limit);
}

module.exports = { registerHandlers, getRecentAlerts, pushAlert };
