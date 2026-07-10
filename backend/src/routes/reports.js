const express = require('express');
const { getEmployeesOverview, getEmployeeDetail } = require('../controllers/reportController');
const { authenticate, requireManager } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Vista generale del personale: riservata a responsabile/dirigente (sezione Report).
router.get('/employees', authenticate, requireManager, asyncHandler(getEmployeesOverview));

// Scheda dettaglio: solo `authenticate`, l'autorizzazione fine è nel controller (un dipendente può
// leggere solo i propri dati; responsabile/dirigente qualunque dipendente della società). Stesso
// pattern di /api/users/:id/availability.
router.get('/employees/:id', authenticate, asyncHandler(getEmployeeDetail));

module.exports = router;
