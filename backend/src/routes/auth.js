const express = require('express');
const { login, firstLoginSetup, me, passwordPolicy } = require('../controllers/authController');
const { authenticate, authenticateFirstAccess } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/login', asyncHandler(login));
router.post('/first-login-setup', authenticateFirstAccess, asyncHandler(firstLoginSetup));
router.get('/password-policy', asyncHandler(passwordPolicy));
router.get('/me', authenticate, asyncHandler(me));

module.exports = router;
