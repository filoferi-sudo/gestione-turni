const pool = require('../config/db');
const { getExpandedShifts, shiftDurationHours, isValidDateString } = require('./shiftExpansion');
const { fetchUserAreasBatch } = require('./userAreas');

// -----------------------------------------------------------------------------
// Report operativo del personale (sezione "Report", solo lettura).
//
// Livello puramente ADDITIVO sopra i dati già esistenti: non introduce tabelle o
// colonne nuove, non modifica alcun flusso. Aggrega — riusando le stesse logiche
// del resto del sistema — ore lavorate (getExpandedShifts/shiftDurationHours),
// rispetto del contratto (user_contracts), turni, richieste di cancellazione
// (cancellation_requests) e proposte di sostituzione (substitution_proposals).
//
// Nessuna valutazione automatica del dipendente: produce solo numeri oggettivi e
// alert informativi. La decisione resta sempre al titolare/responsabile.
// -----------------------------------------------------------------------------

// Soglie degli alert informativi (nessun giudizio: solo segnalazioni di supporto).
const ALERT_THRESHOLDS = {
  overHours: 8, // ore pianificate oltre il monte previsto
  underHours: 8, // ore pianificate sotto il monte previsto
  cancellations: 5, // numero richieste di cancellazione nel periodo
};

// Tolleranza (in ore) entro cui le ore pianificate sono considerate "in linea" col contratto.
const STATUS_TOLERANCE_HOURS = 5;

function pad(n) {
  return String(n).padStart(2, '0');
}
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function addDays(dateStr, days) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return fmt(d);
}
// Numero di giorni inclusi nell'intervallo [start, end] (estremi compresi).
function daysInclusive(start, end) {
  const ms = parseDate(end).getTime() - parseDate(start).getTime();
  return Math.round(ms / 86400000) + 1;
}

// Periodo immediatamente precedente della stessa durata, per il confronto tra periodi.
// Es. [2026-06-01, 2026-06-30] -> [2026-05-02, 2026-05-31] (30 giorni ciascuno).
function previousPeriod(start, end) {
  const length = daysInclusive(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(length - 1));
  return { start: prevStart, end: prevEnd };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Monte ore "previsto" per il periodo, ricavato dal contratto e proporzionato alla
// durata del periodo. Si preferisce il massimale settimanale (più granulare); in sua
// assenza si usa il mensile. null = nessun massimale configurato (contratto assente o
// senza ore): in tal caso non si calcola alcuna differenza né alert sulle ore.
function expectedHoursForPeriod(contract, start, end) {
  if (!contract) return null;
  const days = daysInclusive(start, end);
  if (contract.maxWeeklyHours != null) return (contract.maxWeeklyHours * days) / 7;
  if (contract.maxMonthlyHours != null) return (contract.maxMonthlyHours * days) / 30;
  return null;
}

function numOrNull(value) {
  return value == null ? null : Number(value);
}

// Elenco dei dipendenti (ruolo 'user') della società, con il proprio contratto, filtrabile
// per area operativa, sede o singolo dipendente. Include le aree assegnate (per etichettare
// "ruolo/reparto" nella UI, che nel modello dati corrisponde alle aree operative).
async function fetchRoster({ companyId, areaId, sedeId, userId }) {
  const params = [companyId];
  const filters = [];
  if (userId) {
    params.push(userId);
    filters.push(`AND u.id = $${params.length}`);
  }
  if (areaId) {
    params.push(areaId);
    filters.push(
      `AND EXISTS (SELECT 1 FROM user_areas ua WHERE ua.user_id = u.id AND ua.area_id = $${params.length})`
    );
  }
  if (sedeId) {
    params.push(sedeId);
    filters.push(
      `AND EXISTS (SELECT 1 FROM user_areas ua JOIN operational_areas oa ON oa.id = ua.area_id
                    WHERE ua.user_id = u.id AND oa.sede_id = $${params.length})`
    );
  }

  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email,
            uc.contract_type, uc.max_weekly_hours, uc.max_monthly_hours,
            uc.min_weekly_hours, uc.max_daily_hours, uc.note
       FROM users u
       LEFT JOIN user_contracts uc ON uc.user_id = u.id
      WHERE u.role = 'user' AND u.company_id = $1
        ${filters.join('\n        ')}
      ORDER BY u.username`,
    params
  );

  const areasByUser = await fetchUserAreasBatch(rows.map((r) => r.id));

  return rows.map((r) => ({
    userId: r.id,
    username: r.username,
    email: r.email,
    areas: areasByUser[r.id] || [],
    contract: {
      contractType: r.contract_type || null,
      maxWeeklyHours: numOrNull(r.max_weekly_hours),
      maxMonthlyHours: numOrNull(r.max_monthly_hours),
      minWeeklyHours: numOrNull(r.min_weekly_hours),
      maxDailyHours: numOrNull(r.max_daily_hours),
      note: r.note || null,
    },
  }));
}

// Metriche operative di ciascun dipendente per un intervallo [start, end].
// Un'unica getExpandedShifts sull'intera società (come statsController) + due query di
// aggregazione (richieste di cancellazione, proposte) raggruppate per utente: nessun N+1.
// includeShifts=true restituisce anche l'elenco puntuale dei turni (per la scheda dettaglio).
async function computePeriodMetrics({ companyId, start, end, userIds, includeShifts = false }) {
  const todayStr = fmt(new Date());

  const allShifts = await getExpandedShifts({ start, end, companyId });
  const assigned = allShifts.filter((s) => s.userId);

  const shiftsByUser = new Map();
  for (const s of assigned) {
    if (!shiftsByUser.has(s.userId)) shiftsByUser.set(s.userId, []);
    shiftsByUser.get(s.userId).push(s);
  }

  // I chiamanti passano sempre l'elenco degli utenti (anche vuoto = nessun dipendente dopo i filtri):
  // in tal caso NON si ricade su "tutti gli utenti con turni", si restituisce una mappa vuota. Il
  // fallback vale solo se userIds è omesso del tutto (uso difensivo, non usato dai chiamanti attuali).
  const ids = Array.isArray(userIds) ? userIds : [...shiftsByUser.keys()];

  // Richieste di cancellazione effettuate dal dipendente nel periodo (per stato).
  const cancellationsByUser = new Map();
  if (ids.length) {
    const { rows } = await pool.query(
      `SELECT requested_by AS user_id, status, COUNT(*)::int AS count
         FROM cancellation_requests
        WHERE company_id = $1 AND requested_by = ANY($2::int[])
          AND created_at::date BETWEEN $3 AND $4
        GROUP BY requested_by, status`,
      [companyId, ids, start, end]
    );
    for (const r of rows) {
      const entry =
        cancellationsByUser.get(r.user_id) ||
        cancellationsByUser.set(r.user_id, { total: 0, approved: 0, rejected: 0, pending: 0 }).get(r.user_id);
      entry.total += r.count;
      if (r.status === 'approved') entry.approved += r.count;
      else if (r.status === 'rejected') entry.rejected += r.count;
      else if (r.status === 'pending') entry.pending += r.count;
    }
  }

  // Proposte di sostituzione ricevute dal dipendente nel periodo (per stato). substitution_proposals
  // non ha company_id: si scopa la società tramite JOIN su shifts (vedi PROJECT_CONTEXT.md).
  const proposalsByUser = new Map();
  if (ids.length) {
    const { rows } = await pool.query(
      `SELECT sp.user_id, sp.status, COUNT(*)::int AS count
         FROM substitution_proposals sp
         JOIN shifts s ON s.id = sp.shift_id
        WHERE s.company_id = $1 AND sp.user_id = ANY($2::int[])
          AND sp.created_at::date BETWEEN $3 AND $4
        GROUP BY sp.user_id, sp.status`,
      [companyId, ids, start, end]
    );
    for (const r of rows) {
      const entry =
        proposalsByUser.get(r.user_id) ||
        proposalsByUser
          .set(r.user_id, { total: 0, accepted: 0, declined: 0, pending: 0, expired: 0 })
          .get(r.user_id);
      entry.total += r.count;
      if (entry[r.status] != null) entry[r.status] += r.count;
    }
  }

  const metrics = new Map();
  for (const userId of ids) {
    const userShifts = shiftsByUser.get(userId) || [];
    const performed = userShifts.filter((s) => s.date <= todayStr);

    const plannedHours = userShifts.reduce((sum, s) => sum + shiftDurationHours(s), 0);
    const workedHours = performed.reduce((sum, s) => sum + shiftDurationHours(s), 0);
    // Sostituzioni "prese" dal dipendente: turni type='volante' assegnati a lui (claim o proposta
    // accettata, che diventa un volante con user_id valorizzato).
    const substitutionsTaken = userShifts.filter((s) => s.type === 'volante').length;

    metrics.set(userId, {
      plannedHours: round1(plannedHours),
      workedHours: round1(workedHours),
      shiftsTotal: userShifts.length,
      shiftsPerformed: performed.length,
      substitutionsTaken,
      cancellations: cancellationsByUser.get(userId) || { total: 0, approved: 0, rejected: 0, pending: 0 },
      proposals:
        proposalsByUser.get(userId) || { total: 0, accepted: 0, declined: 0, pending: 0, expired: 0 },
      ...(includeShifts
        ? {
            shifts: [...userShifts].sort(
              (a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime)
            ),
          }
        : {}),
    });
  }

  return metrics;
}

// Stato operativo: descrizione OGGETTIVA delle ore pianificate rispetto al contratto, non un
// giudizio sul dipendente. Valori: no_contract | over | under | on_track.
function computeStatus(expectedHours, plannedHours) {
  if (expectedHours == null) return 'no_contract';
  const diff = plannedHours - expectedHours;
  if (diff > STATUS_TOLERANCE_HOURS) return 'over';
  if (diff < -STATUS_TOLERANCE_HOURS) return 'under';
  return 'on_track';
}

// Alert informativi basati sui dati. Solo di supporto: non giudicano il dipendente, non suggeriscono
// decisioni HR. Ogni alert è { level: 'info', message }.
function buildAlerts({ expectedHours, plannedHours, cancellations }) {
  const alerts = [];
  if (expectedHours != null) {
    const diff = plannedHours - expectedHours;
    if (diff > ALERT_THRESHOLDS.overHours) {
      alerts.push({
        level: 'info',
        message: `Le ore pianificate superano il monte ore previsto di ${round1(diff)} ore nel periodo selezionato.`,
      });
    } else if (-diff > ALERT_THRESHOLDS.underHours) {
      alerts.push({
        level: 'info',
        message: `Le ore pianificate sono inferiori di ${round1(-diff)} ore rispetto al monte ore previsto dal contratto.`,
      });
    }
  }
  if (cancellations.total >= ALERT_THRESHOLDS.cancellations) {
    alerts.push({
      level: 'info',
      message: `Sono presenti ${cancellations.total} richieste di cancellazione turno nel periodo.`,
    });
  }
  return alerts;
}

function assembleEmployee(entry, metrics, start, end) {
  const expectedHours = expectedHoursForPeriod(entry.contract, start, end);
  const difference = expectedHours == null ? null : round1(metrics.plannedHours - expectedHours);
  return {
    userId: entry.userId,
    username: entry.username,
    areas: entry.areas,
    contract: entry.contract,
    expectedHours: expectedHours == null ? null : round1(expectedHours),
    plannedHours: metrics.plannedHours,
    workedHours: metrics.workedHours,
    difference,
    shiftsTotal: metrics.shiftsTotal,
    shiftsPerformed: metrics.shiftsPerformed,
    substitutionsTaken: metrics.substitutionsTaken,
    cancellations: metrics.cancellations,
    proposals: metrics.proposals,
    status: computeStatus(expectedHours, metrics.plannedHours),
    alerts: buildAlerts({
      expectedHours,
      plannedHours: metrics.plannedHours,
      cancellations: metrics.cancellations,
    }),
  };
}

// Vista generale: una scheda riepilogativa per dipendente per il periodo [start, end].
async function buildOverview({ companyId, start, end, areaId, sedeId, userId }) {
  const roster = await fetchRoster({ companyId, areaId, sedeId, userId });
  const userIds = roster.map((r) => r.userId);
  const metrics = await computePeriodMetrics({ companyId, start, end, userIds });

  const employees = roster.map((entry) =>
    assembleEmployee(entry, metrics.get(entry.userId), start, end)
  );

  return { period: { start, end }, employees };
}

// Scheda dettaglio di un dipendente: informazioni generali, analisi ore, storico turni,
// analisi richieste, statistiche operative, alert e confronto col periodo precedente.
async function buildDetail({ companyId, userId, start, end }) {
  const roster = await fetchRoster({ companyId, userId });
  const entry = roster[0];
  if (!entry) return null;

  const currentMetrics = await computePeriodMetrics({
    companyId,
    start,
    end,
    userIds: [userId],
    includeShifts: true,
  });
  const current = assembleEmployee(entry, currentMetrics.get(userId), start, end);
  const currentFull = currentMetrics.get(userId);

  const prev = previousPeriod(start, end);
  const prevMetrics = await computePeriodMetrics({
    companyId,
    start: prev.start,
    end: prev.end,
    userIds: [userId],
  });
  const previous = assembleEmployee(entry, prevMetrics.get(userId), prev.start, prev.end);

  return {
    employee: {
      userId: entry.userId,
      username: entry.username,
      email: entry.email,
      areas: entry.areas,
      contract: entry.contract,
    },
    period: { start, end },
    current,
    previous: { period: { start: prev.start, end: prev.end }, ...previous },
    shifts: currentFull.shifts || [],
  };
}

module.exports = {
  buildOverview,
  buildDetail,
  isValidDateString,
  // esportati per eventuali test/riuso
  expectedHoursForPeriod,
  previousPeriod,
};
