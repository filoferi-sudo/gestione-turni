const express = require('express');
const {
  createShift,
  updateShift,
  deleteShift,
  deleteShiftSelf,
  listAvailableShifts,
  claimShift,
  getShiftCandidates,
} = require('../controllers/shiftController');
const {
  createProposals,
  listShiftProposals,
} = require('../controllers/substitutionProposalController');
const { authenticate, requireManager } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/available', authenticate, asyncHandler(listAvailableShifts));
router.get('/:id/candidates', authenticate, requireManager, asyncHandler(getShiftCandidates));
// Proposte mirate (Fase 5): invio a candidati scelti + elenco proposte già inviate per il turno.
router.post('/:id/proposals', authenticate, requireManager, asyncHandler(createProposals));
router.get('/:id/proposals', authenticate, requireManager, asyncHandler(listShiftProposals));
router.post('/:id/claim', authenticate, asyncHandler(claimShift));
router.delete('/:id/self', authenticate, asyncHandler(deleteShiftSelf));

router.post('/', authenticate, requireManager, asyncHandler(createShift));
router.put('/:id', authenticate, requireManager, asyncHandler(updateShift));
router.delete('/:id', authenticate, requireManager, asyncHandler(deleteShift));

module.exports = router;
