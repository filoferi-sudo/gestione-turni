const express = require('express');
const { createUser, listUsers, resetPassword, regenerateCode, deleteUser } = require('../controllers/userController');
const { authenticate, requireManager } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/', authenticate, requireManager, asyncHandler(createUser));
router.get('/', authenticate, requireManager, asyncHandler(listUsers));
router.post('/:id/reset-password', authenticate, requireManager, asyncHandler(resetPassword));
router.post('/:id/regenerate-code', authenticate, requireManager, asyncHandler(regenerateCode));
router.delete('/:id', authenticate, requireManager, asyncHandler(deleteUser));

module.exports = router;
