const pool = require('../config/db');
const { MANAGER_ROLES } = require('../middleware/auth');
const { deliverEventEmail } = require('./notificationChannels/emailChannel');
const { createActionToken } = require('./emailActionService');

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

// Rimuove dai destinatari i dipendenti con un opt-out "Non partecipare" attivo su quella data (Fase 6):
// chi ha dichiarato di non voler essere sollecitato non riceve il broadcast di nuova Sostituzione.
// Non impedisce comunque il claim autonomo (listAvailableShifts è invariato).
async function excludeOptedOut(userIds, date) {
  if (userIds.length === 0 || !date) return userIds;
  const { rows } = await pool.query(
    `SELECT user_id FROM substitution_optouts
      WHERE user_id = ANY($1::int[]) AND start_date <= $2 AND (end_date IS NULL OR end_date >= $2)`,
    [userIds, date]
  );
  const opted = new Set(rows.map((r) => r.user_id));
  return userIds.filter((id) => !opted.has(id));
}

async function areaName(areaId) {
  if (!areaId) return null;
  const { rows } = await pool.query('SELECT name FROM operational_areas WHERE id = $1', [areaId]);
  return rows[0]?.name || null;
}

async function sedeName(sedeId) {
  if (!sedeId) return null;
  const { rows } = await pool.query('SELECT name FROM sedi WHERE id = $1', [sedeId]);
  return rows[0]?.name || null;
}

async function companyName(companyId) {
  if (!companyId) return null;
  const { rows } = await pool.query('SELECT name FROM companies WHERE id = $1', [companyId]);
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

    const employees = await excludeOptedOut(await resolveAreaEmployees(areaId), date);
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

    // Canale email (best-effort): avvisa i responsabili della richiesta da approvare. Email Actions
    // (E5): ogni responsabile riceve i PROPRI token Approva/Rifiuta (buildData async, per-destinatario).
    const name = await areaName(areaId);
    await deliverEventEmail({
      companyId,
      userIds: managers,
      eventType: 'cancellation_requested',
      template: 'cancellation_requested',
      buildData: async (r) => {
        let approveUrl = null;
        let rejectUrl = null;
        try {
          const ap = await createActionToken({ userId: r.id, companyId, action: 'cancellation_approve', entityType: 'cancellation_request', entityId: requestId });
          const rj = await createActionToken({ userId: r.id, companyId, action: 'cancellation_reject', entityType: 'cancellation_request', entityId: requestId });
          approveUrl = ap.url;
          rejectUrl = rj.url;
        } catch (err) {
          console.error('[notifications] token azione cancellazione non generati (non bloccante):', err.message);
        }
        return { username: r.username, requesterUsername, date, startTime, endTime, areaName: name, approveUrl, rejectUrl };
      },
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

    // Canale email (best-effort): comunica l'esito al dipendente richiedente.
    await deliverEventEmail({
      companyId,
      userIds: [requesterUserId],
      eventType: approved ? 'cancellation_approved' : 'cancellation_rejected',
      template: approved ? 'cancellation_approved' : 'cancellation_rejected',
      buildData: (r) => ({ username: r.username, date, startTime, endTime }),
      payload: { kind: 'cancellation', requestId, date },
    });
  } catch (err) {
    console.error('[notifications] notifyCancellationDecision fallita (non bloccante):', err.message);
  }
}

// Proposta mirata inviata dal responsabile a UN singolo dipendente (Fase 5): notifica personale al
// destinatario. Diversa da notifySubstitutionAvailable (che avvisa tutta l'area): qui il turno è
// stato proposto specificamente a questa persona, che può accettarlo o rifiutarlo.
async function notifySubstitutionProposal({ companyId, proposedUserId, proposalId, shiftId, areaId, sedeId, date, startTime, endTime }) {
  try {
    const name = await areaName(areaId);
    const where = name ? ` in ${name}` : '';
    await createNotifications({
      companyId,
      userIds: [proposedUserId],
      type: 'substitution_proposed',
      message: `Ti è stata proposta una sostituzione${where}: ${date} ${startTime}-${endTime}`,
      payload: { kind: 'proposal', proposalId, shiftId, areaId, sedeId, date },
    });

    // Email Actions (E5): genera i token Accetta/Rifiuta per il dipendente proposto, così può
    // rispondere direttamente dalla mail. Se la generazione fallisce, l'email ripiega sul link all'app.
    let acceptUrl = null;
    let declineUrl = null;
    try {
      const acc = await createActionToken({ userId: proposedUserId, companyId, action: 'proposal_accept', entityType: 'proposal', entityId: proposalId });
      const dec = await createActionToken({ userId: proposedUserId, companyId, action: 'proposal_decline', entityType: 'proposal', entityId: proposalId });
      acceptUrl = acc.url;
      declineUrl = dec.url;
    } catch (err) {
      console.error('[notifications] token azione proposta non generati (non bloccante):', err.message);
    }

    // Canale email (best-effort): notifica personale al dipendente proposto.
    await deliverEventEmail({
      companyId,
      userIds: [proposedUserId],
      eventType: 'substitution_proposed',
      template: 'substitution_proposal',
      buildData: (r) => ({ username: r.username, date, startTime, endTime, areaName: name, acceptUrl, declineUrl }),
      payload: { kind: 'proposal', proposalId, shiftId, areaId, sedeId, date },
    });
  } catch (err) {
    console.error('[notifications] notifySubstitutionProposal fallita (non bloccante):', err.message);
  }
}

// Un dipendente ha RIFIUTATO una proposta mirata (Fase 5): avvisa i responsabili, così possono
// proporla a qualcun altro. Il rifiuto è anche storico per il motore (Fase 6).
async function notifyProposalDeclined({ companyId, areaId, sedeId, shiftId, date, startTime, endTime, declinerUsername, declinerUserId = null }) {
  try {
    const name = await areaName(areaId);
    const where = name ? ` (${name})` : '';
    const managers = await resolveManagerRecipients(companyId, areaId);
    await createNotifications({
      companyId,
      userIds: managers,
      type: 'substitution_proposal_declined',
      message: `${declinerUsername} ha rifiutato la proposta di sostituzione del ${date} ${startTime}-${endTime}${where}`,
      payload: { kind: 'substitution', shiftId, areaId, sedeId, date },
      excludeUserId: declinerUserId,
    });

    // Canale email (best-effort): avvisa i responsabili così possono proporla a un altro dipendente.
    await deliverEventEmail({
      companyId,
      userIds: managers,
      eventType: 'substitution_proposal_declined',
      template: 'substitution_proposal_declined',
      buildData: (r) => ({ username: r.username, declinerUsername, date, startTime, endTime, areaName: name }),
      payload: { kind: 'substitution', shiftId, areaId, sedeId, date },
      excludeUserId: declinerUserId,
    });
  } catch (err) {
    console.error('[notifications] notifyProposalDeclined fallita (non bloccante):', err.message);
  }
}

// Escalation (Fase 7): una Sostituzione è ancora scoperta oltre il tempo configurato dalla società.
// Avvisa i RESPONSABILI (l'ultimo livello: autonomia e proposte non hanno coperto il turno, tocca a
// loro intervenire). Idempotente: dedupe_key 'escalation:<shiftId>' fa scattare la notifica UNA sola
// volta per turno, anche se la passata lazy gira a ogni poll delle notifiche.
async function notifySubstitutionEscalated({ companyId, areaId, sedeId, shiftId, date, startTime, endTime, hours }) {
  try {
    const name = await areaName(areaId);
    const where = name ? ` in ${name}` : '';
    const managers = await resolveManagerRecipients(companyId, areaId);
    await createNotifications({
      companyId,
      userIds: managers,
      type: 'substitution_escalated',
      message: `Sostituzione ancora scoperta${where} da oltre ${hours}h: ${date} ${startTime}-${endTime}`,
      payload: { kind: 'substitution', shiftId, areaId, sedeId, date },
      dedupeKey: `escalation:${shiftId}`,
    });
  } catch (err) {
    console.error('[notifications] notifySubstitutionEscalated fallita (non bloccante):', err.message);
  }
}

// Nuovo turno assegnato a un dipendente (Fase E3): notifica personale al dipendente (in-app + email).
// Non riguarda le Sostituzioni (volante), che hanno il proprio flusso (notifySubstitutionAvailable):
// qui si tratta di un turno fisso/singolo assegnato direttamente a una persona.
async function notifyShiftAssigned({ companyId, userId, shiftId, areaId, sedeId, date, startTime, endTime, assignedByUsername, assignedByUserId = null }) {
  try {
    if (!userId) return;
    const [aName, sName, cName] = [await areaName(areaId), await sedeName(sedeId), await companyName(companyId)];
    const where = aName ? ` (${aName})` : '';
    await createNotifications({
      companyId,
      userIds: [userId],
      type: 'shift_assigned',
      message: `Ti è stato assegnato un turno${where}: ${date} ${startTime}-${endTime}`,
      payload: { kind: 'shift', shiftId, areaId, sedeId, date },
      excludeUserId: assignedByUserId,
    });
    await deliverEventEmail({
      companyId,
      userIds: [userId],
      eventType: 'shift_assigned',
      template: 'shift_assigned',
      buildData: (r) => ({ username: r.username, companyName: cName, date, startTime, endTime, areaName: aName, sedeName: sName, assignedBy: assignedByUsername }),
      payload: { kind: 'shift', shiftId, areaId, sedeId, date },
      excludeUserId: assignedByUserId,
    });
  } catch (err) {
    console.error('[notifications] notifyShiftAssigned fallita (non bloccante):', err.message);
  }
}

// Turno modificato (Fase E3): avvisa il dipendente assegnato mostrando vecchi e nuovi valori
// (+ eventuale motivo, non persistito, passato dal responsabile). In-app + email.
async function notifyShiftModified({ companyId, userId, shiftId, areaId, sedeId, oldDate, oldStartTime, oldEndTime, newDate, newStartTime, newEndTime, reason = null, modifiedByUsername, modifiedByUserId = null }) {
  try {
    if (!userId) return;
    const [aName, sName, cName] = [await areaName(areaId), await sedeName(sedeId), await companyName(companyId)];
    const where = aName ? ` (${aName})` : '';
    await createNotifications({
      companyId,
      userIds: [userId],
      type: 'shift_modified',
      message: `Un tuo turno${where} è stato modificato: da ${oldDate} ${oldStartTime}-${oldEndTime} a ${newDate} ${newStartTime}-${newEndTime}`,
      payload: { kind: 'shift', shiftId, areaId, sedeId, date: newDate },
      excludeUserId: modifiedByUserId,
    });
    await deliverEventEmail({
      companyId,
      userIds: [userId],
      eventType: 'shift_modified',
      template: 'shift_modified',
      buildData: (r) => ({
        username: r.username,
        companyName: cName,
        oldDate, oldStartTime, oldEndTime,
        newDate, newStartTime, newEndTime,
        areaName: aName, sedeName: sName, reason,
        modifiedBy: modifiedByUsername,
      }),
      payload: { kind: 'shift', shiftId, areaId, sedeId, date: newDate },
      excludeUserId: modifiedByUserId,
    });
  } catch (err) {
    console.error('[notifications] notifyShiftModified fallita (non bloccante):', err.message);
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
  notifySubstitutionProposal,
  notifyProposalDeclined,
  notifySubstitutionEscalated,
  notifyShiftAssigned,
  notifyShiftModified,
};
