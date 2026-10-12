const express = require('express');
const {
  listCompanies,
  createCompany,
  updateCompany,
  createCompanyDirigente,
  listCompanyDirigenti,
  regenerateDirigenteCode,
  getPlatformStats,
} = require('../controllers/companyController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Tutte le route qui sono riservate al super admin: gestione anagrafica società e statistiche di
// piattaforma. Nessuna di queste entra nei dati operativi (turni/corsi) di una specifica società.
router.get('/', authenticate, requireSuperAdmin, asyncHandler(listCompanies));
router.get('/stats', authenticate, requireSuperAdmin, asyncHandler(getPlatformStats));
router.post('/', authenticate, requireSuperAdmin, asyncHandler(createCompany));
router.put('/:id', authenticate, requireSuperAdmin, asyncHandler(updateCompany));
router.post('/:id/dirigente', authenticate, requireSuperAdmin, asyncHandler(createCompanyDirigente));
// Recupero dell'onboarding: stato dei dirigenti e nuovo codice di primo accesso se quello iniziale
// è andato perso (prima non esisteva alcun modo per il Super Admin di rimediare).
router.get('/:id/dirigenti', authenticate, requireSuperAdmin, asyncHandler(listCompanyDirigenti));
router.post('/:id/dirigenti/:userId/regenerate-code', authenticate, requireSuperAdmin, asyncHandler(regenerateDirigenteCode));

module.exports = router;
