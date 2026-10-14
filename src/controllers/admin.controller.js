const auditService = require('../services/audit.service');
const { asyncHandler } = require('../middleware/validate');

const list = asyncHandler(async (req, res) => {
  const result = await auditService.listAuditLogs(req.query);
  res.json(result);
});

module.exports = { list };
