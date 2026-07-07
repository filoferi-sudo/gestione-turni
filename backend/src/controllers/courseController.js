const pool = require('../config/db');
const { isWithinDailyWindow } = require('../utils/timeWindow');
const { parseRecurrenceRule } = require('../utils/recurrence');
const { getExpandedCourses, toDateOnly, isValidDateString, toSafeCourse } = require('../services/courseExpansion');

const COURSE_TYPES = ['fixed', 'mobile', 'volante'];

// GET /api/courses?start=YYYY-MM-DD&end=YYYY-MM-DD&instructorId=<opzionale>
// A differenza del calendario turni, qui non c'è auto-filtro per ruolo: sia responsabile/dirigente
// sia istruttore vedono di default tutti i corsi della fascia oraria (anche di altri istruttori),
// perché il senso del Calendario Corsi è mostrare l'intera programmazione della struttura.
// instructorId è un filtro opzionale (usato dal selettore "Tutti gli istruttori" lato gestione).
async function listCourses(req, res) {
  const { start, end } = req.query;

  if (!isValidDateString(start) || !isValidDateString(end) || start > end) {
    return res.status(400).json({ error: 'Parametri start/end non validi (formato YYYY-MM-DD)' });
  }

  const targetInstructorId = req.query.instructorId ? Number(req.query.instructorId) : null;
  const courses = await getExpandedCourses({ start, end, targetInstructorId, companyId: req.user.companyId });
  return res.json({ courses });
}

async function assertInstructorExists(instructorId, companyId) {
  const { rows } = await pool.query(
    `SELECT id FROM users WHERE id = $1 AND role = 'user' AND category = 'istruttore' AND company_id = $2`,
    [instructorId, companyId]
  );
  return rows.length > 0;
}

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// GET /api/courses/available - corsi disponibili non ancora accettati da nessuno (tutti gli
// utenti autenticati: la UI li propone solo agli istruttori, ma non c'è nulla di sensibile
// da nascondere agli altri ruoli).
async function listAvailableCourses(req, res) {
  const { rows } = await pool.query(
    `SELECT c.*, creator.username AS created_by_username
       FROM courses c
       JOIN users creator ON creator.id = c.created_by
      WHERE c.type = 'volante' AND c.instructor_id IS NULL AND c.date >= $1 AND c.company_id = $2
      ORDER BY c.date, c.start_time`,
    [todayDateString(), req.user.companyId]
  );

  return res.json({
    courses: rows.map((row) => ({
      id: row.id,
      name: row.name,
      date: toDateOnly(row.date),
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      note: row.note,
      createdByUsername: row.created_by_username,
    })),
  });
}

// POST /api/courses/:id/claim - il primo istruttore che lo richiede lo riceve automaticamente.
// A differenza dei turni volanti (aperti a chiunque), solo un account categoria "istruttore" può
// accettare un corso: la categoria non è nel JWT, va verificata a DB ad ogni richiesta.
async function claimCourse(req, res) {
  const { id } = req.params;

  const { rows: userRows } = await pool.query('SELECT category FROM users WHERE id = $1', [req.user.id]);
  if (userRows[0]?.category !== 'istruttore') {
    return res.status(403).json({ error: 'Solo un istruttore può accettare un corso disponibile' });
  }

  const { rows, rowCount } = await pool.query(
    `UPDATE courses SET instructor_id = $1
      WHERE id = $2 AND type = 'volante' AND instructor_id IS NULL AND company_id = $3
      RETURNING *, (SELECT username FROM users WHERE id = $1) AS instructor_username`,
    [req.user.id, id, req.user.companyId]
  );

  if (rowCount === 0) {
    return res.status(409).json({ error: 'Il corso non è più disponibile' });
  }

  return res.json({ course: toSafeCourse(rows[0]) });
}

function validateTypeFields({ type, date, recurrenceRule }) {
  if (type === 'mobile' || type === 'volante') {
    if (!isValidDateString(date)) {
      return { error: 'La data è obbligatoria (YYYY-MM-DD) per corsi singoli e disponibili' };
    }
    return { finalDate: date, finalRecurrenceRule: null };
  }

  try {
    parseRecurrenceRule(recurrenceRule);
  } catch (err) {
    return { error: err.message };
  }
  return { finalDate: isValidDateString(date) ? date : null, finalRecurrenceRule: recurrenceRule };
}

// POST /api/courses (responsabile o dirigente)
async function createCourse(req, res) {
  const { name, instructorId, type, startTime, endTime, note, date, recurrenceRule } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Il nome del corso è obbligatorio' });
  }
  if (!COURSE_TYPES.includes(type)) {
    return res.status(400).json({ error: `type deve essere uno tra ${COURSE_TYPES.join(', ')}` });
  }
  if (type !== 'volante' && !instructorId) {
    return res.status(400).json({ error: 'instructorId è obbligatorio per corsi fissi e singoli' });
  }
  if (!isWithinDailyWindow(startTime, endTime)) {
    return res.status(400).json({ error: 'Orario non valido: deve essere compreso tra 07:30 e 23:00' });
  }
  if (instructorId && !(await assertInstructorExists(instructorId, req.user.companyId))) {
    return res.status(400).json({ error: 'Istruttore non valido' });
  }

  const result = validateTypeFields({ type, date, recurrenceRule });
  if (result.error) return res.status(400).json({ error: result.error });

  // I corsi disponibili nascono senza istruttore assegnato: verranno accettati in un secondo momento
  const finalInstructorId = type === 'volante' ? null : instructorId;

  const { rows } = await pool.query(
    `INSERT INTO courses (name, instructor_id, company_id, start_time, end_time, date, type, note, created_by, recurrence_rule)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *, (SELECT username FROM users WHERE id = $2) AS instructor_username`,
    [
      name.trim(),
      finalInstructorId,
      req.user.companyId,
      startTime,
      endTime,
      result.finalDate,
      type,
      note || null,
      req.user.id,
      result.finalRecurrenceRule,
    ]
  );

  return res.status(201).json({ course: toSafeCourse(rows[0]) });
}

// PUT /api/courses/:id (responsabile o dirigente) - usata sia dal modulo di modifica completo
// sia dallo spostamento rapido via drag & drop (che invia solo date/startTime/endTime).
async function updateCourse(req, res) {
  const { id } = req.params;
  const { name, instructorId, type, startTime, endTime, note, date, recurrenceRule } = req.body;

  const { rows: existingRows } = await pool.query('SELECT * FROM courses WHERE id = $1', [id]);
  const existing = existingRows[0];
  if (!existing || existing.company_id !== req.user.companyId) {
    return res.status(404).json({ error: 'Corso non trovato' });
  }

  const finalName = name !== undefined ? name : existing.name;
  const finalType = type || existing.type;
  const finalStartTime = startTime || existing.start_time.slice(0, 5);
  const finalEndTime = endTime || existing.end_time.slice(0, 5);
  const finalInstructorId = instructorId !== undefined ? instructorId : existing.instructor_id;

  if (!finalName || !finalName.trim()) {
    return res.status(400).json({ error: 'Il nome del corso è obbligatorio' });
  }
  if (!COURSE_TYPES.includes(finalType)) {
    return res.status(400).json({ error: `type deve essere uno tra ${COURSE_TYPES.join(', ')}` });
  }
  if (!isWithinDailyWindow(finalStartTime, finalEndTime)) {
    return res.status(400).json({ error: 'Orario non valido: deve essere compreso tra 07:30 e 23:00' });
  }
  if (
    finalInstructorId &&
    finalInstructorId !== existing.instructor_id &&
    !(await assertInstructorExists(finalInstructorId, req.user.companyId))
  ) {
    return res.status(400).json({ error: 'Istruttore non valido' });
  }

  const candidateDate = date !== undefined ? date : toDateOnly(existing.date);
  const candidateRule = recurrenceRule || existing.recurrence_rule;
  const result = validateTypeFields({ type: finalType, date: candidateDate, recurrenceRule: candidateRule });
  if (result.error) return res.status(400).json({ error: result.error });

  const finalFinalInstructorId = finalType === 'volante' ? null : finalInstructorId;

  const { rows } = await pool.query(
    `UPDATE courses
        SET name = $1, instructor_id = $2, start_time = $3, end_time = $4, date = $5,
            type = $6, note = $7, recurrence_rule = $8
      WHERE id = $9
      RETURNING *, (SELECT username FROM users WHERE id = $2) AS instructor_username`,
    [
      finalName.trim(),
      finalFinalInstructorId,
      finalStartTime,
      finalEndTime,
      result.finalDate,
      finalType,
      note !== undefined ? note : existing.note,
      result.finalRecurrenceRule,
      id,
    ]
  );

  return res.json({ course: toSafeCourse(rows[0]) });
}

// DELETE /api/courses/:id (responsabile o dirigente: cancellazione forzata, qualunque tipo)
async function deleteCourse(req, res) {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM courses WHERE id = $1 AND company_id = $2', [
    id,
    req.user.companyId,
  ]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Corso non trovato' });
  }
  return res.status(204).send();
}

module.exports = {
  listCourses,
  createCourse,
  updateCourse,
  deleteCourse,
  listAvailableCourses,
  claimCourse,
};
