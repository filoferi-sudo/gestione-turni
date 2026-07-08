const express = require('express');
const { getCompanySettings, updateCompanySettings } = require('../controllers/companySettingsController');
const { authenticate, requireDirigente } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Impostazioni della PROPRIA società (Fase 7). Diverse da /api/companies/* (anagrafica di
// piattaforma, solo Super Admin): qui sono le REGOLE aziendali, riservate al Dirigente
// (requireDirigente) — il Responsabile gestisce l'operatività ma non modifica le regole.
router.get('/settings', authenticate, requireDirigente, asyncHandler(getCompanySettings));
router.put('/settings', authenticate, requireDirigente, asyncHandler(updateCompanySettings));

module.exports = router;
