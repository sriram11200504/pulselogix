const express = require('express');
const adminController = require('../controllers/admin.controller');
const { adminAuth, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditLogQueryValidator } = require('../validators/query.validator');

const router = express.Router();

router.use(adminAuth);

// viewers + support + admins can read logs; with validated pagination & filters
router.get(
  '/audit-logs',
  requireRole('viewer', 'support', 'admin'),
  validate(auditLogQueryValidator, 'query'),
  adminController.list
);

module.exports = router;
