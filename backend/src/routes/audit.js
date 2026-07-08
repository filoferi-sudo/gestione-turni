const express = require('express');
const { listAuditLogs } = require('../controllers/auditController');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// La restrizione di ruolo (dirigente/superadmin) è nel controller, così da poter distinguere il
// comportamento tra i due ruoli (scoping società vs accesso globale).
router.get('/', authenticate, asyncHandler(listAuditLogs));

module.exports = router;
