const mongoose = require('mongoose');
const Telemetry = require('../models/Telemetry');
const memoryStore = require('../utils/memoryStore');

/**
 * Aggregation pipeline: per-metric stats + top devices.
 * Indexed on (metric, timestamp) and (deviceId, timestamp) for speed.
 * Falls back to memoryStore when MongoDB is offline.
 */
async function getSummary({ sinceHours = 24 } = {}) {
  if (mongoose.connection.readyState !== 1) {
    return memoryStore.getSummary(sinceHours);
  }

  const since = new Date(Date.now() - sinceHours * 3600 * 1000);

  const [byMetric, totals, topDevices] = await Promise.all([
    Telemetry.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: '$metric',
          count: { $sum: 1 },
          avgValue: { $avg: '$value' },
          minValue: { $min: '$value' },
          maxValue: { $max: '$value' },
        },
      },
      { $sort: { count: -1 } },
      {
        $project: {
          _id: 0,
          metric: '$_id',
          count: 1,
          avgValue: { $round: ['$avgValue', 2] },
          minValue: 1,
          maxValue: 1,
        },
      },
    ]),
    Telemetry.aggregate([
      { $match: { timestamp: { $gte: since } } },
      {
        $group: {
          _id: null,
          totalEvents: { $sum: 1 },
          devices: { $addToSet: '$deviceId' },
        },
      },
      {
        $project: {
          _id: 0,
          totalEvents: 1,
          uniqueDevices: { $size: '$devices' },
        },
      },
    ]),
    Telemetry.aggregate([
      { $match: { timestamp: { $gte: since } } },
      { $group: { _id: '$deviceId', events: { $sum: 1 } } },
      { $sort: { events: -1 } },
      { $limit: 10 },
      { $project: { _id: 0, deviceId: '$_id', events: 1 } },
    ]),
  ]);

  return {
    window: { sinceHours, since },
    totals: totals[0] || { totalEvents: 0, uniqueDevices: 0 },
    byMetric,
    topDevices,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getSummary };
