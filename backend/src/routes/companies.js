const express = require('express');
const {
  listCompanies,
  createCompany,
  updateCompany,
  createCompanyDirigente,
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

module.exports = router;
