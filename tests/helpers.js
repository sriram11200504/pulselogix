const mongoose = require('mongoose');
const { registerHandlers } = require('../src/events/handlers');
const { connectDB, disconnectDB } = require('../src/config/db');

// In-memory mock database store for zero-latency, hermetic test runs
const memoryDb = {
  telemetries: [],
  auditlogs: [],
  devices: [],
};

let usingRealDb = false;

function createQuery(getItems) {
  let sortFn = null;
  let skipCount = 0;
  let limitCount = Infinity;

  const query = {
    sort(criteria) {
      if (criteria && typeof criteria === 'object') {
        const key = Object.keys(criteria)[0];
        const dir = criteria[key] === -1 ? -1 : 1;
        sortFn = (a, b) => {
          const va = a[key] instanceof Date ? a[key].getTime() : a[key];
          const vb = b[key] instanceof Date ? b[key].getTime() : b[key];
          if (va < vb) return -1 * dir;
          if (va > vb) return 1 * dir;
          return 0;
        };
      }
      return query;
    },
    skip(n) {
      skipCount = Number(n) || 0;
      return query;
    },
    limit(n) {
      limitCount = Number(n) || Infinity;
      return query;
    },
    lean() {
      return query;
    },
    then(resolve, reject) {
      try {
        let items = getItems();
        if (sortFn) items = items.slice().sort(sortFn);
        const res = items.slice(skipCount, skipCount + limitCount);
        resolve(res);
      } catch (err) {
        reject(err);
      }
    },
  };
  return query;
}

function matchesAuditFilter(log, filter = {}) {
  if (filter.action && log.action !== filter.action) return false;
  if (filter.actor && log.actor !== filter.actor) return false;
  if (filter.createdAt) {
    const t = log.createdAt instanceof Date ? log.createdAt.getTime() : new Date(log.createdAt).getTime();
    if (filter.createdAt.$gte && t < new Date(filter.createdAt.$gte).getTime()) return false;
    if (filter.createdAt.$lte && t > new Date(filter.createdAt.$lte).getTime()) return false;
  }
  return true;
}

function runAggregation(items, pipeline) {
  let current = items.slice();
  for (const stage of pipeline) {
    if (stage.$match) {
      if (stage.$match.timestamp?.$gte) {
        const since = new Date(stage.$match.timestamp.$gte).getTime();
        current = current.filter((d) => {
          const t = d.timestamp instanceof Date ? d.timestamp.getTime() : new Date(d.timestamp).getTime();
          return t >= since;
        });
      }
    } else if (stage.$group) {
      const groupKey = stage.$group._id;
      if (groupKey === '$metric') {
        const map = new Map();
        for (const item of current) {
          const k = item.metric;
          if (!map.has(k)) map.set(k, { metric: k, count: 0, sum: 0, minValue: Infinity, maxValue: -Infinity });
          const entry = map.get(k);
          entry.count += 1;
          entry.sum += item.value;
          entry.minValue = Math.min(entry.minValue, item.value);
          entry.maxValue = Math.max(entry.maxValue, item.value);
        }
        current = Array.from(map.values()).map((e) => ({
          metric: e.metric,
          count: e.count,
          avgValue: Math.round((e.sum / e.count) * 100) / 100,
          minValue: e.minValue === Infinity ? null : e.minValue,
          maxValue: e.maxValue === -Infinity ? null : e.maxValue,
        }));
      } else if (groupKey === null) {
        const devices = new Set(current.map((d) => d.deviceId));
        current = [{
          totalEvents: current.length,
          uniqueDevices: devices.size,
        }];
      } else if (groupKey === '$deviceId') {
        const map = new Map();
        for (const item of current) {
          const k = item.deviceId;
          map.set(k, (map.get(k) || 0) + 1);
        }
        current = Array.from(map.entries()).map(([deviceId, events]) => ({ deviceId, events }));
      }
    } else if (stage.$sort) {
      const key = Object.keys(stage.$sort)[0];
      const dir = stage.$sort[key] === -1 ? -1 : 1;
      current.sort((a, b) => (a[key] < b[key] ? -1 * dir : a[key] > b[key] ? 1 * dir : 0));
    } else if (stage.$limit) {
      current = current.slice(0, stage.$limit);
    }
  }
  return Promise.resolve(current);
}

function setupMockDatabase() {
  const Telemetry = require('../src/models/Telemetry');
  const AuditLog = require('../src/models/AuditLog');
  const Device = require('../src/models/Device');

  // Patch Telemetry model
  Telemetry.create = async function (payload) {
    const doc = {
      _id: new mongoose.Types.ObjectId(),
      deviceId: payload.deviceId,
      metric: payload.metric,
      value: payload.value,
      unit: payload.unit || null,
      timestamp: payload.timestamp ? new Date(payload.timestamp) : new Date(),
      metadata: payload.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    memoryDb.telemetries.push(doc);
    return doc;
  };

  Telemetry.insertMany = async function (items) {
    const docs = items.map((p) => ({
      _id: new mongoose.Types.ObjectId(),
      deviceId: p.deviceId,
      metric: p.metric,
      value: p.value,
      unit: p.unit || null,
      timestamp: p.timestamp ? new Date(p.timestamp) : new Date(),
      metadata: p.metadata || {},
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
    memoryDb.telemetries.push(...docs);
    return docs;
  };

  Telemetry.aggregate = function (pipeline) {
    return runAggregation(memoryDb.telemetries, pipeline);
  };

  Telemetry.find = function () {
    return createQuery(() => memoryDb.telemetries);
  };

  Telemetry.deleteMany = async function () {
    memoryDb.telemetries.length = 0;
    return { acknowledged: true, deletedCount: 0 };
  };

  // Patch AuditLog model
  const toAuditDoc = (p) => ({
    _id: new mongoose.Types.ObjectId(),
    action: p.action,
    actor: p.actor || 'system',
    role: p.role || 'system',
    resource: p.resource || null,
    details: p.details || {},
    ip: p.ip || null,
    latencyMs: p.latencyMs || null,
    createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
    updatedAt: new Date(),
  });

  AuditLog.create = async function (payload) {
    if (Array.isArray(payload)) {
      const docs = payload.map(toAuditDoc);
      memoryDb.auditlogs.push(...docs);
      return docs;
    }
    const doc = toAuditDoc(payload);
    memoryDb.auditlogs.push(doc);
    return doc;
  };

  AuditLog.countDocuments = async function (filter = {}) {
    return memoryDb.auditlogs.filter((l) => matchesAuditFilter(l, filter)).length;
  };

  AuditLog.find = function (filter = {}) {
    return createQuery(() => memoryDb.auditlogs.filter((l) => matchesAuditFilter(l, filter)));
  };

  AuditLog.deleteMany = async function () {
    memoryDb.auditlogs.length = 0;
    return { acknowledged: true, deletedCount: 0 };
  };

  // Patch Device model
  Device.updateOne = async function (filter, update, opts = {}) {
    const idx = memoryDb.devices.findIndex((d) => d.deviceId === filter.deviceId);
    if (idx >= 0) {
      if (update.$set) Object.assign(memoryDb.devices[idx], update.$set);
    } else if (opts.upsert) {
      memoryDb.devices.push({
        _id: new mongoose.Types.ObjectId(),
        deviceId: filter.deviceId,
        ...(update.$set || {}),
        ...(update.$setOnInsert || {}),
      });
    }
    return { acknowledged: true, modifiedCount: 1 };
  };

  Device.deleteMany = async function () {
    memoryDb.devices.length = 0;
    return { acknowledged: true, deletedCount: 0 };
  };

  // Set mock connection as ready
  mongoose.connection.readyState = 1;
}

beforeAll(async () => {
  registerHandlers();
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.includes('localhost:27017')) {
    try {
      await connectDB(process.env.MONGODB_URI);
      usingRealDb = true;
      return;
    } catch {
      // fallback to mock
    }
  }
  setupMockDatabase();
});

afterEach(async () => {
  if (usingRealDb) {
    const collections = mongoose.connection.collections;
    for (const c of Object.values(collections)) {
      await c.deleteMany({});
    }
  } else {
    memoryDb.telemetries.length = 0;
    memoryDb.auditlogs.length = 0;
    memoryDb.devices.length = 0;
  }

  // Clear memory cache and sessions
  const cache = require('../src/services/cache.service');
  for (const k of [...cache._memory.keys()]) cache._memory.delete(k);

  const sessionService = require('../src/services/session.service');
  for (const k of [...sessionService._memorySessions.keys()]) sessionService._memorySessions.delete(k);
});

afterAll(async () => {
  if (usingRealDb) {
    await disconnectDB();
  }
});

module.exports = { memoryDb };
