const express = require('express');
const { login, firstLoginSetup, me, passwordPolicy } = require('../controllers/authController');
const { sendVerification, changeEmail, verifyEmail } = require('../controllers/emailVerificationController');
const { authenticate, authenticateFirstAccess } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(login));
router.post('/first-login-setup', authenticateFirstAccess, asyncHandler(firstLoginSetup));
router.get('/password-policy', asyncHandler(passwordPolicy));
router.get('/me', authenticate, asyncHandler(me));

// Verifica email (Fase E2). verify-email è PUBBLICO: il token è la prova, nessuna sessione richiesta
// (il link arriva via email e può essere aperto da un browser non loggato). send-verification e
// change-email agiscono sull'utente della sessione corrente.
router.post('/verify-email', asyncHandler(verifyEmail));
router.post('/send-verification', authenticate, asyncHandler(sendVerification));
router.post('/change-email', authenticate, asyncHandler(changeEmail));

module.exports = router;
