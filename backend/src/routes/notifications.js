const express = require('express');
const { listNotifications, markRead, markAllRead } = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Ogni utente autenticato (dipendente, responsabile o dirigente) accede alle PROPRIE notifiche:
// basta authenticate, l'isolamento è per user_id dentro il controller.
router.get('/', authenticate, asyncHandler(listNotifications));
router.post('/read-all', authenticate, asyncHandler(markAllRead));
router.post('/:id/read', authenticate, asyncHandler(markRead));

module.exports = router;
