const express = require('express');
const {
  listMyProposals,
  acceptProposal,
  declineProposal,
} = require('../controllers/substitutionProposalController');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Rotte lato dipendente: agiscono sempre sulle PROPRIE proposte (autorizzazione fine nel
// controller, filtrando per il proprio user_id). Basta authenticate.
router.get('/mine', authenticate, asyncHandler(listMyProposals));
router.post('/:id/accept', authenticate, asyncHandler(acceptProposal));
router.post('/:id/decline', authenticate, asyncHandler(declineProposal));

module.exports = router;
