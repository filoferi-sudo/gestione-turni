const pool = require('../config/db');
const { expandRecurrenceDates } = require('../utils/recurrence');

function toHHMM(pgTime) {
  return pgTime ? pgTime.slice(0, 5) : pgTime;
}

function toDateOnly(pgDate) {
  if (!pgDate) return null;
  if (pgDate instanceof Date) {
    // node-postgres costruisce il Date per le colonne DATE con i componenti locali (new Date(y, m, d)):
    // usare toISOString() qui lo convertirebbe in UTC e farebbe slittare indietro il giorno nei fusi orari UTC+.
    const year = pgDate.getFullYear();
    const month = String(pgDate.getMonth() + 1).padStart(2, '0');
    const day = String(pgDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(pgDate).slice(0, 10);
}

function isValidDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

// Espande tutti i turni (singolo, volante assegnati/non assegnati, fixed ricorrenti) in istanze
// concrete nell'intervallo [start, end]. Se targetUserId è indicato, filtra solo i turni di quel
// dipendente (i turni volanti non ancora accettati, con user_id NULL, vengono così esclusi).
// Se targetUserId è null vengono restituiti i turni di tutti gli utenti (vista amministratore),
// inclusi i volanti ancora disponibili (username null).
async function getExpandedShifts({ start, end, targetUserId }) {
  const instanceParams = [start, end];
  let instanceUserFilter = '';
  if (targetUserId) {
    instanceParams.push(targetUserId);
    instanceUserFilter = ` AND s.user_id = $${instanceParams.length}`;
  }

  const { rows: instanceRows } = await pool.query(
    `SELECT s.*, u.username
       FROM shifts s
       LEFT JOIN users u ON u.id = s.user_id
      WHERE s.type IN ('mobile', 'volante') AND s.date BETWEEN $1 AND $2${instanceUserFilter}`,
    instanceParams
  );

  const { rows: fixedRows } = await pool.query(
    `SELECT s.*, u.username
       FROM shifts s
       JOIN users u ON u.id = s.user_id
      WHERE s.type = 'fixed'${targetUserId ? ' AND s.user_id = $1' : ''}`,
    targetUserId ? [targetUserId] : []
  );

  const fixedIds = fixedRows.map((row) => row.id);
  const excludedDatesByShift = {};
  if (fixedIds.length > 0) {
    const { rows: exceptionRows } = await pool.query(
      'SELECT shift_id, excluded_date FROM shift_exceptions WHERE shift_id = ANY($1::int[])',
      [fixedIds]
    );
    for (const row of exceptionRows) {
      const set = excludedDatesByShift[row.shift_id] || (excludedDatesByShift[row.shift_id] = new Set());
      set.add(toDateOnly(row.excluded_date));
    }
  }

  const instanceShifts = instanceRows.map((row) => ({
    id: `${row.type}-${row.id}`,
    shiftId: row.id,
    userId: row.user_id,
    username: row.username || null,
    date: toDateOnly(row.date),
    startTime: toHHMM(row.start_time),
    endTime: toHHMM(row.end_time),
    type: row.type,
    note: row.note,
    createdBy: row.created_by,
  }));

  const fixedShifts = [];
  for (const row of fixedRows) {
    const occurrenceDates = expandRecurrenceDates(row.recurrence_rule, toDateOnly(row.date), start, end);
    const excludedDates = excludedDatesByShift[row.id];
    for (const occurrenceDate of occurrenceDates) {
      if (excludedDates && excludedDates.has(occurrenceDate)) continue;
      fixedShifts.push({
        id: `fixed-${row.id}-${occurrenceDate}`,
        shiftId: row.id,
        userId: row.user_id,
        username: row.username,
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

  return [...instanceShifts, ...fixedShifts].sort(
    (a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)
  );
}

function shiftDurationHours(shift) {
  const [startH, startM] = shift.startTime.split(':').map(Number);
  const [endH, endM] = shift.endTime.split(':').map(Number);
  return (endH * 60 + endM - (startH * 60 + startM)) / 60;
}

// Normalizza una riga grezza di `shifts` (come restituita da INSERT/UPDATE ... RETURNING *)
// per l'invio al client: senza questo passaggio il campo `date` verrebbe serializzato da
// JSON.stringify come Date UTC, con lo stesso rischio di slittamento di un giorno visto altrove.
function toSafeShift(row) {
  return {
    id: row.id,
    userId: row.user_id,
    startTime: toHHMM(row.start_time),
    endTime: toHHMM(row.end_time),
    date: toDateOnly(row.date),
    type: row.type,
    note: row.note,
    createdBy: row.created_by,
    recurrenceRule: row.recurrence_rule,
  };
}

module.exports = { getExpandedShifts, toHHMM, toDateOnly, isValidDateString, shiftDurationHours, toSafeShift };
