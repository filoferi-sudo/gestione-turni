const express = require('express');
const { listEmailLog } = require('../controllers/emailLogController');
const { authenticate, requireManager } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Storico email della propria società (Fase E7): riservato a responsabile/dirigente.
router.get('/', authenticate, requireManager, asyncHandler(listEmailLog));

module.exports = router;
