const express = require('express');
const { getStatus, listPublicPlans, createCheckout, webhook } = require('../controllers/billingController');
const { authenticate, requireDirigente } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Billing (Step 8, predisposizione pagamenti). Spento di default: con BILLING_ENABLED=false gli
// endpoint di mutazione rispondono 404. Il webhook è pubblico (la sicurezza è la firma HMAC), il
// resto richiede autenticazione; il checkout è riservato al Dirigente.
router.get('/status', authenticate, asyncHandler(getStatus));
router.get('/plans', authenticate, asyncHandler(listPublicPlans));
router.post('/checkout', authenticate, requireDirigente, asyncHandler(createCheckout));
router.post('/webhook', asyncHandler(webhook));

module.exports = router;
