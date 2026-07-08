const pool = require('../config/db');
const { isWithinDailyWindow } = require('../utils/timeWindow');
const { parseRecurrenceRule } = require('../utils/recurrence');
const { getExpandedCourses, toDateOnly, isValidDateString, toSafeCourse } = require('../services/courseExpansion');
const audit = require('../services/auditService');

const COURSE_TYPES = ['fixed', 'mobile', 'volante'];

// GET /api/courses?start=YYYY-MM-DD&end=YYYY-MM-DD&areaId=<obbligatoria>&instructorId=<opzionale>
// A differenza del calendario turni, qui non c'è auto-filtro per ruolo: sia responsabile/dirigente
// sia istruttore vedono di default tutti i corsi dell'area (anche di altri istruttori assegnati
// alla stessa area), perché il senso del Calendario Corsi è mostrare l'intera programmazione
// dell'area. instructorId è un filtro opzionale (usato dal selettore "Tutti gli istruttori").
async function listCourses(req, res) {
  const { start, end } = req.query;
  const areaId = Number(req.query.areaId);

  if (!isValidDateString(start) || !isValidDateString(end) || start > end) {
    return res.status(400).json({ error: 'Parametri start/end non validi (formato YYYY-MM-DD)' });
  }
  const area = await assertAreaExists(areaId, req.user.companyId, 'courses');
  if (!area) {
    return res.status(404).json({ error: 'Area operativa non trovata' });
  }

  const targetInstructorId = req.query.instructorId ? Number(req.query.instructorId) : null;
  const courses = await getExpandedCourses({ start, end, targetInstructorId, companyId: req.user.companyId, areaId });
  return res.json({ courses });
}

// Verifica che l'area esista, appartenga alla società di chi opera, e usi il motore di calendario
// atteso ('courses'): un'area in modalità 'shifts' non può ospitare corsi. Ritorna la riga
// dell'area (serve sede_id) con in più l'orario calendario configurato per la sua sede, usato per
// validare che i corsi stiano dentro la fascia oraria scelta dal Dirigente per quella sede.
async function assertAreaExists(areaId, companyId, expectedMode) {
  if (!areaId) return null;
  const { rows } = await pool.query(
    `SELECT oa.*, s.calendar_start_time, s.calendar_end_time
       FROM operational_areas oa
       JOIN sedi s ON s.id = oa.sede_id
      WHERE oa.id = $1 AND oa.company_id = $2 AND oa.calendar_mode = $3`,
    [areaId, companyId, expectedMode]
  );
  return rows[0] || null;
}

// Un istruttore può accettare/essere assegnato a un corso solo se è assegnato all'area operativa
// a cui appartiene quel corso (sostituisce il vecchio controllo per categoria 'istruttore').
async function isUserAssignedToArea(userId, areaId) {
  const { rows } = await pool.query('SELECT 1 FROM user_areas WHERE user_id = $1 AND area_id = $2', [userId, areaId]);
  return rows.length > 0;
}

async function assertInstructorExists(instructorId, companyId, areaId) {
  const { rows } = await pool.query(
    `SELECT u.id FROM users u
       JOIN user_areas ua ON ua.user_id = u.id
      WHERE u.id = $1 AND u.role = 'user' AND u.company_id = $2 AND ua.area_id = $3`,
    [instructorId, companyId, areaId]
  );
  return rows.length > 0;
}

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// GET /api/courses/available?areaId=<obbligatoria> - corsi disponibili non ancora accettati di
// una specifica area (tutti gli utenti autenticati: la UI li propone solo agli assegnati a
// quell'area, ma non c'è nulla di sensibile da nascondere agli altri ruoli).
async function listAvailableCourses(req, res) {
  const areaId = Number(req.query.areaId);
  const area = await assertAreaExists(areaId, req.user.companyId, 'courses');
  if (!area) {
    return res.status(404).json({ error: 'Area operativa non trovata' });
  }

  const { rows } = await pool.query(
    `SELECT c.*, creator.username AS created_by_username
       FROM courses c
       JOIN users creator ON creator.id = c.created_by
      WHERE c.type = 'volante' AND c.instructor_id IS NULL AND c.date >= $1
        AND c.company_id = $2 AND c.area_id = $3
      ORDER BY c.date, c.start_time`,
    [todayDateString(), req.user.companyId, areaId]
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
// A differenza dei turni volanti (aperti a chiunque), solo chi è assegnato all'area operativa a
// cui appartiene il corso può accettarlo (sostituisce il vecchio controllo per categoria
// 'istruttore'): non è nel JWT, va verificato a DB ad ogni richiesta.
async function claimCourse(req, res) {
  const { id } = req.params;

  const { rows: courseRows } = await pool.query(
    `SELECT * FROM courses WHERE id = $1 AND type = 'volante' AND instructor_id IS NULL AND company_id = $2`,
    [id, req.user.companyId]
  );
  const course = courseRows[0];
  if (!course) {
    return res.status(409).json({ error: 'Il corso non è più disponibile' });
  }

  if (!(await isUserAssignedToArea(req.user.id, course.area_id))) {
    return res.status(403).json({ error: 'Questo corso appartiene a un\'area a cui non sei assegnato' });
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

// POST /api/courses (responsabile o dirigente) - areaId obbligatorio, stesso principio di
// shiftController.createShift: il corso appartiene sempre all'area/tab in cui viene creato.
async function createCourse(req, res) {
  const { name, instructorId, type, startTime, endTime, note, date, recurrenceRule, areaId } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Il nome del corso è obbligatorio' });
  }
  if (!COURSE_TYPES.includes(type)) {
    return res.status(400).json({ error: `type deve essere uno tra ${COURSE_TYPES.join(', ')}` });
  }
  if (type !== 'volante' && !instructorId) {
    return res.status(400).json({ error: 'instructorId è obbligatorio per corsi fissi e singoli' });
  }

  const area = await assertAreaExists(Number(areaId), req.user.companyId, 'courses');
  if (!area) {
    return res.status(400).json({ error: 'areaId non valido per questa società (o non è un\'area di tipo Corsi)' });
  }

  if (!isWithinDailyWindow(startTime, endTime, area.calendar_start_time.slice(0, 5), area.calendar_end_time.slice(0, 5))) {
    return res.status(400).json({
      error: `Orario non valido: deve essere compreso tra ${area.calendar_start_time.slice(0, 5)} e ${area.calendar_end_time.slice(0, 5)} (orari della sede)`,
    });
  }

  if (instructorId && !(await assertInstructorExists(instructorId, req.user.companyId, area.id))) {
    return res.status(400).json({ error: 'Istruttore non valido (deve essere assegnato a questa area)' });
  }

  const result = validateTypeFields({ type, date, recurrenceRule });
  if (result.error) return res.status(400).json({ error: result.error });

  // I corsi disponibili nascono senza istruttore assegnato: verranno accettati in un secondo momento
  const finalInstructorId = type === 'volante' ? null : instructorId;

  const { rows } = await pool.query(
    `INSERT INTO courses (name, instructor_id, company_id, start_time, end_time, date, type, note, created_by, recurrence_rule, area_id, sede_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
      area.id,
      area.sede_id,
    ]
  );

  await audit.logFromReq(req, { action: 'course.create', entityType: 'course', entityId: rows[0].id, metadata: { type: rows[0].type, areaId: rows[0].area_id } });

  return res.status(201).json({ course: toSafeCourse(rows[0]) });
}

// PUT /api/courses/:id (responsabile o dirigente) - usata sia dal modulo di modifica completo
// sia dallo spostamento rapido via drag & drop (che invia solo date/startTime/endTime).
async function updateCourse(req, res) {
  const { id } = req.params;
  const { name, instructorId, type, startTime, endTime, note, date, recurrenceRule, areaId } = req.body;

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

  let finalAreaId = existing.area_id;
  let finalSedeId = existing.sede_id;
  let areaForWindow = null;
  if (areaId !== undefined) {
    areaForWindow = await assertAreaExists(Number(areaId), req.user.companyId, 'courses');
    if (!areaForWindow) {
      return res.status(400).json({ error: 'areaId non valido per questa società (o non è un\'area di tipo Corsi)' });
    }
    finalAreaId = areaForWindow.id;
    finalSedeId = areaForWindow.sede_id;
  } else {
    areaForWindow = await assertAreaExists(existing.area_id, req.user.companyId, 'courses');
  }

  if (
    !isWithinDailyWindow(
      finalStartTime,
      finalEndTime,
      areaForWindow.calendar_start_time.slice(0, 5),
      areaForWindow.calendar_end_time.slice(0, 5)
    )
  ) {
    return res.status(400).json({
      error: `Orario non valido: deve essere compreso tra ${areaForWindow.calendar_start_time.slice(0, 5)} e ${areaForWindow.calendar_end_time.slice(0, 5)} (orari della sede)`,
    });
  }

  if (
    finalInstructorId &&
    finalInstructorId !== existing.instructor_id &&
    !(await assertInstructorExists(finalInstructorId, req.user.companyId, finalAreaId))
  ) {
    return res.status(400).json({ error: 'Istruttore non valido (deve essere assegnato a questa area)' });
  }

  const candidateDate = date !== undefined ? date : toDateOnly(existing.date);
  const candidateRule = recurrenceRule || existing.recurrence_rule;
  const result = validateTypeFields({ type: finalType, date: candidateDate, recurrenceRule: candidateRule });
  if (result.error) return res.status(400).json({ error: result.error });

  const finalFinalInstructorId = finalType === 'volante' ? null : finalInstructorId;

  const { rows } = await pool.query(
    `UPDATE courses
        SET name = $1, instructor_id = $2, start_time = $3, end_time = $4, date = $5,
            type = $6, note = $7, recurrence_rule = $8, area_id = $9, sede_id = $10
      WHERE id = $11
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
      finalAreaId,
      finalSedeId,
      id,
    ]
  );

  await audit.logFromReq(req, { action: 'course.update', entityType: 'course', entityId: id });

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

  await audit.logFromReq(req, { action: 'course.delete', entityType: 'course', entityId: id });

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
