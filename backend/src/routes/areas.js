const express = require('express');
const { updateArea, deleteArea } = require('../controllers/areaController');
const { authenticate, requireDirigente } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Update/delete di una singola area operativa, identificata direttamente per id (non serve
// annidarla sotto la sede: vedi routes/sedi.js per list/create/reorder).
router.put('/:id', authenticate, requireDirigente, asyncHandler(updateArea));
router.delete('/:id', authenticate, requireDirigente, asyncHandler(deleteArea));

module.exports = router;
