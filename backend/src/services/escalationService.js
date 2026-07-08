const pool = require('../config/db');
const { toDateOnly } = require('./shiftExpansion');
const { notifySubstitutionEscalated } = require('./notificationService');

// ============================================================================
// Escalation lazy delle sostituzioni (Fase 7)
// ============================================================================
// Rilevamento SENZA cron (vincolo hosting serverless Vercel): la passata gira quando un responsabile
// carica le notifiche (GET /api/notifications), agganciata al polling già esistente della campanella.
// Se una Sostituzione è aperta (scoperta) da più ore del tempo configurato dalla società
// (companies.substitution_escalation_hours), avvisa i responsabili. È:
//   - best-effort: cattura e logga, non lancia mai (non deve far fallire il caricamento notifiche);
//   - idempotente: la notifica usa dedupe_key 'escalation:<shiftId>' → scatta una volta per turno,
//     anche se la passata gira a ogni poll (indice unico parziale su notifications).
// Limite noto (accettato per la v1): senza cron, l'escalation viene generata solo quando un
// responsabile è attivo e carica le notifiche — cioè esattamente quando può agire. Se nessun
// responsabile è online, la segnalazione compare al primo accesso successivo.

function pad(n) {
  return String(n).padStart(2, '0');
}
function todayDateString() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

async function escalateOverdueSubstitutions(companyId) {
  try {
    const { rows: companyRows } = await pool.query(
      'SELECT substitution_escalation_hours FROM companies WHERE id = $1',
      [companyId]
    );
    const hours = companyRows[0]?.substitution_escalation_hours;
    if (!hours || hours <= 0) return; // escalation disattivata per questa società

    // Sostituzioni ancora scoperte, per una data futura (c'è ancora tempo per intervenire), aperte da
    // più del tempo configurato (misurato da created_at, cioè da quando sono state pubblicate).
    const { rows: shifts } = await pool.query(
      `SELECT id, area_id, sede_id, date, start_time, end_time
         FROM shifts
        WHERE company_id = $1
          AND type = 'volante' AND user_id IS NULL AND status = 'active'
          AND date >= $2
          AND created_at <= NOW() - make_interval(hours => $3::int)
        ORDER BY date, start_time
        LIMIT 50`,
      [companyId, todayDateString(), hours]
    );

    for (const s of shifts) {
      await notifySubstitutionEscalated({
        companyId,
        areaId: s.area_id,
        sedeId: s.sede_id,
        shiftId: s.id,
        date: toDateOnly(s.date),
        startTime: s.start_time.slice(0, 5),
        endTime: s.end_time.slice(0, 5),
        hours,
      });
    }
  } catch (err) {
    console.error('[escalation] passata fallita (non bloccante):', err.message);
  }
}

module.exports = { escalateOverdueSubstitutions };
