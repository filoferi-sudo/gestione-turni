const express = require('express');
const {
  listRequests,
  listMyRequests,
  approveRequest,
  rejectRequest,
} = require('../controllers/cancellationController');
const { authenticate, requireManager } = require('../middleware/auth');
const { requirePermission } = require('../middleware/requirePermission');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/mine', authenticate, asyncHandler(listMyRequests));
// Vedere l'elenco resta di tutti i manager (requireManager). APPROVARE/RIFIUTARE è invece un permesso
// granulare (RBAC): il default `cancellations.approve` = admin+dirigente (identico al gate storico),
// ma il Dirigente può revocarlo a un singolo responsabile (override). Comportamento invariato finché
// non si imposta un override.
router.get('/', authenticate, requireManager, asyncHandler(listRequests));
router.post('/:id/approve', authenticate, requirePermission('cancellations.approve'), asyncHandler(approveRequest));
router.post('/:id/reject', authenticate, requirePermission('cancellations.approve'), asyncHandler(rejectRequest));

module.exports = router;
