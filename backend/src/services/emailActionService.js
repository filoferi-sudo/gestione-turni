const crypto = require('crypto');
const pool = require('../config/db');

// Servizio dei token per le Email Actions (Fase E5). Emette/valida/consuma i token che permettono di
// eseguire un'azione da un bottone nell'email (tabella email_action_tokens). Stesso principio di
// sicurezza di authTokenService: nel DB solo l'hash SHA-256, valore in chiaro restituito una volta.
//
// Due letture distinte:
//   - peekActionToken   = valida SENZA consumare (per la schermata di conferma nel frontend, GET).
//   - consumeActionToken = marca used_at in modo ATOMICO (per l'esecuzione, POST). Monouso.

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
const ACTIONS = ['proposal_accept', 'proposal_decline', 'cancellation_approve', 'cancellation_reject'];

function ttlMinutes() {
  // Finestra ampia (default 7 giorni): la validità dell'azione è comunque ri-verificata sullo stato
  // reale dell'entità al momento dell'esecuzione (una proposta già gestita non è più azionabile).
  return parseInt(process.env.EMAIL_ACTION_TTL_MINUTES, 10) || 60 * 24 * 7;
}

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// URL della pagina pubblica di conferma nel frontend.
function actionLink(rawToken) {
  return `${APP_BASE_URL}/azione-email?token=${encodeURIComponent(rawToken)}`;
}

async function createActionToken({ userId, companyId, action, entityType, entityId, ttl }) {
  if (!ACTIONS.includes(action)) throw new Error(`Email action non valida: ${action}`);
  const raw = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + (ttl || ttlMinutes()) * 60 * 1000);
  await pool.query(
    `INSERT INTO email_action_tokens (token_hash, user_id, company_id, action, entity_type, entity_id, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [hashToken(raw), userId, companyId || null, action, entityType, entityId, expiresAt]
  );
  return { token: raw, url: actionLink(raw) };
}

async function peekActionToken(rawToken) {
  if (!rawToken) return null;
  const { rows } = await pool.query(
    'SELECT * FROM email_action_tokens WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()',
    [hashToken(rawToken)]
  );
  return rows[0] || null;
}

async function consumeActionToken(rawToken) {
  if (!rawToken) return null;
  const { rows } = await pool.query(
    `UPDATE email_action_tokens SET used_at = NOW()
      WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
      RETURNING *`,
    [hashToken(rawToken)]
  );
  return rows[0] || null;
}

module.exports = { createActionToken, peekActionToken, consumeActionToken, actionLink, ACTIONS };
