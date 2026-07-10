const pool = require('../config/db');
const { peekActionToken, consumeActionToken } = require('../services/emailActionService');
const { acceptProposalForUser, declineProposalForUser } = require('./substitutionProposalController');
const { approveRequestCore, rejectRequestCore, loadPendingRequest } = require('./cancellationController');
const { toDateOnly } = require('../services/shiftExpansion');
const { MANAGER_ROLES } = require('../middleware/auth');
const audit = require('../services/auditService');

// Email Actions (Fase E5): eseguire un'azione da un bottone nell'email senza aprire il portale.
// Sicurezza (requisito esplicito): token dedicati monouso a scadenza (email_action_tokens), la
// MUTAZIONE avviene SOLO tramite POST /execute dopo conferma nel frontend — i link in GET (describe)
// non modificano nulla, così i prefetch dei client email non innescano l'azione. Entrambi gli
// endpoint sono PUBBLICI: il token È la prova e vincola utente + azione + entità.

const TITLES = {
  proposal_accept: 'Accetta la sostituzione',
  proposal_decline: 'Rifiuta la sostituzione',
  cancellation_approve: 'Approva la richiesta di cancellazione',
  cancellation_reject: 'Rifiuta la richiesta di cancellazione',
};

// Carica l'utente "attore" del token (colui per cui l'azione è emessa).
async function loadActor(userId) {
  const { rows } = await pool.query('SELECT id, username, company_id, role FROM users WHERE id = $1', [userId]);
  const u = rows[0];
  return u ? { id: u.id, username: u.username, companyId: u.company_id, role: u.role } : null;
}

// Descrizione leggibile + azionabilità corrente dell'entità (senza mutare nulla).
async function buildActionInfo(rec) {
  const title = TITLES[rec.action] || 'Azione';
  if (rec.entity_type === 'proposal') {
    const { rows } = await pool.query(
      `SELECT sp.status, s.date, s.start_time, s.end_time, oa.name AS area_name
         FROM substitution_proposals sp
         JOIN shifts s ON s.id = sp.shift_id
         LEFT JOIN operational_areas oa ON oa.id = s.area_id
        WHERE sp.id = $1 AND sp.user_id = $2`,
      [rec.entity_id, rec.user_id]
    );
    const p = rows[0];
    if (!p) return { title, description: 'La proposta non è più disponibile.', actionable: false };
    const when = `${toDateOnly(p.date)} ${p.start_time.slice(0, 5)}-${p.end_time.slice(0, 5)}`;
    const where = p.area_name ? ` (${p.area_name})` : '';
    const verbo = rec.action === 'proposal_accept' ? 'accettare' : 'rifiutare';
    return {
      title,
      description: `Confermi di ${verbo} la sostituzione del ${when}${where}?`,
      actionable: p.status === 'pending',
      note: p.status === 'pending' ? null : 'Questa proposta è già stata gestita.',
    };
  }
  if (rec.entity_type === 'cancellation_request') {
    const { rows } = await pool.query(
      `SELECT cr.status, cr.shift_date, cr.shift_start_time, cr.shift_end_time, u.username AS requester
         FROM cancellation_requests cr JOIN users u ON u.id = cr.requested_by
        WHERE cr.id = $1 AND cr.company_id = $2`,
      [rec.entity_id, rec.company_id]
    );
    const r = rows[0];
    if (!r) return { title, description: 'La richiesta non è più disponibile.', actionable: false };
    const when = `${toDateOnly(r.shift_date)} ${r.shift_start_time.slice(0, 5)}-${r.shift_end_time.slice(0, 5)}`;
    const verbo = rec.action === 'cancellation_approve' ? 'approvare' : 'rifiutare';
    return {
      title,
      description: `Confermi di ${verbo} la richiesta di cancellazione di ${r.requester} per il turno del ${when}?`,
      actionable: r.status === 'pending',
      note: r.status === 'pending' ? null : 'Questa richiesta è già stata gestita.',
    };
  }
  return { title, description: 'Azione non riconosciuta.', actionable: false };
}

// GET /api/email-actions/:token — descrizione per la schermata di conferma (NON muta nulla).
async function describeAction(req, res) {
  const rec = await peekActionToken(req.params.token);
  if (!rec) {
    return res.json({ valid: false, message: 'Questo link non è più valido o è scaduto.' });
  }
  const info = await buildActionInfo(rec);
  return res.json({ valid: true, action: rec.action, ...info });
}

// POST /api/email-actions/:token — esegue l'azione (consuma il token in modo ATOMICO, poi agisce).
async function executeAction(req, res) {
  const rec = await consumeActionToken(req.params.token);
  if (!rec) {
    return res.status(400).json({ error: 'Questo link non è più valido o è scaduto.' });
  }
  const actor = await loadActor(rec.user_id);
  if (!actor) {
    return res.status(400).json({ error: 'Utente non valido.' });
  }

  try {
    if (rec.entity_type === 'proposal') {
      return await execProposal(req, rec, actor, res);
    }
    if (rec.entity_type === 'cancellation_request') {
      return await execCancellation(req, rec, actor, res);
    }
    return res.status(400).json({ error: 'Azione non supportata.' });
  } catch (err) {
    console.error('[email-action] esecuzione fallita:', err.message);
    return res.status(500).json({ error: "Errore durante l'esecuzione dell'azione." });
  }
}

async function execProposal(req, rec, actor, res) {
  const { rows } = await pool.query('SELECT * FROM substitution_proposals WHERE id = $1 AND user_id = $2', [rec.entity_id, actor.id]);
  const proposal = rows[0];
  if (!proposal) {
    return res.json({ done: false, message: 'La proposta non è più disponibile.' });
  }

  const result =
    rec.action === 'proposal_accept'
      ? await acceptProposalForUser({ proposal, user: actor })
      : await declineProposalForUser({ proposal, user: actor });

  if (!result.ok) {
    // Non azionabile (già gestita, turno coperto, sovrapposizione): messaggio, non errore HTTP.
    return res.json({ done: false, message: result.error });
  }

  await audit.logAction({
    companyId: actor.companyId,
    actorUserId: actor.id,
    action: `email_action.${rec.action}`,
    entityType: 'proposal',
    entityId: rec.entity_id,
    ip: audit.ipFromReq(req),
  });

  return res.json({
    done: true,
    message: rec.action === 'proposal_accept' ? 'Hai accettato la sostituzione.' : 'Hai rifiutato la proposta.',
  });
}

async function execCancellation(req, rec, actor, res) {
  // Autorizzazione: solo un responsabile/dirigente della società del token può approvare/rifiutare.
  if (!MANAGER_ROLES.includes(actor.role) || actor.companyId !== rec.company_id) {
    return res.status(403).json({ error: 'Non sei autorizzato a eseguire questa azione.' });
  }

  const request = await loadPendingRequest(rec.entity_id, rec.company_id);
  if (!request) {
    return res.json({ done: false, message: 'Questa richiesta è già stata gestita o non è più disponibile.' });
  }

  if (rec.action === 'cancellation_approve') {
    await approveRequestCore({ request, actorUserId: actor.id });
  } else {
    await rejectRequestCore({ request, actorUserId: actor.id });
  }

  await audit.logAction({
    companyId: actor.companyId,
    actorUserId: actor.id,
    action: `email_action.${rec.action}`,
    entityType: 'cancellation_request',
    entityId: rec.entity_id,
    ip: audit.ipFromReq(req),
  });

  return res.json({
    done: true,
    message:
      rec.action === 'cancellation_approve'
        ? 'Hai approvato la richiesta di cancellazione.'
        : 'Hai rifiutato la richiesta di cancellazione.',
  });
}

module.exports = { describeAction, executeAction };
