const pool = require('../config/db');
const { isWithinDailyWindow } = require('../utils/timeWindow');
const { parseRecurrenceRule, occursOn } = require('../utils/recurrence');
const {
  getExpandedShifts,
  hasOverlappingShift,
  toDateOnly,
  isValidDateString,
  toSafeShift,
} = require('../services/shiftExpansion');
const { EMPLOYEE_CATEGORIES } = require('../constants/employeeCategories');

const SHIFT_TYPES = ['fixed', 'mobile', 'volante'];

// GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD&userId=<solo admin/dirigente>
// L'utente standard vede sempre e solo il proprio calendario; responsabile/dirigente vedono tutto o filtrano per userId.
async function getCalendar(req, res) {
  const { start, end } = req.query;

  if (!isValidDateString(start) || !isValidDateString(end) || start > end) {
    return res.status(400).json({ error: 'Parametri start/end non validi (formato YYYY-MM-DD)' });
  }

  let targetUserId = null;
  if (req.user.role === 'admin' || req.user.role === 'dirigente') {
    if (req.query.userId) targetUserId = Number(req.query.userId);
  } else {
    targetUserId = req.user.id;
  }

  const shifts = await getExpandedShifts({ start, end, targetUserId, companyId: req.user.companyId });
  return res.json({ shifts });
}

// Verifica che l'utente esista E appartenga alla stessa società di chi sta operando: evita che un
// dirigente/responsabile assegni un turno a un dipendente di un'altra società (anche indovinando
// l'id).
async function assertUserExists(userId, companyId) {
  const { rows } = await pool.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [userId, companyId]);
  return rows.length > 0;
}

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// GET /api/shifts/available - sostituzioni non ancora accettate da nessuno, della propria società.
// Per un dipendente il risultato viene filtrato a quelle compatibili (ruolo richiesto + nessuna
// sovrapposizione con i propri turni già assegnati); un responsabile/dirigente le vede tutte
// (vista "manage", per poterle comunque eliminare a prescindere dalla compatibilità).
async function listAvailableShifts(req, res) {
  const { rows } = await pool.query(
    `SELECT s.*, creator.username AS created_by_username, origin_user.username AS origin_username
       FROM shifts s
       JOIN users creator ON creator.id = s.created_by
       LEFT JOIN shifts origin ON origin.id = s.origin_shift_id
       LEFT JOIN users origin_user ON origin_user.id = origin.user_id
      WHERE s.type = 'volante' AND s.user_id IS NULL AND s.status = 'active'
        AND s.date >= $1 AND s.company_id = $2
      ORDER BY s.date, s.start_time`,
    [todayDateString(), req.user.companyId]
  );

  let visibleRows = rows;
  if (req.user.role === 'user') {
    const { rows: userRows } = await pool.query('SELECT category FROM users WHERE id = $1', [req.user.id]);
    const myCategory = userRows[0]?.category || null;

    visibleRows = [];
    for (const row of rows) {
      if (row.required_category && row.required_category !== myCategory) continue;
      const overlapping = await hasOverlappingShift({
        userId: req.user.id,
        companyId: req.user.companyId,
        date: toDateOnly(row.date),
        startTime: row.start_time.slice(0, 5),
        endTime: row.end_time.slice(0, 5),
      });
      if (overlapping) continue;
      visibleRows.push(row);
    }
  }

  return res.json({
    shifts: visibleRows.map((row) => ({
      id: row.id,
      date: toDateOnly(row.date),
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      note: row.note,
      requiredCategory: row.required_category,
      createdByUsername: row.created_by_username,
      originUsername: row.origin_username,
    })),
  });
}

// POST /api/shifts/:id/claim - il primo dipendente compatibile che lo richiede lo riceve
// automaticamente. La lista filtrata in listAvailableShifts è solo un aiuto UX: qui si
// riverificano sempre ruolo richiesto e assenza di sovrapposizione, per non fidarsi di una
// richiesta diretta all'endpoint che aggiri il filtro lato client.
async function claimShift(req, res) {
  const { id } = req.params;

  const { rows: shiftRows } = await pool.query(
    `SELECT * FROM shifts WHERE id = $1 AND type = 'volante' AND user_id IS NULL
      AND status = 'active' AND company_id = $2`,
    [id, req.user.companyId]
  );
  const shift = shiftRows[0];
  if (!shift) {
    return res.status(409).json({ error: 'La sostituzione non è più disponibile' });
  }

  const { rows: userRows } = await pool.query('SELECT category FROM users WHERE id = $1', [req.user.id]);
  const myCategory = userRows[0]?.category || null;
  if (shift.required_category && shift.required_category !== myCategory) {
    return res.status(403).json({ error: 'Questa sostituzione richiede un ruolo diverso dal tuo' });
  }

  const overlapping = await hasOverlappingShift({
    userId: req.user.id,
    companyId: req.user.companyId,
    date: toDateOnly(shift.date),
    startTime: shift.start_time.slice(0, 5),
    endTime: shift.end_time.slice(0, 5),
  });
  if (overlapping) {
    return res.status(409).json({ error: 'Hai già un turno che si sovrappone a questo orario' });
  }

  const { rows, rowCount } = await pool.query(
    `UPDATE shifts SET user_id = $1
      WHERE id = $2 AND type = 'volante' AND user_id IS NULL AND status = 'active' AND company_id = $3
      RETURNING *`,
    [req.user.id, id, req.user.companyId]
  );

  if (rowCount === 0) {
    return res.status(409).json({ error: 'La sostituzione non è più disponibile' });
  }

  return res.json({ shift: toSafeShift(rows[0]) });
}

function validateTypeFields({ type, date, recurrenceRule }) {
  if (type === 'mobile' || type === 'volante') {
    if (!isValidDateString(date)) {
      return { error: 'La data è obbligatoria (YYYY-MM-DD) per turni singoli e volanti' };
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

// Le sostituzioni (type='volante') create manualmente devono indicare il ruolo richiesto
// (categoria dipendente): è così che il sistema decide a chi mostrarle.
function validateRequiredCategory(type, requiredCategory) {
  if (type !== 'volante') return { finalRequiredCategory: null };
  if (!EMPLOYEE_CATEGORIES.includes(requiredCategory)) {
    return { error: `requiredCategory deve essere uno tra ${EMPLOYEE_CATEGORIES.join(', ')}` };
  }
  return { finalRequiredCategory: requiredCategory };
}

// POST /api/shifts (responsabile o dirigente)
async function createShift(req, res) {
  const { userId, type, startTime, endTime, note, date, recurrenceRule, requiredCategory } = req.body;

  if (!SHIFT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type deve essere uno tra ${SHIFT_TYPES.join(', ')}` });
  }

  if (type !== 'volante' && !userId) {
    return res.status(400).json({ error: 'userId è obbligatorio per turni fissi e singoli' });
  }

  if (!isWithinDailyWindow(startTime, endTime)) {
    return res.status(400).json({ error: 'Orario non valido: deve essere compreso tra 07:30 e 23:00' });
  }

  if (userId && !(await assertUserExists(userId, req.user.companyId))) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }

  const result = validateTypeFields({ type, date, recurrenceRule });
  if (result.error) return res.status(400).json({ error: result.error });

  const categoryResult = validateRequiredCategory(type, requiredCategory);
  if (categoryResult.error) return res.status(400).json({ error: categoryResult.error });

  // I turni volanti (sostituzioni) nascono senza dipendente assegnato: verranno accettati in un secondo momento
  const finalUserId = type === 'volante' ? null : userId;

  const { rows } = await pool.query(
    `INSERT INTO shifts (user_id, company_id, start_time, end_time, date, type, note, created_by, recurrence_rule, required_category)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      finalUserId,
      req.user.companyId,
      startTime,
      endTime,
      result.finalDate,
      type,
      note || null,
      req.user.id,
      result.finalRecurrenceRule,
      categoryResult.finalRequiredCategory,
    ]
  );

  return res.status(201).json({ shift: toSafeShift(rows[0]) });
}

// PUT /api/shifts/:id (responsabile o dirigente)
async function updateShift(req, res) {
  const { id } = req.params;
  const { userId, type, startTime, endTime, note, date, recurrenceRule, requiredCategory } = req.body;

  const { rows: existingRows } = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
  const existing = existingRows[0];
  if (!existing || existing.company_id !== req.user.companyId) {
    return res.status(404).json({ error: 'Turno non trovato' });
  }

  const finalType = type || existing.type;
  const finalStartTime = startTime || existing.start_time.slice(0, 5);
  const finalEndTime = endTime || existing.end_time.slice(0, 5);
  const finalUserId = userId !== undefined ? userId : existing.user_id;

  if (!SHIFT_TYPES.includes(finalType)) {
    return res.status(400).json({ error: `type deve essere uno tra ${SHIFT_TYPES.join(', ')}` });
  }

  if (!isWithinDailyWindow(finalStartTime, finalEndTime)) {
    return res.status(400).json({ error: 'Orario non valido: deve essere compreso tra 07:30 e 23:00' });
  }

  if (finalUserId && finalUserId !== existing.user_id && !(await assertUserExists(finalUserId, req.user.companyId))) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }

  const candidateDate = date !== undefined ? date : toDateOnly(existing.date);
  const candidateRule = recurrenceRule || existing.recurrence_rule;
  const result = validateTypeFields({ type: finalType, date: candidateDate, recurrenceRule: candidateRule });
  if (result.error) return res.status(400).json({ error: result.error });

  const candidateRequiredCategory = requiredCategory !== undefined ? requiredCategory : existing.required_category;
  const categoryResult = validateRequiredCategory(finalType, candidateRequiredCategory);
  if (categoryResult.error) return res.status(400).json({ error: categoryResult.error });

  const { rows } = await pool.query(
    `UPDATE shifts
        SET user_id = $1, start_time = $2, end_time = $3, date = $4,
            type = $5, note = $6, recurrence_rule = $7, required_category = $8
      WHERE id = $9
      RETURNING *`,
    [
      finalUserId,
      finalStartTime,
      finalEndTime,
      result.finalDate,
      finalType,
      note !== undefined ? note : existing.note,
      result.finalRecurrenceRule,
      categoryResult.finalRequiredCategory,
      id,
    ]
  );

  return res.json({ shift: toSafeShift(rows[0]) });
}

// DELETE /api/shifts/:id (responsabile o dirigente: cancellazione forzata, qualunque tipo)
async function deleteShift(req, res) {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM shifts WHERE id = $1 AND company_id = $2', [
    id,
    req.user.companyId,
  ]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Turno non trovato' });
  }
  return res.status(204).send();
}

// DELETE /api/shifts/:id/self - cancellazione richiesta dal dipendente titolare del turno.
// Qualunque sia il tipo di turno (fisso, singolo, volante) la cancellazione richiede sempre
// l'approvazione del responsabile/dirigente: non esiste più cancellazione automatica.
// Per i turni fissi ricorrenti va indicata anche la data dell'occorrenza da cancellare
// (il turno stesso è condiviso da tutte le occorrenze della serie).
async function deleteShiftSelf(req, res) {
  const { id } = req.params;
  const { date } = req.body;

  const { rows } = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
  const shift = rows[0];

  if (!shift) {
    return res.status(404).json({ error: 'Turno non trovato' });
  }
  if (shift.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Non puoi cancellare un turno non tuo' });
  }

  let shiftDate;
  if (shift.type === 'fixed') {
    const anchorDate = toDateOnly(shift.date);
    if (!isValidDateString(date) || !occursOn(shift.recurrence_rule, date, anchorDate)) {
      return res.status(400).json({ error: 'Data occorrenza non valida per questo turno ricorrente' });
    }
    shiftDate = date;
  } else {
    shiftDate = toDateOnly(shift.date);
  }

  const { rows: pendingRows } = await pool.query(
    `SELECT * FROM cancellation_requests WHERE shift_id = $1 AND shift_date = $2 AND status = 'pending'`,
    [id, shiftDate]
  );
  if (pendingRows.length > 0) {
    return res.status(409).json({ error: 'Esiste già una richiesta di cancellazione in attesa per questo turno' });
  }

  const { rows: requestRows } = await pool.query(
    `INSERT INTO cancellation_requests
       (shift_id, company_id, requested_by, shift_date, shift_start_time, shift_end_time, shift_note, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
     RETURNING *`,
    [id, req.user.companyId, req.user.id, shiftDate, shift.start_time, shift.end_time, shift.note]
  );

  const request = requestRows[0];
  return res.status(202).json({
    pending: true,
    request: {
      id: request.id,
      shiftId: request.shift_id,
      status: request.status,
      shiftDate: toDateOnly(request.shift_date),
      shiftStartTime: request.shift_start_time.slice(0, 5),
      shiftEndTime: request.shift_end_time.slice(0, 5),
      shiftNote: request.shift_note,
    },
  });
}

module.exports = {
  getCalendar,
  createShift,
  updateShift,
  deleteShift,
  deleteShiftSelf,
  listAvailableShifts,
  claimShift,
};
