const express = require('express');
const {
  listRequests,
  listMyRequests,
  approveRequest,
  rejectRequest,
} = require('../controllers/cancellationController');
const { authenticate, requireManager } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get('/mine', authenticate, asyncHandler(listMyRequests));
router.get('/', authenticate, requireManager, asyncHandler(listRequests));
router.post('/:id/approve', authenticate, requireManager, asyncHandler(approveRequest));
router.post('/:id/reject', authenticate, requireManager, asyncHandler(rejectRequest));

module.exports = router;
