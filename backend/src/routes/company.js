const express = require('express');
const { getCompanySettings, updateCompanySettings, getMyEntitlements } = require('../controllers/companySettingsController');
const { authenticate, requireDirigente } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Entitlements della propria società: sola lettura, accessibile a qualunque ruolo con una società
// (serve al frontend di tutti per adattare la UI al piano). L'enforcement resta lato backend.
router.get('/entitlements', authenticate, asyncHandler(getMyEntitlements));

// Impostazioni della PROPRIA società (Fase 7). Diverse da /api/companies/* (anagrafica di
// piattaforma, solo Super Admin): qui sono le REGOLE aziendali, riservate al Dirigente
// (requireDirigente) — il Responsabile gestisce l'operatività ma non modifica le regole.
router.get('/settings', authenticate, requireDirigente, asyncHandler(getCompanySettings));
router.put('/settings', authenticate, requireDirigente, asyncHandler(updateCompanySettings));

module.exports = router;
