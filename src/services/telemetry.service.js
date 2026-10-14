const mongoose = require('mongoose');
const Telemetry = require('../models/Telemetry');
const Device = require('../models/Device');
const eventBus = require('../events/eventBus');
const cache = require('./cache.service');
const memoryStore = require('../utils/memoryStore');

async function ingest(payload, meta = {}) {
  const start = process.hrtime.bigint();
  let doc;

  if (mongoose.connection.readyState === 1) {
    // Fast-path persist: single insert, no heavy joins — target sub-50ms
    doc = await Telemetry.create({
      deviceId: payload.deviceId,
      metric: payload.metric,
      value: payload.value,
      unit: payload.unit ?? null,
      timestamp: payload.timestamp || new Date(),
      metadata: payload.metadata || {},
    });
    // Upsert device last-seen (fire & forget)
    Device.updateOne(
      { deviceId: doc.deviceId },
      { $set: { lastSeenAt: new Date(), status: 'online' }, $setOnInsert: { name: doc.deviceId } },
      { upsert: true }
    ).catch(() => {});
  } else {
    // In-memory fallback if MongoDB is offline
    doc = memoryStore.addTelemetry(payload);
  }

  const latencyMs = Number(process.hrtime.bigint() - start) / 1e6;

  // Best-effort side effects (never awaited on hot path callers that want speed)
  eventBus.publish('telemetry.ingested', {
    _id: doc._id,
    deviceId: doc.deviceId,
    metric: doc.metric,
    value: doc.value,
    ingestLatencyMs: Math.round(latencyMs * 100) / 100,
    ip: meta.ip || null,
  });

  // Invalidate metrics summary cache on every write (all window variants)
  cache.del('metrics:summary').catch(() => {});

  return { doc, latencyMs };
}

async function ingestBatch(items, meta = {}) {
  let docs;
  if (mongoose.connection.readyState === 1) {
    docs = await Telemetry.insertMany(
      items.map((p) => ({
        deviceId: p.deviceId,
        metric: p.metric,
        value: p.value,
        unit: p.unit ?? null,
        timestamp: p.timestamp || new Date(),
        metadata: p.metadata || {},
      })),
      { ordered: false }
    );
  } else {
    docs = items.map((p) => memoryStore.addTelemetry(p));
  }

  for (const d of docs) {
    eventBus.publish('telemetry.ingested', {
      _id: d._id,
      deviceId: d.deviceId,
      metric: d.metric,
      value: d.value,
      ip: meta.ip || null,
    });
  }
  cache.del('metrics:summary').catch(() => {});
  return docs;
}

module.exports = { ingest, ingestBatch };
