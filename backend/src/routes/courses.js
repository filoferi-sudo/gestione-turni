const express = require('express');
const { listCourses, createCourse, updateCourse, deleteCourse } = require('../controllers/courseController');
const { authenticate, requireManager } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// Lettura aperta a tutti gli autenticati: serve sia alla vista di sola lettura degli istruttori
// sia alla gestione di responsabile/dirigente.
router.get('/', authenticate, asyncHandler(listCourses));

router.post('/', authenticate, requireManager, asyncHandler(createCourse));
router.put('/:id', authenticate, requireManager, asyncHandler(updateCourse));
router.delete('/:id', authenticate, requireManager, asyncHandler(deleteCourse));

module.exports = router;
