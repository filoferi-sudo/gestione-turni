const express = require('express');
const { listNotifications, markRead, markAllRead } = require('../controllers/notificationController');
const { getMyPreferences, updateMyPreferences } = require('../controllers/notificationPreferencesController');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Ogni utente autenticato (dipendente, responsabile o dirigente) accede alle PROPRIE notifiche:
// basta authenticate, l'isolamento è per user_id dentro il controller.
router.get('/', authenticate, asyncHandler(listNotifications));
router.post('/read-all', authenticate, asyncHandler(markAllRead));
// Preferenze notifiche (Fase E6): self-service, prima di /:id/read per non collidere con esso.
router.get('/preferences', authenticate, asyncHandler(getMyPreferences));
router.put('/preferences', authenticate, asyncHandler(updateMyPreferences));
router.post('/:id/read', authenticate, asyncHandler(markRead));

module.exports = router;
