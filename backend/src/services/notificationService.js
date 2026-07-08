const pool = require('../config/db');
const { MANAGER_ROLES } = require('../middleware/auth');

// Servizio notifiche: isolato dai controller (dominio separato, coerente con la modularità
// richiesta). Le funzioni notify* sono BEST-EFFORT — catturano e loggano i propri errori senza
// mai propagarli — così un problema di invio non fa fallire l'azione principale (claim di una
// Sostituzione, approvazione di una cancellazione, ecc.), che resta l'operazione prioritaria.

// Destinatari "responsabili" per un evento su un'area operativa:
//   1) i responsabili/dirigenti ESPLICITAMENTE collegati a quell'area (oggi tipicamente nessuno:
//      manca ancora il legame area↔responsabile, ma la query è già pronta e sfrutta user_areas);
//   2) in mancanza, TUTTI gli admin/dirigente della società (fallback della prima versione).
// Struttura predisposta per collegare in futuro responsabili specifici alle aree senza toccare i
// call site: basterà popolare user_areas (o una futura tabella area_managers) per i manager.
async function resolveManagerRecipients(companyId, areaId) {
  if (areaId) {
    const { rows } = await pool.query(
      `SELECT DISTINCT u.id
         FROM users u
         JOIN user_areas ua ON ua.user_id = u.id
        WHERE u.company_id = $1 AND ua.area_id = $2 AND u.role = ANY($3)`,
      [companyId, areaId, MANAGER_ROLES]
    );
    if (rows.length > 0) return rows.map((r) => r.id);
  }
  const { rows } = await pool.query('SELECT id FROM users WHERE company_id = $1 AND role = ANY($2)', [
    companyId,
    MANAGER_ROLES,
  ]);
  return rows.map((r) => r.id);
}

// Dipendenti (ruolo 'user') assegnati a un'area: destinatari di "nuova Sostituzione disponibile".
async function resolveAreaEmployees(areaId) {
  const { rows } = await pool.query(
    `SELECT u.id
       FROM users u
       JOIN user_areas ua ON ua.user_id = u.id
      WHERE ua.area_id = $1 AND u.role = 'user'`,
    [areaId]
  );
  return rows.map((r) => r.id);
}

async function areaName(areaId) {
  if (!areaId) return null;
  const { rows } = await pool.query('SELECT name FROM operational_areas WHERE id = $1', [areaId]);
  return rows[0]?.name || null;
}

// Inserimento in blocco (una sola INSERT multi-riga) delle notifiche per un insieme di destinatari.
// Non lancia mai: cattura e logga. dedupeKey opzionale evita duplicati (indice unico parziale).
async function createNotifications({ companyId, userIds, type, message, payload = {}, dedupeKey = null, excludeUserId = null }) {
  try {
    const recipients = [...new Set(userIds)].filter((id) => id && id !== excludeUserId);
    if (recipients.length === 0) return;

    const params = [companyId, type, message, JSON.stringify(payload), dedupeKey];
    const values = recipients.map((uid, i) => {
      params.push(uid);
      return `($1, $${i + 6}, $2, $3, $4::jsonb, $5)`;
    });

    await pool.query(
      `INSERT INTO notifications (company_id, user_id, type, message, payload, dedupe_key)
       VALUES ${values.join(', ')}
       ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,
      params
    );
  } catch (err) {
    console.error('[notifications] invio fallito (non bloccante):', err.message);
  }
}

// --- Funzioni di alto livello, una per evento (chiamate dai controller, sempre con await) --------

// Una nuova Sostituzione è disponibile in un'area: avvisa i dipendenti dell'area (audience
// principale) e i responsabili (copertura da coprire). `count` > 1 per la generazione da
// fabbisogno (più posti insieme). `actorUserId` viene escluso (chi l'ha creata non si auto-notifica).
async function notifySubstitutionAvailable({ companyId, areaId, sedeId, shiftId, date, startTime, endTime, count = 1, actorUserId = null }) {
  try {
    const name = await areaName(areaId);
    const where = name ? ` in ${name}` : '';
    const when = `${date} ${startTime}-${endTime}`;
    const payload = { kind: 'substitution', shiftId, areaId, sedeId, date };

    const employees = await resolveAreaEmployees(areaId);
    const empMessage =
      count > 1
        ? `${count} nuove sostituzioni disponibili${where} il ${date}`
        : `Nuova sostituzione disponibile${where}: ${when}`;
    await createNotifications({ companyId, userIds: employees, type: 'substitution_available', message: empMessage, payload, excludeUserId: actorUserId });

    const managers = await resolveManagerRecipients(companyId, areaId);
    const mgrMessage =
      count > 1
        ? `${count} turni scoperti da coprire${where} il ${date}`
        : `Turno scoperto da coprire${where}: ${when}`;
    await createNotifications({ companyId, userIds: managers, type: 'substitution_open_manager', message: mgrMessage, payload, excludeUserId: actorUserId });
  } catch (err) {
    console.error('[notifications] notifySubstitutionAvailable fallita (non bloccante):', err.message);
  }
}

// Un dipendente ha accettato una Sostituzione: avvisa i responsabili.
async function notifySubstitutionClaimed({ companyId, areaId, sedeId, shiftId, date, startTime, endTime, claimantUsername, claimantUserId = null }) {
  try {
    const name = await areaName(areaId);
    const where = name ? ` (${name})` : '';
    const managers = await resolveManagerRecipients(companyId, areaId);
    await createNotifications({
      companyId,
      userIds: managers,
      type: 'substitution_claimed',
      message: `${claimantUsername} ha accettato la sostituzione del ${date} ${startTime}-${endTime}${where}`,
      payload: { kind: 'substitution', shiftId, areaId, sedeId, date },
      excludeUserId: claimantUserId,
    });
  } catch (err) {
    console.error('[notifications] notifySubstitutionClaimed fallita (non bloccante):', err.message);
  }
}

// Un dipendente ha richiesto la cancellazione di un turno: avvisa i responsabili (da approvare).
async function notifyCancellationRequested({ companyId, areaId, requestId, date, startTime, endTime, requesterUsername }) {
  try {
    const managers = await resolveManagerRecipients(companyId, areaId);
    await createNotifications({
      companyId,
      userIds: managers,
      type: 'cancellation_requested',
      message: `${requesterUsername} ha richiesto la cancellazione del turno del ${date} ${startTime}-${endTime}`,
      payload: { kind: 'cancellation', requestId, areaId, date },
    });
  } catch (err) {
    console.error('[notifications] notifyCancellationRequested fallita (non bloccante):', err.message);
  }
}

// Decisione su una richiesta di cancellazione: avvisa il dipendente richiedente.
async function notifyCancellationDecision({ companyId, requesterUserId, requestId, date, startTime, endTime, approved }) {
  try {
    if (!requesterUserId) return;
    await createNotifications({
      companyId,
      userIds: [requesterUserId],
      type: approved ? 'cancellation_approved' : 'cancellation_rejected',
      message: approved
        ? `La tua richiesta di cancellazione del turno del ${date} ${startTime}-${endTime} è stata approvata`
        : `La tua richiesta di cancellazione del turno del ${date} ${startTime}-${endTime} è stata rifiutata`,
      payload: { kind: 'cancellation', requestId, date },
    });
  } catch (err) {
    console.error('[notifications] notifyCancellationDecision fallita (non bloccante):', err.message);
  }
}

module.exports = {
  createNotifications,
  resolveManagerRecipients,
  resolveAreaEmployees,
  notifySubstitutionAvailable,
  notifySubstitutionClaimed,
  notifyCancellationRequested,
  notifyCancellationDecision,
};
