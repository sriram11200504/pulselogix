const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');
const { getPagination, paginatedResponse } = require('../utils/pagination');
const memoryStore = require('../utils/memoryStore');

async function listAuditLogs(query) {
  if (mongoose.connection.readyState !== 1) {
    return memoryStore.queryAudits(query);
  }

  const { page, limit, skip } = getPagination(query);
  const filter = {};
  if (query.action) filter.action = query.action;
  if (query.actor) filter.actor = query.actor;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  const [total, data] = await Promise.all([
    AuditLog.countDocuments(filter),
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
  ]);
  return paginatedResponse({ page, limit, total, data });
}

module.exports = { listAuditLogs };
