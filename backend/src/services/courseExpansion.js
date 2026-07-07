const pool = require('../config/db');
const { expandRecurrenceDates } = require('../utils/recurrence');
const { toHHMM, toDateOnly, isValidDateString } = require('./shiftExpansion');

// Espande tutti i corsi (singolo, disponibile/assegnato, fisso ricorrente) in istanze concrete
// nell'intervallo [start, end]. Stessa logica di getExpandedShifts (vedi shiftExpansion.js), con
// instructor_id al posto di user_id. Se targetInstructorId è indicato, filtra solo i corsi di
// quell'istruttore (i corsi disponibili non ancora accettati, con instructor_id NULL, vengono
// così esclusi: restano visibili tramite /api/courses/available). Se targetInstructorId è null
// vengono restituiti tutti i corsi (vista amministratore/istruttore), inclusi i disponibili.
async function getExpandedCourses({ start, end, targetInstructorId }) {
  const instanceParams = [start, end];
  let instanceFilter = '';
  if (targetInstructorId) {
    instanceParams.push(targetInstructorId);
    instanceFilter = ` AND c.instructor_id = $${instanceParams.length}`;
  }

  const { rows: instanceRows } = await pool.query(
    `SELECT c.*, u.username AS instructor_username
       FROM courses c
       LEFT JOIN users u ON u.id = c.instructor_id
      WHERE c.type IN ('mobile', 'volante') AND c.date BETWEEN $1 AND $2${instanceFilter}`,
    instanceParams
  );

  const { rows: fixedRows } = await pool.query(
    `SELECT c.*, u.username AS instructor_username
       FROM courses c
       JOIN users u ON u.id = c.instructor_id
      WHERE c.type = 'fixed'${targetInstructorId ? ' AND c.instructor_id = $1' : ''}`,
    targetInstructorId ? [targetInstructorId] : []
  );

  const instanceCourses = instanceRows.map((row) => ({
    id: `${row.type}-${row.id}`,
    courseId: row.id,
    name: row.name,
    instructorId: row.instructor_id,
    instructorUsername: row.instructor_username || null,
    date: toDateOnly(row.date),
    startTime: toHHMM(row.start_time),
    endTime: toHHMM(row.end_time),
    type: row.type,
    note: row.note,
    createdBy: row.created_by,
  }));

  const fixedCourses = [];
  for (const row of fixedRows) {
    const occurrenceDates = expandRecurrenceDates(row.recurrence_rule, toDateOnly(row.date), start, end);
    for (const occurrenceDate of occurrenceDates) {
      fixedCourses.push({
        id: `fixed-${row.id}-${occurrenceDate}`,
        courseId: row.id,
        name: row.name,
        instructorId: row.instructor_id,
        instructorUsername: row.instructor_username,
        date: occurrenceDate,
        startTime: toHHMM(row.start_time),
        endTime: toHHMM(row.end_time),
        type: 'fixed',
        note: row.note,
        recurrenceRule: row.recurrence_rule,
        createdBy: row.created_by,
      });
    }
  }

  return [...instanceCourses, ...fixedCourses].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  );
}

// Normalizza una riga grezza di `courses` (INSERT/UPDATE ... RETURNING *) per l'invio al client.
function toSafeCourse(row) {
  return {
    id: row.id,
    name: row.name,
    instructorId: row.instructor_id,
    instructorUsername: row.instructor_username || null,
    startTime: toHHMM(row.start_time),
    endTime: toHHMM(row.end_time),
    date: toDateOnly(row.date),
    type: row.type,
    note: row.note,
    createdBy: row.created_by,
    recurrenceRule: row.recurrence_rule,
  };
}

module.exports = { getExpandedCourses, toSafeCourse, toHHMM, toDateOnly, isValidDateString };
