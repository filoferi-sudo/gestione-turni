const pool = require('../config/db');
const { isValidTimeString } = require('../utils/timeWindow');
const { isValidDateString, toDateOnly, getExpandedShifts, toSafeShift } = require('../services/shiftExpansion');
const { weekdayOf, addDays } = require('../utils/staffingOccurrences');
const { computeCoverage, findConflictingRequirement } = require('../services/staffingCoverage');
const { notifySubstitutionAvailable } = require('../services/notificationService');

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function toSafeRequirement(row) {
  if (!row) return null;
  return {
    id: row.id,
    areaId: row.area_id,
    reqType: row.req_type,
    weekday: row.weekday,
    date: row.date ? toDateOnly(row.date) : null,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    requiredCount: row.required_count,
    effectiveFrom: row.effective_from ? toDateOnly(row.effective_from) : null,
    effectiveUntil: row.effective_until ? toDateOnly(row.effective_until) : null,
    note: row.note,
  };
}

// Stessa forma/verifica di assertAreaExists in shiftController.js (tenuta separata per lo stesso
// motivo: controller paralleli, non un modulo condiviso, vedi PROJECT_CONTEXT.md).
async function assertAreaExists(areaId, companyId) {
  if (!areaId) return null;
  const { rows } = await pool.query(
    `SELECT oa.*, s.calendar_start_time, s.calendar_end_time
       FROM operational_areas oa
       JOIN sedi s ON s.id = oa.sede_id
      WHERE oa.id = $1 AND oa.company_id = $2 AND oa.calendar_mode = 'shifts'`,
    [areaId, companyId]
  );
  return rows[0] || null;
}

async function fetchRequirementOr404(id, companyId, res) {
  const { rows } = await pool.query('SELECT * FROM staffing_requirements WHERE id = $1', [id]);
  const requirement = rows[0];
  if (!requirement || requirement.company_id !== companyId) {
    res.status(404).json({ error: 'Fabbisogno non trovato' });
    return null;
  }
  return requirement;
}

// GET /api/staffing/requirements?areaId=
async function listRequirements(req, res) {
  const areaId = Number(req.query.areaId);
  const area = await assertAreaExists(areaId, req.user.companyId);
  if (!area) return res.status(404).json({ error: 'Area operativa non trovata' });

  const { rows } = await pool.query(
    `SELECT * FROM staffing_requirements WHERE area_id = $1
      ORDER BY req_type, weekday NULLS LAST, date NULLS LAST, effective_from`,
    [areaId]
  );
  return res.json({ requirements: rows.map(toSafeRequirement) });
}

// PUT /api/staffing/requirements/weekly - crea o modifica UNA fascia fissa settimanale
// indipendente dell'area (identificata dal proprio orario): un'area può avere più fasce fisse
// parallele (es. mattina 08-14 e sera 18-22), ognuna gestita da questo stesso endpoint senza
// toccare le altre. `originalStartTime`/`originalEndTime` (opzionali) identificano la fascia
// esistente da modificare — se assenti si crea sempre una fascia nuova, senza chiudere/sostituire
// nulla di già esistente. Se presenti, si chiudono (o eliminano, se mai state attive) solo le
// regole aperte con quell'orario esatto, poi si ricreano per i giorni con conteggio > 0 (stesso
// pattern "chiudi e ricrea" già usato per le occorrenze singole, qui applicato all'intera fascia).
async function upsertWeeklySchedule(req, res) {
  const { areaId, startTime, endTime, counts, note, confirmDuplicate, originalStartTime, originalEndTime } = req.body;
  const area = await assertAreaExists(Number(areaId), req.user.companyId);
  if (!area) return res.status(400).json({ error: "areaId non valido per questa società (o non è un'area di tipo Turni)" });

  if (!isValidTimeString(startTime) || !isValidTimeString(endTime) || startTime >= endTime) {
    return res.status(400).json({ error: "L'orario di fine deve essere successivo a quello di inizio" });
  }
  if (!counts || typeof counts !== 'object') {
    return res.status(400).json({ error: 'counts è obbligatorio (es. { MON: 4, TUE: 6, ... })' });
  }

  const effectiveFrom = isValidDateString(req.body.effectiveFrom) ? req.body.effectiveFrom : todayDateString();

  const isEditingExistingSlot = isValidTimeString(originalStartTime) && isValidTimeString(originalEndTime);
  const { rows: openRows } = isEditingExistingSlot
    ? await pool.query(
        `SELECT * FROM staffing_requirements
          WHERE area_id = $1 AND req_type = 'fixed' AND effective_until IS NULL
            AND start_time = $2 AND end_time = $3`,
        [area.id, originalStartTime, originalEndTime]
      )
    : { rows: [] };
  const openByWeekday = new Map(openRows.map((r) => [r.weekday, r]));

  const activeWeekdays = WEEKDAYS.filter((wd) => Number(counts[wd] || 0) > 0);

  if (!confirmDuplicate) {
    for (const wd of activeWeekdays) {
      const existing = openByWeekday.get(wd);
      const conflict = await findConflictingRequirement(area.id, {
        reqType: 'fixed',
        weekday: wd,
        startTime,
        endTime,
        effectiveFrom,
        effectiveUntil: null,
        excludeRequirementId: existing ? existing.id : undefined,
      });
      if (conflict) {
        return res.status(409).json({
          error: `Esiste già un fabbisogno fisso identico per ${wd} ${startTime}-${endTime} in quest'area`,
          conflict: true,
          conflictingRequirement: toSafeRequirement(conflict),
        });
      }
    }
  }

  const dayBefore = addDays(effectiveFrom, -1);
  for (const row of openRows) {
    if (dayBefore < toDateOnly(row.effective_from)) {
      // la nuova decorrenza è precedente/uguale a quando la vecchia regola è iniziata: non è mai
      // stata attiva in questo nuovo scenario, si elimina invece di chiuderla con un range invertito
      await pool.query('DELETE FROM staffing_requirement_exceptions WHERE requirement_id = $1', [row.id]);
      await pool.query('DELETE FROM staffing_requirements WHERE id = $1', [row.id]);
    } else {
      await pool.query('UPDATE staffing_requirements SET effective_until = $1 WHERE id = $2', [dayBefore, row.id]);
    }
  }

  const created = [];
  for (const wd of activeWeekdays) {
    const { rows } = await pool.query(
      `INSERT INTO staffing_requirements
         (company_id, area_id, req_type, weekday, start_time, end_time, required_count, effective_from, note, created_by)
       VALUES ($1, $2, 'fixed', $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [req.user.companyId, area.id, wd, startTime, endTime, Number(counts[wd]), effectiveFrom, note || null, req.user.id]
    );
    created.push(rows[0]);
  }

  return res.status(200).json({ requirements: created.map(toSafeRequirement) });
}

// POST /api/staffing/requirements/single
async function createSingleRequirement(req, res) {
  const { areaId, date, startTime, endTime, requiredCount, note, confirmDuplicate } = req.body;
  const area = await assertAreaExists(Number(areaId), req.user.companyId);
  if (!area) return res.status(400).json({ error: "areaId non valido per questa società (o non è un'area di tipo Turni)" });

  if (!isValidDateString(date)) {
    return res.status(400).json({ error: 'La data è obbligatoria (YYYY-MM-DD)' });
  }
  if (!isValidTimeString(startTime) || !isValidTimeString(endTime) || startTime >= endTime) {
    return res.status(400).json({ error: "L'orario di fine deve essere successivo a quello di inizio" });
  }
  const count = Number(requiredCount);
  if (!Number.isInteger(count) || count < 0) {
    return res.status(400).json({ error: 'requiredCount deve essere un intero >= 0' });
  }

  if (!confirmDuplicate) {
    const conflict = await findConflictingRequirement(area.id, { reqType: 'single', date, startTime, endTime });
    if (conflict) {
      return res.status(409).json({
        error: `Esiste già un fabbisogno identico per ${date} ${startTime}-${endTime} in quest'area`,
        conflict: true,
        conflictingRequirement: toSafeRequirement(conflict),
      });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO staffing_requirements
       (company_id, area_id, req_type, date, start_time, end_time, required_count, effective_from, note, created_by)
     VALUES ($1, $2, 'single', $3, $4, $5, $6, $3, $7, $8)
     RETURNING *`,
    [req.user.companyId, area.id, date, startTime, endTime, count, note || null, req.user.id]
  );

  return res.status(201).json({ requirement: toSafeRequirement(rows[0]) });
}

// PUT /api/staffing/requirements/single/:id
async function updateSingleRequirement(req, res) {
  const { id } = req.params;
  const existing = await fetchRequirementOr404(id, req.user.companyId, res);
  if (!existing) return;
  if (existing.req_type !== 'single') {
    return res.status(400).json({ error: 'Questo endpoint gestisce solo fabbisogni singoli' });
  }

  const { date, startTime, endTime, requiredCount, note, confirmDuplicate } = req.body;
  const finalDate = date !== undefined ? date : toDateOnly(existing.date);
  const finalStart = startTime || existing.start_time.slice(0, 5);
  const finalEnd = endTime || existing.end_time.slice(0, 5);

  if (!isValidDateString(finalDate)) {
    return res.status(400).json({ error: 'La data è obbligatoria (YYYY-MM-DD)' });
  }
  if (!isValidTimeString(finalStart) || !isValidTimeString(finalEnd) || finalStart >= finalEnd) {
    return res.status(400).json({ error: "L'orario di fine deve essere successivo a quello di inizio" });
  }
  const finalCount = requiredCount !== undefined ? Number(requiredCount) : existing.required_count;
  if (!Number.isInteger(finalCount) || finalCount < 0) {
    return res.status(400).json({ error: 'requiredCount deve essere un intero >= 0' });
  }

  if (!confirmDuplicate) {
    const conflict = await findConflictingRequirement(existing.area_id, {
      reqType: 'single',
      date: finalDate,
      startTime: finalStart,
      endTime: finalEnd,
      excludeRequirementId: existing.id,
    });
    if (conflict) {
      return res.status(409).json({
        error: `Esiste già un fabbisogno identico per ${finalDate} ${finalStart}-${finalEnd} in quest'area`,
        conflict: true,
        conflictingRequirement: toSafeRequirement(conflict),
      });
    }
  }

  const { rows } = await pool.query(
    `UPDATE staffing_requirements
        SET date = $1, start_time = $2, end_time = $3, required_count = $4, note = $5, effective_from = $1
      WHERE id = $6
      RETURNING *`,
    [finalDate, finalStart, finalEnd, finalCount, note !== undefined ? note : existing.note, id]
  );

  return res.json({ requirement: toSafeRequirement(rows[0]) });
}

// DELETE /api/staffing/requirements/single/:id
async function deleteSingleRequirement(req, res) {
  const { id } = req.params;
  const existing = await fetchRequirementOr404(id, req.user.companyId, res);
  if (!existing) return;
  if (existing.req_type !== 'single') {
    return res.status(400).json({ error: 'Questo endpoint gestisce solo fabbisogni singoli' });
  }

  await pool.query('DELETE FROM staffing_requirements WHERE id = $1', [id]);
  return res.status(204).send();
}

const OCCURRENCE_ACTIONS = ['edit_only', 'delete_only', 'edit_future', 'delete_future'];

// Vero se `date` è un'occorrenza valida (non ancora esclusa) della regola fissa indicata.
function isValidFixedOccurrenceDate(requirement, date) {
  if (weekdayOf(date) !== requirement.weekday) return false;
  const effectiveFrom = toDateOnly(requirement.effective_from);
  const effectiveUntil = requirement.effective_until ? toDateOnly(requirement.effective_until) : null;
  if (date < effectiveFrom) return false;
  if (effectiveUntil && date > effectiveUntil) return false;
  return true;
}

// PUT /api/staffing/requirements/:id/occurrence - le 4 modalità di modifica di una singola
// occorrenza di una regola fissa, senza toccare la regola generale se non richiesto:
// edit_only/delete_only scrivono un'eccezione puntuale; edit_future/delete_future "spezzano" la
// regola (chiude quella corrente, eventualmente ne crea una nuova da quella data in poi).
async function editOccurrence(req, res) {
  const { id } = req.params;
  const { date, action, requiredCount } = req.body;

  const requirement = await fetchRequirementOr404(id, req.user.companyId, res);
  if (!requirement) return;
  if (requirement.req_type !== 'fixed') {
    return res.status(400).json({ error: 'La modifica per occorrenza si applica solo ai fabbisogni fissi' });
  }
  if (!isValidDateString(date)) {
    return res.status(400).json({ error: 'La data è obbligatoria (YYYY-MM-DD)' });
  }
  if (!OCCURRENCE_ACTIONS.includes(action)) {
    return res.status(400).json({ error: `action deve essere uno tra ${OCCURRENCE_ACTIONS.join(', ')}` });
  }
  if (!isValidFixedOccurrenceDate(requirement, date)) {
    return res.status(400).json({ error: 'La data indicata non è un\'occorrenza valida di questa regola' });
  }

  if (action === 'edit_only' || action === 'edit_future') {
    const count = Number(requiredCount);
    if (!Number.isInteger(count) || count < 0) {
      return res.status(400).json({ error: 'requiredCount deve essere un intero >= 0' });
    }
  }

  if (action === 'edit_only') {
    await pool.query(
      `INSERT INTO staffing_requirement_exceptions (requirement_id, exception_date, is_deleted, override_count)
       VALUES ($1, $2, FALSE, $3)
       ON CONFLICT (requirement_id, exception_date) DO UPDATE SET is_deleted = FALSE, override_count = $3`,
      [id, date, Number(requiredCount)]
    );
    return res.json({ action, requirement: toSafeRequirement(requirement) });
  }

  if (action === 'delete_only') {
    await pool.query(
      `INSERT INTO staffing_requirement_exceptions (requirement_id, exception_date, is_deleted, override_count)
       VALUES ($1, $2, TRUE, NULL)
       ON CONFLICT (requirement_id, exception_date) DO UPDATE SET is_deleted = TRUE, override_count = NULL`,
      [id, date]
    );
    return res.json({ action, requirement: toSafeRequirement(requirement) });
  }

  // edit_future / delete_future: chiude la regola corrente il giorno prima di `date`
  const dayBefore = addDays(date, -1);
  const effectiveFrom = toDateOnly(requirement.effective_from);

  if (dayBefore < effectiveFrom) {
    // `date` coincide con (o precede) l'inizio della regola: non c'è nulla da "chiudere prima",
    // la modifica riguarda l'intera regola fin dall'inizio.
    if (action === 'delete_future') {
      await pool.query('DELETE FROM staffing_requirement_exceptions WHERE requirement_id = $1', [id]);
      await pool.query('DELETE FROM staffing_requirements WHERE id = $1', [id]);
      return res.json({ action, requirement: null });
    }
    const { rows } = await pool.query(
      'UPDATE staffing_requirements SET required_count = $1 WHERE id = $2 RETURNING *',
      [Number(requiredCount), id]
    );
    return res.json({ action, requirement: toSafeRequirement(rows[0]) });
  }

  await pool.query('UPDATE staffing_requirements SET effective_until = $1 WHERE id = $2', [dayBefore, id]);

  if (action === 'delete_future') {
    return res.json({ action, requirement: null });
  }

  const { rows } = await pool.query(
    `INSERT INTO staffing_requirements
       (company_id, area_id, req_type, weekday, start_time, end_time, required_count, effective_from, note, created_by)
     VALUES ($1, $2, 'fixed', $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      req.user.companyId,
      requirement.area_id,
      requirement.weekday,
      requirement.start_time,
      requirement.end_time,
      Number(requiredCount),
      date,
      requirement.note,
      req.user.id,
    ]
  );

  return res.json({ action, requirement: toSafeRequirement(rows[0]) });
}

// GET /api/staffing/coverage?areaId=&start=&end=
async function getCoverage(req, res) {
  const areaId = Number(req.query.areaId);
  const { start, end } = req.query;

  const area = await assertAreaExists(areaId, req.user.companyId);
  if (!area) return res.status(404).json({ error: 'Area operativa non trovata' });
  if (!isValidDateString(start) || !isValidDateString(end) || start > end) {
    return res.status(400).json({ error: 'Parametri start/end non validi (formato YYYY-MM-DD)' });
  }

  const coverage = await computeCoverage({ areaId, companyId: req.user.companyId, start, end });
  return res.json({ coverage });
}

// POST /api/staffing/requirements/:id/generate-gap - crea le Sostituzioni mancanti per
// l'occorrenza indicata (idempotente: rigenera solo la differenza residua, vedi computeCoverage).
async function generateGapShifts(req, res) {
  const { id } = req.params;
  const { date } = req.body;

  const requirement = await fetchRequirementOr404(id, req.user.companyId, res);
  if (!requirement) return;
  if (!isValidDateString(date)) {
    return res.status(400).json({ error: 'La data è obbligatoria (YYYY-MM-DD)' });
  }

  let requiredCount;
  if (requirement.req_type === 'single') {
    if (toDateOnly(requirement.date) !== date) {
      return res.status(400).json({ error: 'La data indicata non corrisponde a questo fabbisogno' });
    }
    requiredCount = requirement.required_count;
  } else {
    if (!isValidFixedOccurrenceDate(requirement, date)) {
      return res.status(400).json({ error: 'La data indicata non è un\'occorrenza valida di questa regola' });
    }
    const { rows: exceptionRows } = await pool.query(
      'SELECT * FROM staffing_requirement_exceptions WHERE requirement_id = $1 AND exception_date = $2',
      [id, date]
    );
    const exception = exceptionRows[0];
    if (exception && exception.is_deleted) {
      return res.status(400).json({ error: 'Questa occorrenza è stata eliminata' });
    }
    requiredCount = exception ? exception.override_count : requirement.required_count;
  }

  const startTime = requirement.start_time.slice(0, 5);
  const endTime = requirement.end_time.slice(0, 5);

  const dayShifts = await getExpandedShifts({ start: date, end: date, companyId: req.user.companyId, areaId: requirement.area_id });
  const assignedCount = dayShifts.filter((s) => s.userId && s.startTime < endTime && startTime < s.endTime).length;

  const { rows: openRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM shifts
      WHERE requirement_id = $1 AND date = $2 AND type = 'volante' AND user_id IS NULL AND status = 'active'`,
    [id, date]
  );
  const openSlots = openRows[0].count;

  const missing = Math.max(0, requiredCount - assignedCount - openSlots);
  if (missing === 0) {
    return res.json({ created: 0, shifts: [] });
  }

  const { rows: areaRows } = await pool.query('SELECT sede_id FROM operational_areas WHERE id = $1', [requirement.area_id]);
  const sedeId = areaRows[0].sede_id;

  const created = [];
  for (let i = 0; i < missing; i += 1) {
    const { rows } = await pool.query(
      `INSERT INTO shifts
         (user_id, company_id, start_time, end_time, date, type, note, created_by, status, area_id, sede_id, requirement_id)
       VALUES (NULL, $1, $2, $3, $4, 'volante', $5, $6, 'active', $7, $8, $9)
       RETURNING *`,
      [req.user.companyId, requirement.start_time, requirement.end_time, date, requirement.note, req.user.id, requirement.area_id, sedeId, id]
    );
    created.push(rows[0]);
  }

  // Le nuove Sostituzioni generate dal fabbisogno sono disponibili: avvisa dipendenti dell'area +
  // responsabili con un'unica notifica riassuntiva (best-effort, non blocca la risposta).
  await notifySubstitutionAvailable({
    companyId: req.user.companyId,
    areaId: requirement.area_id,
    sedeId,
    shiftId: created[0].id,
    date,
    startTime,
    endTime,
    count: created.length,
    actorUserId: req.user.id,
  });

  return res.status(201).json({ created: created.length, shifts: created.map(toSafeShift) });
}

module.exports = {
  listRequirements,
  upsertWeeklySchedule,
  createSingleRequirement,
  updateSingleRequirement,
  deleteSingleRequirement,
  editOccurrence,
  getCoverage,
  generateGapShifts,
};
