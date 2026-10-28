const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

// GET /api/stats - 5 analytical queries
router.get('/stats', statsController.getAnalyticsStats);

// GET /api/audit - Recent audit trail records
router.get('/audit', statsController.getAuditLogs);

// POST /api/query - Execute live read-only SELECT query for viva demo
router.post('/query', statsController.executeReadOnlyQuery);

module.exports = router;
