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
const requireFeature = require('../middleware/requireFeature');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/available', authenticate, asyncHandler(listAvailableShifts));
// Motore avanzato di sostituzione (classifica candidati + proposte mirate) = feature di piano
// 'substitutionEngine'. Gate sui SOLI entry point lato manager: le Sostituzioni "disponibili" di
// base (available/claim) restano sempre attive. Le rotte lato dipendente (/api/proposals/*) NON sono
// gated, per non intrappolare eventuali proposte già inviate se la feature venisse disattivata.
// Default abilitata (retrocompatibile).
router.get('/:id/candidates', authenticate, requireFeature('substitutionEngine'), requireManager, asyncHandler(getShiftCandidates));
// Proposte mirate (Fase 5): invio a candidati scelti + elenco proposte già inviate per il turno.
router.post('/:id/proposals', authenticate, requireFeature('substitutionEngine'), requireManager, asyncHandler(createProposals));
router.get('/:id/proposals', authenticate, requireFeature('substitutionEngine'), requireManager, asyncHandler(listShiftProposals));
router.post('/:id/claim', authenticate, asyncHandler(claimShift));
router.delete('/:id/self', authenticate, asyncHandler(deleteShiftSelf));

router.post('/', authenticate, requireManager, asyncHandler(createShift));
router.put('/:id', authenticate, requireManager, asyncHandler(updateShift));
router.delete('/:id', authenticate, requireManager, asyncHandler(deleteShift));

module.exports = router;
