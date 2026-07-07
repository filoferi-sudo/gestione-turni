const express = require('express');
const {
  listRequirements,
  upsertWeeklySchedule,
  createSingleRequirement,
  updateSingleRequirement,
  deleteSingleRequirement,
  editOccurrence,
  getCoverage,
  generateGapShifts,
} = require('../controllers/staffingController');
const { authenticate, requireManager } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Il fabbisogno di personale è uno strumento di pianificazione di responsabile/dirigente: nessun
// endpoint esposto al dipendente, che continua a interagire solo con le Sostituzioni generate
// (SubstitutionsPanel, invariato).
router.use(authenticate, requireManager);

router.get('/requirements', asyncHandler(listRequirements));
router.put('/requirements/weekly', asyncHandler(upsertWeeklySchedule));
router.post('/requirements/single', asyncHandler(createSingleRequirement));
router.put('/requirements/single/:id', asyncHandler(updateSingleRequirement));
router.delete('/requirements/single/:id', asyncHandler(deleteSingleRequirement));
router.put('/requirements/:id/occurrence', asyncHandler(editOccurrence));
router.post('/requirements/:id/generate-gap', asyncHandler(generateGapShifts));
router.get('/coverage', asyncHandler(getCoverage));

module.exports = router;
