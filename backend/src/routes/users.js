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
const { getUserOptOuts, addUserOptOut, deleteUserOptOut } = require('../controllers/optOutController');
const { getUserPermissions, setUserPermissions } = require('../controllers/permissionController');
const { authenticate, requireManager, requireDirigente } = require('../middleware/auth');
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
// Opt-out "Non partecipare" (Fase 6): stesso schema di autorizzazione delle disponibilità
// (authenticate + autorizzazione fine nel controller: il dipendente gestisce i propri, il manager
// legge in sola lettura).
router.get('/:id/optouts', authenticate, asyncHandler(getUserOptOuts));
router.post('/:id/optouts', authenticate, asyncHandler(addUserOptOut));
router.delete('/:id/optouts/:optoutId', authenticate, asyncHandler(deleteUserOptOut));
// Permessi granulari per utente (RBAC, layer SaaS): solo il Dirigente personalizza i permessi dei
// propri responsabili/dipendenti (override sopra i default del ruolo).
router.get('/:id/permissions', authenticate, requireDirigente, asyncHandler(getUserPermissions));
router.put('/:id/permissions', authenticate, requireDirigente, asyncHandler(setUserPermissions));
router.delete('/:id', authenticate, requireManager, asyncHandler(deleteUser));

module.exports = router;
