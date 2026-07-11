const express = require('express');
const {
  getCatalog,
  listPlans,
  createPlan,
  updatePlan,
  getCompanySubscription,
  setCompanySubscription,
} = require('../controllers/planController');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Vocabolario delle chiavi configurabili (limiti/feature) per la UI di editing dei piani.
router.get('/catalog', authenticate, requireSuperAdmin, asyncHandler(getCatalog));

// Amministrazione dei piani e degli abbonamenti: funzione di PIATTAFORMA, riservata al Super Admin
// (come /api/companies). Nessun endpoint qui entra nei dati operativi di una società. I limiti/le
// feature dei piani sono dati configurabili a runtime, non costanti nel codice.
router.get('/', authenticate, requireSuperAdmin, asyncHandler(listPlans));
router.post('/', authenticate, requireSuperAdmin, asyncHandler(createPlan));
router.put('/:id', authenticate, requireSuperAdmin, asyncHandler(updatePlan));

// Abbonamento di una specifica società (assegnazione piano + override per-cliente + consumi).
router.get('/subscriptions/:companyId', authenticate, requireSuperAdmin, asyncHandler(getCompanySubscription));
router.put('/subscriptions/:companyId', authenticate, requireSuperAdmin, asyncHandler(setCompanySubscription));

module.exports = router;
