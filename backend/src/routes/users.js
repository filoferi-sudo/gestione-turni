const express = require('express');
const {
  createUser,
  listUsers,
  resetPassword,
  regenerateCode,
  deleteUser,
  updateUserAreas,
} = require('../controllers/userController');
const { getUserContract, upsertUserContract } = require('../controllers/contractController');
const { getUserAvailability, replaceUserAvailability } = require('../controllers/availabilityController');
const { authenticate, requireManager } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.post('/', authenticate, requireManager, asyncHandler(createUser));
router.get('/', authenticate, requireManager, asyncHandler(listUsers));
router.post('/:id/reset-password', authenticate, requireManager, asyncHandler(resetPassword));
router.post('/:id/regenerate-code', authenticate, requireManager, asyncHandler(regenerateCode));
router.put('/:id/areas', authenticate, requireManager, asyncHandler(updateUserAreas));
router.get('/:id/contract', authenticate, requireManager, asyncHandler(getUserContract));
router.put('/:id/contract', authenticate, requireManager, asyncHandler(upsertUserContract));
// Disponibilità dichiarate: a differenza delle altre rotte /users (tutte requireManager), qui basta
// authenticate perché anche il DIPENDENTE accede ai propri dati. L'autorizzazione fine (self, o
// manager della stessa società in sola lettura) è dentro il controller.
router.get('/:id/availability', authenticate, asyncHandler(getUserAvailability));
router.put('/:id/availability', authenticate, asyncHandler(replaceUserAvailability));
router.delete('/:id', authenticate, requireManager, asyncHandler(deleteUser));

module.exports = router;
