const express = require('express');
const { createLead } = require('../controllers/leadController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Rotta PUBBLICA (nessuna autenticazione): il sito marketing invia qui i lead demo/contatto.
// Montata in app.js su /api/public/leads.
router.post('/', asyncHandler(createLead));

module.exports = router;
