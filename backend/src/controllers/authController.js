const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const JWT_SECRET = process.env.JWT_SECRET;
const SESSION_EXPIRES_IN = '8h';
const FIRST_ACCESS_EXPIRES_IN = '10m';

function toSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role,
    mustChangePassword: user.must_change_password,
  };
}

// POST /api/auth/login
// Un unico form di login gestisce sia l'accesso standard (username + password)
// sia il primo accesso (username + codice iniziale).
async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username e password/codice sono obbligatori' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
  const user = rows[0];

  if (!user) {
    return res.status(401).json({ error: 'Credenziali non valide' });
  }

  // Primo accesso: l'utente non ha ancora una password, deve usare il codice iniziale
  if (user.must_change_password) {
    if (!user.initial_code || password !== user.initial_code) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const firstAccessToken = jwt.sign(
      { id: user.id, username: user.username, type: 'first_access' },
      JWT_SECRET,
      { expiresIn: FIRST_ACCESS_EXPIRES_IN }
    );

    return res.json({
      firstAccess: true,
      firstAccessToken,
      user: toSafeUser(user),
    });
  }

  // Login standard
  const passwordMatches = await bcrypt.compare(password, user.password_hash || '');
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Credenziali non valide' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, type: 'session' },
    JWT_SECRET,
    { expiresIn: SESSION_EXPIRES_IN }
  );

  return res.json({ firstAccess: false, token, user: toSafeUser(user) });
}

// POST /api/auth/first-login-setup
// Richiede il firstAccessToken ottenuto da /login. Imposta la password personale
// e invalida definitivamente il codice iniziale.
async function firstLoginSetup(req, res) {
  const { newPassword } = req.body;
  const { id } = req.firstAccessUser;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La password deve avere almeno 8 caratteri' });
  }

  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  const user = rows[0];

  if (!user || !user.must_change_password) {
    return res.status(400).json({ error: 'Operazione non consentita' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);

  const { rows: updatedRows } = await pool.query(
    `UPDATE users
       SET password_hash = $1, initial_code = NULL, must_change_password = FALSE
     WHERE id = $2
     RETURNING *`,
    [passwordHash, user.id]
  );
  const updatedUser = updatedRows[0];

  const token = jwt.sign(
    { id: updatedUser.id, username: updatedUser.username, role: updatedUser.role, type: 'session' },
    JWT_SECRET,
    { expiresIn: SESSION_EXPIRES_IN }
  );

  return res.json({ token, user: toSafeUser(updatedUser) });
}

// GET /api/auth/me
async function me(req, res) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = rows[0];
  if (!user) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }
  return res.json({ user: toSafeUser(user) });
}

module.exports = { login, firstLoginSetup, me };
