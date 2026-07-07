const express = require('express');
const { getHoursStats } = require('../controllers/statsController');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Aperta a tutti gli autenticati: il controller stesso restringe un dipendente alle proprie
// sole ore (vedi getHoursStats), mentre responsabile/dirigente vedono tutti o filtrano per userId.
router.get('/hours', authenticate, asyncHandler(getHoursStats));

module.exports = router;
