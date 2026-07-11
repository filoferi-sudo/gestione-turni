const express = require('express');
const { listEmailLog } = require('../controllers/emailLogController');
const { authenticate, requireManager } = require('../middleware/auth');
const requireFeature = require('../middleware/requireFeature');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Storico email della propria società (Fase E7): riservato a responsabile/dirigente e incluso nella
// feature di piano 'emailAutomation' (default abilitata, retrocompatibile).
router.get('/', authenticate, requireFeature('emailAutomation'), requireManager, asyncHandler(listEmailLog));

module.exports = router;
