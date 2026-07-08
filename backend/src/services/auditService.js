const pool = require('../config/db');

// Servizio centralizzato di audit trail (Fase S3). Registra le operazioni importanti nella tabella
// audit_logs. Segue lo stesso principio del servizio notifiche: scrittura BEST-EFFORT e non
// bloccante — un errore di logging NON deve mai far fallire l'operazione applicativa. Per questo
// logAction cattura internamente qualunque errore e non lo propaga mai.
//
// È awaitabile: su hosting serverless (Vercel) conviene attendere la scrittura prima che la
// funzione venga congelata al termine della risposta, ma senza rischiare di rompere il flusso.

// Codici azione usati (elenco non esaustivo, si estende liberamente):
//   auth.login, auth.login_failed,
//   user.create, user.delete, user.reset_password, user.regenerate_code, user.update_areas,
//   shift.create, shift.update, shift.delete,
//   course.create, course.update, course.delete,
//   cancellation.approve, cancellation.reject,
//   company.create, company.update, company.dirigente_create
async function logAction({
  companyId = null,
  actorUserId = null,
  action,
  entityType = null,
  entityId = null,
  metadata = null,
  ip = null,
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata, ip)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        companyId,
        actorUserId,
        action,
        entityType,
        entityId != null ? Number(entityId) : null,
        metadata ? JSON.stringify(metadata) : null,
        ip,
      ]
    );
  } catch (err) {
    // Non rilanciare: l'audit è accessorio rispetto all'operazione principale.
    console.error(`[audit] impossibile registrare l'evento "${action}":`, err.message);
  }
}

// Comodità: registra un'azione ricavando company_id/actor/ip dalla request autenticata.
async function logFromReq(req, { action, entityType = null, entityId = null, metadata = null }) {
  await logAction({
    companyId: req.user ? req.user.companyId || null : null,
    actorUserId: req.user ? req.user.id || null : null,
    action,
    entityType,
    entityId,
    metadata,
    ip: ipFromReq(req),
  });
}

// Estrae l'IP del chiamante. Dietro il proxy di Vercel/hosting l'IP reale è nel primo elemento di
// X-Forwarded-For; in locale si ricade su req.ip / socket.
function ipFromReq(req) {
  const fwd = req.headers && req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim().slice(0, 64);
  const direct = req.ip || (req.socket && req.socket.remoteAddress) || null;
  return direct ? String(direct).slice(0, 64) : null;
}

module.exports = { logAction, logFromReq, ipFromReq };
