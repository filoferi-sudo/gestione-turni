const express = require('express');
const { describeAction, executeAction } = require('../controllers/emailActionController');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Email Actions (Fase E5). Entrambe PUBBLICHE: il token è la prova.
//   GET  /:token  descrive l'azione per la schermata di conferma (NON muta nulla).
//   POST /:token  esegue l'azione (consuma il token, monouso).
router.get('/:token', asyncHandler(describeAction));
router.post('/:token', asyncHandler(executeAction));

module.exports = router;
