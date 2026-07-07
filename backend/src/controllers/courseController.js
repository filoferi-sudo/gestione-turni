const pool = require('../config/db');
const { isWithinDailyWindow } = require('../utils/timeWindow');
const { toDateOnly, isValidDateString } = require('../services/shiftExpansion');

function toHHMM(pgTime) {
  return pgTime ? pgTime.slice(0, 5) : pgTime;
}

function toSafeCourse(row) {
  return {
    id: row.id,
    name: row.name,
    date: toDateOnly(row.date),
    startTime: toHHMM(row.start_time),
    endTime: toHHMM(row.end_time),
    instructorId: row.instructor_id,
    instructorUsername: row.instructor_username,
    note: row.note,
    createdBy: row.created_by,
  };
}

async function assertInstructorExists(instructorId) {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND role = 'user' AND category = 'istruttore'`,
    [instructorId]
  );
  return rows.length > 0;
}

// GET /api/courses?start=YYYY-MM-DD&end=YYYY-MM-DD (autenticati: usato sia dagli istruttori
// per la propria vista di sola lettura, sia da responsabile/dirigente per la gestione).
// A differenza dei turni, i corsi non sono filtrati per utente: più corsi sovrapposti nello
// stesso orario sono normali (istruttori diversi, spazi diversi) e vanno mostrati tutti insieme.
async function listCourses(req, res) {
  const { start, end } = req.query;

  if (!isValidDateString(start) || !isValidDateString(end) || start > end) {
    return res.status(400).json({ error: 'Parametri start/end non validi (formato YYYY-MM-DD)' });
  }

  const { rows } = await pool.query(
    `SELECT c.*, u.username AS instructor_username
       FROM courses c
       JOIN users u ON u.id = c.instructor_id
      WHERE c.date BETWEEN $1 AND $2
      ORDER BY c.date, c.start_time`,
    [start, end]
  );

  return res.json({ courses: rows.map(toSafeCourse) });
}

// POST /api/courses (responsabile o dirigente)
async function createCourse(req, res) {
  const { name, date, startTime, endTime, instructorId, note } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Il nome del corso è obbligatorio' });
  }
  if (!isValidDateString(date)) {
    return res.status(400).json({ error: 'La data è obbligatoria (YYYY-MM-DD)' });
  }
  if (!isWithinDailyWindow(startTime, endTime)) {
    return res.status(400).json({ error: 'Orario non valido: deve essere compreso tra 07:30 e 23:00' });
  }
  if (!instructorId || !(await assertInstructorExists(instructorId))) {
    return res.status(400).json({ error: 'Istruttore non valido' });
  }

  const { rows } = await pool.query(
    `INSERT INTO courses (name, date, start_time, end_time, instructor_id, note, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *, (SELECT username FROM users WHERE id = $5) AS instructor_username`,
    [name.trim(), date, startTime, endTime, instructorId, note || null, req.user.id]
  );

  return res.status(201).json({ course: toSafeCourse(rows[0]) });
}

// PUT /api/courses/:id (responsabile o dirigente) - usata sia dal modulo di modifica completo
// sia dallo spostamento rapido via drag & drop (che invia solo date/startTime/endTime).
async function updateCourse(req, res) {
  const { id } = req.params;
  const { name, date, startTime, endTime, instructorId, note } = req.body;

  const { rows: existingRows } = await pool.query('SELECT * FROM courses WHERE id = $1', [id]);
  const existing = existingRows[0];
  if (!existing) {
    return res.status(404).json({ error: 'Corso non trovato' });
  }

  const finalName = name !== undefined ? name : existing.name;
  const finalDate = date !== undefined ? date : toDateOnly(existing.date);
  const finalStartTime = startTime || existing.start_time.slice(0, 5);
  const finalEndTime = endTime || existing.end_time.slice(0, 5);
  const finalInstructorId = instructorId !== undefined ? instructorId : existing.instructor_id;

  if (!finalName || !finalName.trim()) {
    return res.status(400).json({ error: 'Il nome del corso è obbligatorio' });
  }
  if (!isValidDateString(finalDate)) {
    return res.status(400).json({ error: 'La data è obbligatoria (YYYY-MM-DD)' });
  }
  if (!isWithinDailyWindow(finalStartTime, finalEndTime)) {
    return res.status(400).json({ error: 'Orario non valido: deve essere compreso tra 07:30 e 23:00' });
  }
  if (finalInstructorId !== existing.instructor_id && !(await assertInstructorExists(finalInstructorId))) {
    return res.status(400).json({ error: 'Istruttore non valido' });
  }

  const { rows } = await pool.query(
    `UPDATE courses
        SET name = $1, date = $2, start_time = $3, end_time = $4, instructor_id = $5, note = $6
      WHERE id = $7
      RETURNING *, (SELECT username FROM users WHERE id = $5) AS instructor_username`,
    [finalName.trim(), finalDate, finalStartTime, finalEndTime, finalInstructorId, note !== undefined ? note : existing.note, id]
  );

  return res.json({ course: toSafeCourse(rows[0]) });
}

// DELETE /api/courses/:id (responsabile o dirigente)
async function deleteCourse(req, res) {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM courses WHERE id = $1', [id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Corso non trovato' });
  }
  return res.status(204).send();
}

module.exports = { listCourses, createCourse, updateCourse, deleteCourse };
