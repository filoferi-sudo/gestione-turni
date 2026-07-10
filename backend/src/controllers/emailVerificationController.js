const pool = require('../config/db');
const authTokens = require('../services/authTokenService');
const { issueAndSendVerification } = require('../services/emailVerificationService');
const audit = require('../services/auditService');

// Verifica e cambio dell'indirizzo email dell'utente (Fase E2). Tre operazioni:
//   - sendVerification  (self)    reinvia il link di verifica all'indirizzo attuale o a quello in
//                                 attesa (pending_email), se un cambio è in corso.
//   - changeEmail       (self)    richiede il cambio: salva pending_email + invia il link al nuovo
//                                 indirizzo. L'email attiva NON cambia finché non si conferma.
//   - verifyEmail       (pubblico) conferma tramite token: promuove pending_email o marca verificata.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/auth/send-verification (authenticate)
async function sendVerification(req, res) {
  const { rows } = await pool.query(
    'SELECT id, username, email, email_verified, pending_email, company_id FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });

  // Se non c'è un cambio in corso e l'email è già verificata, non c'è nulla da fare.
  if (!user.pending_email && user.email_verified) {
    return res.json({ ok: true, alreadyVerified: true });
  }

  const target = user.pending_email || user.email;
  await issueAndSendVerification({
    userId: user.id,
    companyId: user.company_id,
    username: user.username,
    toEmail: target,
  });
  return res.json({ ok: true, sentTo: target });
}

// POST /api/auth/change-email (authenticate)
async function changeEmail(req, res) {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Indirizzo email non valido' });
  }

  const { rows } = await pool.query(
    'SELECT id, username, email, company_id FROM users WHERE id = $1',
    [req.user.id]
  );
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });

  if (email === String(user.email || '').toLowerCase()) {
    return res.status(400).json({ error: 'Il nuovo indirizzo coincide con quello attuale' });
  }

  // Unicità globale di piattaforma (username/email UNIQUE): non deve appartenere a un altro account.
  const { rows: taken } = await pool.query('SELECT id FROM users WHERE LOWER(email) = $1 AND id <> $2', [email, user.id]);
  if (taken.length > 0) {
    return res.status(409).json({ error: 'Indirizzo email già in uso' });
  }

  await pool.query('UPDATE users SET pending_email = $1 WHERE id = $2', [email, user.id]);
  await issueAndSendVerification({
    userId: user.id,
    companyId: user.company_id,
    username: user.username,
    toEmail: email,
  });

  await audit.logFromReq(req, { action: 'user.change_email_request', entityType: 'user', entityId: user.id });
  return res.json({ ok: true, pendingEmail: email });
}

// POST /api/auth/verify-email (PUBBLICO: il token è la prova, nessuna sessione richiesta)
async function verifyEmail(req, res) {
  const token = req.body.token;
  if (!token) return res.status(400).json({ error: 'Token mancante' });

  const result = await authTokens.consumeToken(token, 'email_verification');
  if (!result.valid) {
    return res.status(400).json({ error: 'Link di verifica non valido o scaduto. Richiedine uno nuovo.' });
  }

  const { rows } = await pool.query('SELECT id, email, pending_email, company_id FROM users WHERE id = $1', [result.userId]);
  const user = rows[0];
  if (!user) return res.status(404).json({ error: 'Utente non trovato' });

  if (user.pending_email) {
    // Cambio email: promuovi pending_email a email. Ricontrolla l'unicità (qualcuno potrebbe averla
    // presa tra la richiesta e la conferma). Non azzeriamo pending_email in caso di conflitto: l'utente
    // può ritentare con un altro indirizzo.
    const { rows: taken } = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1) AND id <> $2', [user.pending_email, user.id]);
    if (taken.length > 0) {
      return res.status(409).json({ error: 'Questo indirizzo è stato nel frattempo associato a un altro account.' });
    }
    try {
      await pool.query('UPDATE users SET email = $1, email_verified = TRUE, pending_email = NULL WHERE id = $2', [user.pending_email, user.id]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(409).json({ error: 'Questo indirizzo è stato nel frattempo associato a un altro account.' });
      }
      throw err;
    }
  } else {
    // Verifica dell'indirizzo attuale.
    await pool.query('UPDATE users SET email_verified = TRUE WHERE id = $1', [user.id]);
  }

  await audit.logAction({
    companyId: user.company_id,
    actorUserId: user.id,
    action: 'user.email_verified',
    entityType: 'user',
    entityId: user.id,
    ip: audit.ipFromReq(req),
  });
  return res.json({ ok: true });
}

module.exports = { sendVerification, changeEmail, verifyEmail };
