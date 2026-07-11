const express = require('express');
const { getEmployeesOverview, getEmployeeDetail } = require('../controllers/reportController');
const { authenticate, requireManager } = require('../middleware/auth');
const requireFeature = require('../middleware/requireFeature');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// L'intera sezione Report è una feature di piano ('reports'): il gate `requireFeature` (dopo
// authenticate) nega l'accesso se il piano della società non la include. Default abilitata
// (retrocompatibile): nessun impatto sulle società esistenti.

// Vista generale del personale: riservata a responsabile/dirigente (sezione Report).
router.get('/employees', authenticate, requireFeature('reports'), requireManager, asyncHandler(getEmployeesOverview));

// Scheda dettaglio: solo `authenticate`, l'autorizzazione fine è nel controller (un dipendente può
// leggere solo i propri dati; responsabile/dirigente qualunque dipendente della società). Stesso
// pattern di /api/users/:id/availability.
router.get('/employees/:id', authenticate, requireFeature('reports'), asyncHandler(getEmployeeDetail));

module.exports = router;
