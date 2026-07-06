const express = require('express');
const { getCalendar } = require('../controllers/shiftController');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Autenticati soli: il controller filtra per utente se il ruolo non è admin
router.get('/', authenticate, asyncHandler(getCalendar));

module.exports = router;
