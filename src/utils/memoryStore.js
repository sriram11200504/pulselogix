const crypto = require('crypto');

// In-memory operational store used as fallback when external MongoDB is offline
const memoryStore = {
  telemetries: [],
  auditLogs: [],
  devices: new Map(),
  MAX_ITEMS: 1000,

  addTelemetry(doc) {
    const item = {
      _id: doc._id || crypto.randomUUID(),
      deviceId: doc.deviceId,
      metric: doc.metric,
      value: doc.value,
      unit: doc.unit || null,
      timestamp: doc.timestamp ? new Date(doc.timestamp) : new Date(),
      metadata: doc.metadata || {},
      createdAt: new Date(),
    };
    this.telemetries.unshift(item);
    if (this.telemetries.length > this.MAX_ITEMS) this.telemetries.length = this.MAX_ITEMS;
    return item;
  },

  addAudit(log) {
    const item = {
      _id: log._id || crypto.randomUUID(),
      action: log.action,
      actor: log.actor || 'system',
      role: log.role || 'system',
      resource: log.resource || null,
      details: log.details || {},
      ip: log.ip || null,
      latencyMs: log.latencyMs ?? null,
      createdAt: log.createdAt ? new Date(log.createdAt) : new Date(),
    };
    this.auditLogs.unshift(item);
    if (this.auditLogs.length > this.MAX_ITEMS) this.auditLogs.length = this.MAX_ITEMS;
    return item;
  },

  getRecentTelemetry(limit = 20) {
    return this.telemetries.slice(0, limit);
  },

  getRecentAudits(limit = 20) {
    return this.auditLogs.slice(0, limit);
  },

  getSummary(sinceHours = 24) {
    const since = new Date(Date.now() - sinceHours * 3600 * 1000).getTime();
    const matching = this.telemetries.filter((t) => new Date(t.timestamp).getTime() >= since);

    const metricsMap = new Map();
    const deviceMap = new Map();

    for (const t of matching) {
      // Metric aggregations
      if (!metricsMap.has(t.metric)) {
        metricsMap.set(t.metric, { metric: t.metric, count: 0, sum: 0, minValue: Infinity, maxValue: -Infinity });
      }
      const m = metricsMap.get(t.metric);
      m.count += 1;
      m.sum += t.value;
      m.minValue = Math.min(m.minValue, t.value);
      m.maxValue = Math.max(m.maxValue, t.value);

      // Device counts
      deviceMap.set(t.deviceId, (deviceMap.get(t.deviceId) || 0) + 1);
    }

    const byMetric = Array.from(metricsMap.values()).map((m) => ({
      metric: m.metric,
      count: m.count,
      avgValue: Math.round((m.sum / m.count) * 100) / 100,
      minValue: m.minValue === Infinity ? null : m.minValue,
      maxValue: m.maxValue === -Infinity ? null : m.maxValue,
    })).sort((a, b) => b.count - a.count);

    const topDevices = Array.from(deviceMap.entries())
      .map(([deviceId, events]) => ({ deviceId, events }))
      .sort((a, b) => b.events - a.events)
      .slice(0, 10);

    return {
      window: { sinceHours, since: new Date(since) },
      totals: { totalEvents: matching.length, uniqueDevices: deviceMap.size },
      byMetric,
      topDevices,
      generatedAt: new Date().toISOString(),
    };
  },

  queryAudits(query) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    let filtered = this.auditLogs.slice();
    if (query.action) filtered = filtered.filter((l) => l.action === query.action);
    if (query.actor) filtered = filtered.filter((l) => l.actor === query.actor);
    if (query.from) {
      const fromTime = new Date(query.from).getTime();
      filtered = filtered.filter((l) => new Date(l.createdAt).getTime() >= fromTime);
    }
    if (query.to) {
      const toTime = new Date(query.to).getTime();
      filtered = filtered.filter((l) => new Date(l.createdAt).getTime() <= toTime);
    }

    const total = filtered.length;
    const data = filtered.slice(skip, skip + limit);
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      data,
    };
  },
};

module.exports = memoryStore;
