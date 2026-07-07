const pool = require('../config/db');
const { getExpandedShifts, toDateOnly } = require('./shiftExpansion');
const { expandRequirementOccurrences, weekdayOf } = require('../utils/staffingOccurrences');

function toHHMM(pgTime) {
  return pgTime ? pgTime.slice(0, 5) : pgTime;
}

// Normalizza una riga grezza di staffing_requirements (INSERT/SELECT ... RETURNING/*) nella forma
// usata da expandRequirementOccurrences.
function normalizeRequirement(row) {
  return {
    id: row.id,
    reqType: row.req_type,
    weekday: row.weekday,
    date: row.date ? toDateOnly(row.date) : null,
    startTime: toHHMM(row.start_time),
    endTime: toHHMM(row.end_time),
    requiredCount: row.required_count,
    effectiveFrom: row.effective_from ? toDateOnly(row.effective_from) : null,
    effectiveUntil: row.effective_until ? toDateOnly(row.effective_until) : null,
    note: row.note,
  };
}

// Regole rilevanti per l'intervallo [start,end]: 'fixed' la cui finestra di validità interseca il
// range, 'single' con data nel range.
async function fetchRelevantRequirements(areaId, start, end) {
  const { rows } = await pool.query(
    `SELECT * FROM staffing_requirements
      WHERE area_id = $1
        AND (
          (req_type = 'fixed' AND effective_from <= $3 AND (effective_until IS NULL OR effective_until >= $2))
          OR
          (req_type = 'single' AND date >= $2 AND date <= $3)
        )`,
    [areaId, start, end]
  );
  return rows.map(normalizeRequirement);
}

async function fetchExceptionsByRequirementId(requirementIds, start, end) {
  const map = new Map();
  if (requirementIds.length === 0) return map;

  const { rows } = await pool.query(
    `SELECT * FROM staffing_requirement_exceptions
      WHERE requirement_id = ANY($1::int[]) AND exception_date >= $2 AND exception_date <= $3`,
    [requirementIds, start, end]
  );
  for (const row of rows) {
    const dateStr = toDateOnly(row.exception_date);
    if (!map.has(row.requirement_id)) map.set(row.requirement_id, new Map());
    map.get(row.requirement_id).set(dateStr, { isDeleted: row.is_deleted, overrideCount: row.override_count });
  }
  return map;
}

// Sostituzioni già pubblicate (non reclamate) generate per coprire un buco di fabbisogno, per
// evitare di rigenerarle: raggruppate per (requirementId, date).
async function fetchOpenSlotsByRequirementAndDate(requirementIds, start, end) {
  const map = new Map(); // key `${requirementId}|${date}` -> count
  if (requirementIds.length === 0) return map;

  const { rows } = await pool.query(
    `SELECT requirement_id, date, COUNT(*)::int AS count
       FROM shifts
      WHERE requirement_id = ANY($1::int[]) AND type = 'volante' AND user_id IS NULL
        AND status = 'active' AND date >= $2 AND date <= $3
      GROUP BY requirement_id, date`,
    [requirementIds, start, end]
  );
  for (const row of rows) {
    map.set(`${row.requirement_id}|${toDateOnly(row.date)}`, row.count);
  }
  return map;
}

// Calcola, per ogni occorrenza di fabbisogno di un'area nell'intervallo [start,end], quanti turni
// assegnati la coprono (sovrapposizione oraria, stesso criterio di hasOverlappingShift), quanti
// posti sono già stati aperti come Sostituzione non reclamata, e quanti mancano ancora.
// Nota: un turno che si sovrappone a più occorrenze diverse conta per ciascuna (nessuna
// esclusività in questa versione, scelta esplicita — vedi PROJECT_CONTEXT.md).
async function computeCoverage({ areaId, companyId, start, end }) {
  const requirements = await fetchRelevantRequirements(areaId, start, end);
  if (requirements.length === 0) return [];

  const exceptionsByRequirementId = await fetchExceptionsByRequirementId(
    requirements.filter((r) => r.reqType === 'fixed').map((r) => r.id),
    start,
    end
  );

  const occurrences = expandRequirementOccurrences(requirements, exceptionsByRequirementId, start, end);
  if (occurrences.length === 0) return [];

  const shifts = await getExpandedShifts({ start, end, companyId, areaId });
  const assignedShiftsByDate = new Map();
  for (const s of shifts) {
    if (!s.userId) continue;
    if (!assignedShiftsByDate.has(s.date)) assignedShiftsByDate.set(s.date, []);
    assignedShiftsByDate.get(s.date).push(s);
  }

  const requirementIds = [...new Set(occurrences.map((o) => o.requirementId))];
  const openSlotsMap = await fetchOpenSlotsByRequirementAndDate(requirementIds, start, end);

  return occurrences.map((occ) => {
    const dayShifts = assignedShiftsByDate.get(occ.date) || [];
    const assignedUsers = dayShifts
      .filter((s) => s.startTime < occ.endTime && occ.startTime < s.endTime)
      .map((s) => ({ userId: s.userId, username: s.username, shiftId: s.shiftId, type: s.type }));

    const openSlots = openSlotsMap.get(`${occ.requirementId}|${occ.date}`) || 0;
    const missingSlots = Math.max(0, occ.requiredCount - assignedUsers.length - openSlots);

    return { ...occ, assignedUsers, openSlots, missingSlots };
  });
}

// Cerca un'altra regola con fascia oraria ESATTAMENTE uguale sulla stessa area e stesso
// giorno/data (non blocca sovrapposizioni parziali, solo duplicati identici). candidate:
// { reqType, weekday?, date?, startTime, endTime, effectiveFrom?, effectiveUntil?,
//   excludeRequirementId? }.
async function findConflictingRequirement(areaId, candidate) {
  const { reqType, weekday, date, startTime, endTime, excludeRequirementId } = candidate;

  if (reqType === 'single') {
    // Altra regola 'single' identica sulla stessa data...
    const singleParams = [areaId, startTime, endTime, date];
    let singleExcludeClause = '';
    if (excludeRequirementId) {
      singleParams.push(excludeRequirementId);
      singleExcludeClause = ` AND id != $${singleParams.length}`;
    }
    const { rows: singleRows } = await pool.query(
      `SELECT * FROM staffing_requirements
        WHERE area_id = $1 AND start_time = $2 AND end_time = $3
          AND req_type = 'single' AND date = $4${singleExcludeClause}`,
      singleParams
    );
    if (singleRows[0]) return singleRows[0];

    // ...oppure una regola 'fixed' attiva quel giorno con lo stesso orario esatto.
    const { rows: fixedRows } = await pool.query(
      `SELECT * FROM staffing_requirements
        WHERE area_id = $1 AND start_time = $2 AND end_time = $3
          AND req_type = 'fixed' AND weekday = $4
          AND effective_from <= $5 AND (effective_until IS NULL OR effective_until >= $5)`,
      [areaId, startTime, endTime, weekdayOf(date), date]
    );
    return fixedRows[0] || null;
  }

  // candidate 'fixed': altra regola fissa sulla stessa area/giorno/orario con validità sovrapposta
  // (due intervalli [effective_from, effective_until] si sovrappongono se
  // a.from <= (b.until || infinito) AND b.from <= (a.until || infinito)).
  const { effectiveFrom, effectiveUntil } = candidate;
  const fixedParams = [areaId, startTime, endTime, weekday, effectiveFrom, effectiveUntil || null];
  let fixedExcludeClause = '';
  if (excludeRequirementId) {
    fixedParams.push(excludeRequirementId);
    fixedExcludeClause = ` AND id != $${fixedParams.length}`;
  }
  const { rows } = await pool.query(
    `SELECT * FROM staffing_requirements
      WHERE area_id = $1 AND start_time = $2 AND end_time = $3
        AND req_type = 'fixed' AND weekday = $4
        AND $5 <= COALESCE(effective_until, 'infinity'::date)
        AND effective_from <= COALESCE($6::date, 'infinity'::date)${fixedExcludeClause}`,
    fixedParams
  );
  return rows[0] || null;
}

module.exports = { computeCoverage, findConflictingRequirement, normalizeRequirement };
