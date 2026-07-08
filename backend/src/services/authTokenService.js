const crypto = require('crypto');
const pool = require('../config/db');

// Servizio dei token di autenticazione monouso e a scadenza (Fase S4). PREDISPOSIZIONE: fornisce
// creazione e consumo dei token, ma NON invia nulla (l'invio email è una fase separata, futura).
// Copre tre scopi tramite `purpose`: verifica email, reset password, 2FA via email.
//
// Principio di sicurezza: nel DB si salva SOLO l'hash SHA-256 del token; il valore in chiaro è
// restituito una sola volta al chiamante (che lo consegnerà all'utente via email/link) e non viene
// mai persistito. Così un eventuale accesso al DB non espone token spendibili.

const PURPOSES = ['email_verification', 'password_reset', 'two_factor'];

// Durate di default per scopo (minuti). Configurabili via env senza toccare il codice.
function ttlMinutesFor(purpose) {
  switch (purpose) {
    case 'email_verification':
      return parseInt(process.env.EMAIL_VERIFICATION_TTL_MINUTES, 10) || 60 * 24; // 24h
    case 'password_reset':
      return parseInt(process.env.PASSWORD_RESET_TTL_MINUTES, 10) || 30; // 30 min
    case 'two_factor':
      return parseInt(process.env.TWO_FACTOR_TTL_MINUTES, 10) || 10; // 10 min
    default:
      return 30;
  }
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// Crea un token per (userId, purpose) e restituisce il valore IN CHIARO (da consegnare all'utente).
// Di default invalida i token precedenti dello stesso scopo ancora attivi (un solo token valido per
// scopo alla volta): comportamento tipico di verifica email / reset password.
// options.ttlMinutes sovrascrive la durata di default; options.invalidatePrevious=false la disattiva.
async function createToken(userId, purpose, options = {}) {
  if (!PURPOSES.includes(purpose)) {
    throw new Error(`purpose non valido: ${purpose}`);
  }

  const invalidatePrevious = options.invalidatePrevious !== false;
  if (invalidatePrevious) {
    // "Consuma" (marca come usati) i token attivi precedenti dello stesso scopo, così restano validi
    // solo i più recenti.
    await pool.query(
      `UPDATE auth_tokens SET used_at = NOW()
        WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL`,
      [userId, purpose]
    );
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttlMinutes = options.ttlMinutes || ttlMinutesFor(purpose);
  const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, expires_at`,
    [userId, purpose, tokenHash, expiresAt]
  );

  // Il token in chiaro NON viene mai salvato: esiste solo in questo valore di ritorno.
  return { token: rawToken, tokenId: rows[0].id, expiresAt: rows[0].expires_at };
}

// Consuma un token: verifica scadenza + monouso in modo ATOMICO (una sola richiesta può "spenderlo").
// Ritorna { valid: true, userId } se il token è valido e non ancora usato; altrimenti { valid: false }.
// La marcatura used_at nella stessa UPDATE con guardia `used_at IS NULL` evita corse concorrenti.
async function consumeToken(rawToken, purpose) {
  if (!rawToken || !PURPOSES.includes(purpose)) {
    return { valid: false };
  }

  const tokenHash = hashToken(rawToken);
  const { rows } = await pool.query(
    `UPDATE auth_tokens
        SET used_at = NOW()
      WHERE token_hash = $1
        AND purpose = $2
        AND used_at IS NULL
        AND expires_at > NOW()
      RETURNING user_id`,
    [tokenHash, purpose]
  );

  if (rows.length === 0) {
    return { valid: false };
  }
  return { valid: true, userId: rows[0].user_id };
}

module.exports = { createToken, consumeToken, hashToken, PURPOSES };
