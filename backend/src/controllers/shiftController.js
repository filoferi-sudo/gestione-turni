const pool = require('../config/db');
const { isWithinDailyWindow } = require('../utils/timeWindow');
const { parseRecurrenceRule } = require('../utils/recurrence');
const { getExpandedShifts, toDateOnly, isValidDateString, toSafeShift } = require('../services/shiftExpansion');

const SHIFT_TYPES = ['fixed', 'mobile', 'volante'];
const SELF_CANCEL_MIN_DAYS = 5;

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

  const shifts = await getExpandedShifts({ start, end, targetUserId });
  return res.json({ shifts });
}

async function assertUserExists(userId) {
  const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  return rows.length > 0;
}

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// GET /api/shifts/available - turni volanti non ancora accettati da nessuno (tutti gli utenti autenticati)
async function listAvailableShifts(req, res) {
  const { rows } = await pool.query(
    `SELECT s.*, creator.username AS created_by_username
       FROM shifts s
       JOIN users creator ON creator.id = s.created_by
      WHERE s.type = 'volante' AND s.user_id IS NULL AND s.date >= $1
      ORDER BY s.date, s.start_time`,
    [todayDateString()]
  );

  return res.json({
    shifts: rows.map((row) => ({
      id: row.id,
      date: toDateOnly(row.date),
      startTime: row.start_time.slice(0, 5),
      endTime: row.end_time.slice(0, 5),
      note: row.note,
      createdByUsername: row.created_by_username,
    })),
  });
}

// POST /api/shifts/:id/claim - il primo dipendente che lo richiede lo riceve automaticamente
async function claimShift(req, res) {
  const { id } = req.params;

  const { rows, rowCount } = await pool.query(
    `UPDATE shifts SET user_id = $1
      WHERE id = $2 AND type = 'volante' AND user_id IS NULL
      RETURNING *`,
    [req.user.id, id]
  );

  if (rowCount === 0) {
    return res.status(409).json({ error: 'Il turno non è più disponibile' });
  }

  return res.json({ shift: toSafeShift(rows[0]) });
}

function validateTypeFields({ type, date, recurrenceRule }) {
  if (type === 'mobile' || type === 'volante') {
    if (!isValidDateString(date)) {
      return { error: 'La data è obbligatoria (YYYY-MM-DD) per turni mobili e volanti' };
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

// POST /api/shifts (responsabile o dirigente)
async function createShift(req, res) {
  const { userId, type, startTime, endTime, note, date, recurrenceRule } = req.body;

  if (!SHIFT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type deve essere uno tra ${SHIFT_TYPES.join(', ')}` });
  }

  if (type !== 'volante' && !userId) {
    return res.status(400).json({ error: 'userId è obbligatorio per turni fissi e mobili' });
  }

  if (!isWithinDailyWindow(startTime, endTime)) {
    return res.status(400).json({ error: 'Orario non valido: deve essere compreso tra 07:30 e 23:00' });
  }

  if (userId && !(await assertUserExists(userId))) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }

  const result = validateTypeFields({ type, date, recurrenceRule });
  if (result.error) return res.status(400).json({ error: result.error });

  // I turni volanti nascono senza dipendente assegnato: verranno accettati in un secondo momento
  const finalUserId = type === 'volante' ? null : userId;

  const { rows } = await pool.query(
    `INSERT INTO shifts (user_id, start_time, end_time, date, type, note, created_by, recurrence_rule)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [finalUserId, startTime, endTime, result.finalDate, type, note || null, req.user.id, result.finalRecurrenceRule]
  );

  return res.status(201).json({ shift: toSafeShift(rows[0]) });
}

// PUT /api/shifts/:id (responsabile o dirigente)
async function updateShift(req, res) {
  const { id } = req.params;
  const { userId, type, startTime, endTime, note, date, recurrenceRule } = req.body;

  const { rows: existingRows } = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
  const existing = existingRows[0];
  if (!existing) {
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

  if (finalUserId && finalUserId !== existing.user_id && !(await assertUserExists(finalUserId))) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }

  const candidateDate = date !== undefined ? date : toDateOnly(existing.date);
  const candidateRule = recurrenceRule || existing.recurrence_rule;
  const result = validateTypeFields({ type: finalType, date: candidateDate, recurrenceRule: candidateRule });
  if (result.error) return res.status(400).json({ error: result.error });

  const { rows } = await pool.query(
    `UPDATE shifts
        SET user_id = $1, start_time = $2, end_time = $3, date = $4,
            type = $5, note = $6, recurrence_rule = $7
      WHERE id = $8
      RETURNING *`,
    [
      finalUserId,
      finalStartTime,
      finalEndTime,
      result.finalDate,
      finalType,
      note !== undefined ? note : existing.note,
      result.finalRecurrenceRule,
      id,
    ]
  );

  return res.json({ shift: toSafeShift(rows[0]) });
}

// DELETE /api/shifts/:id (responsabile o dirigente: cancellazione forzata, qualunque tipo)
async function deleteShift(req, res) {
  const { id } = req.params;
  const { rowCount } = await pool.query('DELETE FROM shifts WHERE id = $1', [id]);
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Turno non trovato' });
  }
  return res.status(204).send();
}

function daysUntil(dateStr) {
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  return Math.round((target - todayLocal) / 86400000);
}

// DELETE /api/shifts/:id/self - cancellazione richiesta dal dipendente titolare del turno.
// Se mancano almeno 5 giorni viene eliminato subito, altrimenti si apre una richiesta di approvazione.
async function deleteShiftSelf(req, res) {
  const { id } = req.params;

  const { rows } = await pool.query('SELECT * FROM shifts WHERE id = $1', [id]);
  const shift = rows[0];

  if (!shift) {
    return res.status(404).json({ error: 'Turno non trovato' });
  }
  if (shift.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Non puoi cancellare un turno non tuo' });
  }
  if (shift.type === 'fixed') {
    return res.status(400).json({ error: 'I turni fissi ricorrenti possono essere rimossi solo dal responsabile' });
  }

  const shiftDate = toDateOnly(shift.date);
  if (daysUntil(shiftDate) >= SELF_CANCEL_MIN_DAYS) {
    await pool.query('DELETE FROM shifts WHERE id = $1', [id]);
    return res.json({ deleted: true });
  }

  const { rows: pendingRows } = await pool.query(
    `SELECT * FROM cancellation_requests WHERE shift_id = $1 AND status = 'pending'`,
    [id]
  );
  if (pendingRows.length > 0) {
    return res.status(409).json({ error: 'Esiste già una richiesta di cancellazione in attesa per questo turno' });
  }

  const { rows: requestRows } = await pool.query(
    `INSERT INTO cancellation_requests
       (shift_id, requested_by, shift_date, shift_start_time, shift_end_time, shift_note, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING *`,
    [id, req.user.id, shift.date, shift.start_time, shift.end_time, shift.note]
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
