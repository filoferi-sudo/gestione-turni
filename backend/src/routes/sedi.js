const express = require('express');
const { listSedi, createSede, updateSede, deleteSede } = require('../controllers/sedeController');
const { listAreas, createArea, reorderAreas } = require('../controllers/areaController');
const { authenticate, requireManager, requireDirigente } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Lettura aperta a responsabile e dirigente: entrambi devono poter navigare tra le sedi già
// configurate. Creazione/modifica/eliminazione riservate al dirigente (struttura organizzativa).
router.get('/', authenticate, requireManager, asyncHandler(listSedi));
router.post('/', authenticate, requireDirigente, asyncHandler(createSede));
router.put('/:id', authenticate, requireDirigente, asyncHandler(updateSede));
router.delete('/:id', authenticate, requireDirigente, asyncHandler(deleteSede));

// Aree operative, annidate sotto la sede a cui appartengono (list/create/reorder). Update/delete
// di una singola area sono invece flat sotto /api/areas/:id (vedi routes/areas.js), perché non
// serve conoscere la sede per identificarla univocamente.
router.get('/:sedeId/areas', authenticate, requireManager, asyncHandler(listAreas));
router.post('/:sedeId/areas', authenticate, requireDirigente, asyncHandler(createArea));
router.put('/:sedeId/areas/reorder', authenticate, requireDirigente, asyncHandler(reorderAreas));

module.exports = router;
