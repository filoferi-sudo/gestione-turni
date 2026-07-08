const pool = require('../config/db');
const { getExpandedShifts, shiftDurationHours, toDateOnly } = require('./shiftExpansion');

// ============================================================================
// Motore di compatibilità delle sostituzioni (Fase 4)
// ============================================================================
// Data una Sostituzione scoperta (turno 'volante' non assegnato), produce una CLASSIFICA dei
// dipendenti interni compatibili dell'area, con punteggio 0–100 e motivazioni testuali tipizzate.
// Solo suggerimento: non modifica nulla (sola lettura), la decisione resta del responsabile.
//
// Filosofia dei punteggi (vedi PROJECT_CONTEXT.md, sezione "Sistema avanzato di sostituzioni"):
//   - UNICA esclusione rigida: la sovrapposizione con un altro turno già assegnato in quella data
//     (chi si sovrappone NON potrebbe comunque accettare — stesso vincolo di claimShift).
//   - Le violazioni contrattuali NON escludono: RETROCEDONO il candidato (motivazione rossa), così
//     il responsabile le vede e decide.
//   - Disponibilità non dichiarata = "ignota", non incompatibile (punteggio neutro).
// I pesi stanno in CONFIG: sono il punto di aggancio per futuri algoritmi più sofisticati (AI),
// senza riscrivere la struttura del motore.

const CONFIG = {
  weights: { availability: 35, contract: 35, load: 20, history: 10 },
  nearLimitRatio: 0.9, // proiezione ore >= 90% del massimale ⇒ "vicino al limite"
};

// getDay(): 0=domenica..6=sabato → codici MON..SUN usati da user_availability.
const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function pad(n) {
  return String(n).padStart(2, '0');
}
function fmtDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseDate(s) {
  return new Date(`${s}T00:00:00`);
}
function startOfWeek(d) {
  const day = d.getDay(); // 0 = domenica
  const diff = day === 0 ? -6 : 1 - day; // settimana lun→dom
  const x = new Date(d);
  x.setDate(d.getDate() + diff);
  return x;
}
function addDays(d, n) {
  const x = new Date(d);
  x.setDate(d.getDate() + n);
  return x;
}
// Ore in formato compatto: 20 invece di 20.0, 20.5 invariato.
function fmtHours(n) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// Giorni consecutivi lavorati includendo la data D (se il candidato prendesse questo turno):
// somma la corsa all'indietro e in avanti da D sull'insieme delle date lavorate.
function consecutiveDaysIncluding(workedDates, dateStr) {
  let count = 1;
  const d = parseDate(dateStr);
  for (let cur = addDays(d, -1); workedDates.has(fmtDate(cur)); cur = addDays(cur, -1)) count += 1;
  for (let cur = addDays(d, 1); workedDates.has(fmtDate(cur)); cur = addDays(cur, 1)) count += 1;
  return count;
}

function reason(text, kind) {
  return { text, kind }; // kind: 'positive' | 'neutral' | 'negative'
}

async function rankCandidates({ shift, companyId }) {
  const date = toDateOnly(shift.date);
  const startTime = shift.start_time.slice(0, 5);
  const endTime = shift.end_time.slice(0, 5);
  const shiftHours = shiftDurationHours({ startTime, endTime });
  const areaId = shift.area_id;

  // 1) Pool: dipendenti (ruolo 'user') assegnati all'area del turno.
  const { rows: poolRows } = await pool.query(
    `SELECT u.id, u.username
       FROM users u
       JOIN user_areas ua ON ua.user_id = u.id
      WHERE ua.area_id = $1 AND u.role = 'user'
      ORDER BY u.username`,
    [areaId]
  );
  if (poolRows.length === 0) return [];
  const poolIds = poolRows.map((r) => r.id);

  // 2) Batch: disponibilità, contratti, storico accettazioni.
  const [{ rows: availRows }, { rows: contractRows }, { rows: historyRows }] = await Promise.all([
    pool.query('SELECT user_id, weekday, start_time, end_time FROM user_availability WHERE user_id = ANY($1::int[])', [poolIds]),
    pool.query('SELECT * FROM user_contracts WHERE user_id = ANY($1::int[])', [poolIds]),
    pool.query(
      `SELECT user_id, COUNT(*)::int AS accepted
         FROM shifts
        WHERE user_id = ANY($1::int[]) AND type = 'volante'
        GROUP BY user_id`,
      [poolIds]
    ),
  ]);

  const availByUser = {};
  for (const r of availRows) {
    (availByUser[r.user_id] = availByUser[r.user_id] || []).push({
      weekday: r.weekday,
      start: r.start_time.slice(0, 5),
      end: r.end_time.slice(0, 5),
    });
  }
  const contractByUser = {};
  for (const r of contractRows) contractByUser[r.user_id] = r;
  const historyByUser = {};
  for (const r of historyRows) historyByUser[r.user_id] = r.accepted;

  // 3) Ore già assegnate: un'unica espansione dei turni della società sulla finestra che copre
  //    sia la settimana sia il mese della data del turno (poi raggruppata per dipendente in memoria).
  const d = parseDate(date);
  const weekStart = startOfWeek(d);
  const weekEnd = addDays(weekStart, 6);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
  const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const rangeStart = fmtDate(weekStart < monthStart ? weekStart : monthStart);
  const rangeEnd = fmtDate(weekEnd > monthEnd ? weekEnd : monthEnd);
  const weekStartS = fmtDate(weekStart);
  const weekEndS = fmtDate(weekEnd);
  const monthStartS = fmtDate(monthStart);
  const monthEndS = fmtDate(monthEnd);

  const allShifts = await getExpandedShifts({ start: rangeStart, end: rangeEnd, companyId });
  const shiftsByUser = {};
  for (const s of allShifts) {
    if (!s.userId) continue; // le Sostituzioni aperte (incluso questo turno) non contano
    (shiftsByUser[s.userId] = shiftsByUser[s.userId] || []).push(s);
  }

  const WA = CONFIG.weights.availability;
  const WC = CONFIG.weights.contract;
  const WL = CONFIG.weights.load;
  const WH = CONFIG.weights.history;
  const dayCode = DAY_CODES[d.getDay()];

  // --- Passo 1: metriche e punteggi indipendenti dal resto del pool ---
  const partial = [];
  for (const cand of poolRows) {
    const userShifts = shiftsByUser[cand.id] || [];

    // Esclusione rigida: sovrapposizione con un turno già assegnato nella stessa data.
    const overlaps = userShifts.some((s) => s.date === date && s.startTime < endTime && startTime < s.endTime);
    if (overlaps) continue;

    let weeklyHours = 0;
    let monthlyHours = 0;
    let dailyHours = 0;
    const workedDates = new Set();
    for (const s of userShifts) {
      const h = shiftDurationHours(s);
      if (s.date >= weekStartS && s.date <= weekEndS) weeklyHours += h;
      if (s.date >= monthStartS && s.date <= monthEndS) monthlyHours += h;
      if (s.date === date) dailyHours += h;
      workedDates.add(s.date);
    }
    workedDates.add(date); // conteggio "giorni consecutivi" come se prendesse questo turno

    const reasons = [reason('Assegnato a quest\'area', 'positive')];

    // Disponibilità
    const slots = availByUser[cand.id] || [];
    const daySlots = slots.filter((s) => s.weekday === dayCode);
    let availabilityScore;
    if (slots.length === 0) {
      availabilityScore = 0.6 * WA;
      reasons.push(reason('Disponibilità da verificare (nessuna dichiarata)', 'neutral'));
    } else if (daySlots.some((s) => s.start <= startTime && s.end >= endTime)) {
      availabilityScore = WA;
      reasons.push(reason('Disponibile nella fascia richiesta', 'positive'));
    } else if (daySlots.some((s) => s.start < endTime && startTime < s.end)) {
      availabilityScore = 0.5 * WA;
      reasons.push(reason('Disponibilità solo parziale nella fascia', 'neutral'));
    } else {
      availabilityScore = 0.15 * WA;
      reasons.push(reason('Fuori dalle fasce dichiarate', 'negative'));
    }

    // Contratto
    const contract = contractByUser[cand.id];
    let contractScore;
    if (!contract) {
      contractScore = 0.7 * WC;
      reasons.push(reason('Contratto non configurato', 'neutral'));
    } else {
      const projWeek = weeklyHours + shiftHours;
      const projMonth = monthlyHours + shiftHours;
      const projDay = dailyHours + shiftHours;
      const consecutive = consecutiveDaysIncluding(workedDates, date);
      const violations = [];
      const nears = [];

      const checkHours = (limit, proj, label) => {
        if (limit == null) return;
        const max = Number(limit);
        if (proj > max) violations.push(`Supererebbe ${label} (${fmtHours(proj)}h > ${fmtHours(max)}h)`);
        else if (proj >= CONFIG.nearLimitRatio * max) nears.push(`Vicino al limite ${label} (${fmtHours(proj)}/${fmtHours(max)}h)`);
      };
      checkHours(contract.max_weekly_hours, projWeek, 'le ore settimanali');
      checkHours(contract.max_monthly_hours, projMonth, 'le ore mensili');
      checkHours(contract.max_daily_hours, projDay, 'le ore giornaliere');
      if (contract.max_consecutive_days != null && consecutive > contract.max_consecutive_days) {
        violations.push(`Supererebbe i giorni consecutivi (${consecutive} > ${contract.max_consecutive_days})`);
      }

      if (violations.length > 0) {
        contractScore = 0;
        for (const v of violations) reasons.push(reason(v, 'negative'));
      } else if (nears.length > 0) {
        contractScore = 0.6 * WC;
        for (const n of nears) reasons.push(reason(n, 'neutral'));
      } else {
        contractScore = WC;
        reasons.push(reason(`Entro i limiti contrattuali (${fmtHours(projWeek)}h settimanali)`, 'positive'));
      }
    }

    // Storico
    const accepted = historyByUser[cand.id] || 0;
    let historyScore = 0.5 * WH;
    if (accepted > 0) {
      historyScore += 0.5 * WH;
      reasons.push(reason(`Ha già accettato ${accepted} sostituzion${accepted > 1 ? 'i' : 'e'}`, 'positive'));
    }

    partial.push({
      userId: cand.id,
      username: cand.username,
      weeklyHours,
      baseScore: availabilityScore + contractScore + historyScore,
      reasons,
    });
  }

  if (partial.length === 0) return [];

  // --- Passo 2: bilanciamento del carico, relativo al pool (serve min/max settimanale) ---
  const weeklies = partial.map((c) => c.weeklyHours);
  const minW = Math.min(...weeklies);
  const maxW = Math.max(...weeklies);

  const ranked = partial.map((c) => {
    let loadScore;
    if (maxW === minW) {
      loadScore = WL;
      c.reasons.push(reason(`Carico settimanale in linea con gli altri (${fmtHours(c.weeklyHours)}h)`, 'neutral'));
    } else {
      loadScore = (WL * (maxW - c.weeklyHours)) / (maxW - minW);
      if (c.weeklyHours <= minW + (maxW - minW) / 3) {
        c.reasons.push(reason(`Carico settimanale contenuto (${fmtHours(c.weeklyHours)}h)`, 'positive'));
      } else if (c.weeklyHours >= maxW - (maxW - minW) / 3) {
        c.reasons.push(reason(`Maggiore carico ore settimanale (${fmtHours(c.weeklyHours)}h)`, 'neutral'));
      }
    }
    const score = Math.max(0, Math.min(100, Math.round(c.baseScore + loadScore)));
    return { userId: c.userId, username: c.username, score, reasons: c.reasons };
  });

  ranked.sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));
  return ranked;
}

module.exports = { rankCandidates, CONFIG };
