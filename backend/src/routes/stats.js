const express = require('express');
const { getHoursStats } = require('../controllers/statsController');
const { authenticate, requireManager } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/hours', authenticate, requireManager, asyncHandler(getHoursStats));

module.exports = router;
