const express = require('express');
const { getStatus, demoLogin, demoReset, tourAction, tourCheck } = require('../controllers/demoController');
const { requireDemoEnabled, requireDemoCompany } = require('../demo/framework/guard');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Stato pubblico della modalità demo: risponde sempre (anche a demo spenta), così il frontend sa
// se mostrare il bottone "Prova la demo" senza esporre nulla.
router.get('/status', asyncHandler(getStatus));

// Da qui in poi: solo con modalità demo attiva (altrimenti 404, come se il dominio non esistesse).
router.use(requireDemoEnabled);

// Ingresso demo per persona: pubblico (nessun token richiesto), emette un JWT di sessione demo.
router.post('/login', asyncHandler(demoLogin));

// Reinizializza l'ambiente demo della propria società: richiede una sessione demo autenticata
// (authenticate) + società effettivamente demo (requireDemoCompany, 403 su società reale).
router.post('/reset', authenticate, requireDemoCompany, asyncHandler(demoReset));

// Azioni simulate e criteri di avanzamento dei tour: stessa protezione del reset (sessione demo su
// società demo). Un utente reale non può innescarle sulla propria società (403).
router.post('/tour/actions/:name', authenticate, requireDemoCompany, asyncHandler(tourAction));
router.get('/tour/checks/:name', authenticate, requireDemoCompany, asyncHandler(tourCheck));

module.exports = router;
