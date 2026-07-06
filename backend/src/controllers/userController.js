const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { generateInitialCode } = require('../utils/generateCode');

function toSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role,
    mustChangePassword: user.must_change_password,
    // Il codice iniziale è visibile solo finché non è stato consumato al primo accesso
    initialCode: user.must_change_password ? user.initial_code : null,
    createdAt: user.created_at,
  };
}

// Solo il dirigente può creare/modificare/eliminare account di responsabili (o del dirigente stesso).
// Sugli account 'user' possono operare sia responsabili che dirigente.
function canManageTargetRole(actorRole, targetRole) {
  if (targetRole === 'user') return actorRole === 'admin' || actorRole === 'dirigente';
  return actorRole === 'dirigente';
}

// POST /api/users (responsabile o dirigente)
// Crea un nuovo utente assegnandogli username e codice iniziale di primo accesso.
// Solo il dirigente può creare account con ruolo 'admin' (responsabile); il ruolo 'dirigente'
// non è creabile da API (esiste un solo account dirigente, creato via seed).
async function createUser(req, res) {
  const { username, email, phone, role } = req.body;
  const targetRole = role || 'user';

  if (!username || !email || !phone) {
    return res.status(400).json({ error: 'Username, email e telefono sono obbligatori' });
  }

  if (!['user', 'admin'].includes(targetRole)) {
    return res.status(400).json({ error: 'Ruolo non valido' });
  }

  if (targetRole === 'admin' && req.user.role !== 'dirigente') {
    return res.status(403).json({ error: 'Solo il dirigente può creare account responsabile' });
  }

  const existing = await pool.query(
    'SELECT id FROM users WHERE username = $1 OR email = $2',
    [username, email]
  );
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Username o email già in uso' });
  }

  const initialCode = generateInitialCode();

  const { rows } = await pool.query(
    `INSERT INTO users (username, email, phone, initial_code, role, must_change_password)
     VALUES ($1, $2, $3, $4, $5, TRUE)
     RETURNING *`,
    [username, email, phone, initialCode, targetRole]
  );
  const user = rows[0];

  return res.status(201).json({
    user: toSafeUser(user),
    initialCode, // comunicato una sola volta al responsabile, da consegnare al dipendente
  });
}

// GET /api/users (responsabile o dirigente) - elenco utenti per la gestione
async function listUsers(req, res) {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
  return res.json({ users: rows.map(toSafeUser) });
}

async function fetchUserOr404(id, res) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (!rows[0]) {
    res.status(404).json({ error: 'Utente non trovato' });
    return null;
  }
  return rows[0];
}

// POST /api/users/:id/reset-password - imposta direttamente una nuova password (l'utente potrà accedere subito)
async function resetPassword(req, res) {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'La password deve avere almeno 8 caratteri' });
  }

  const target = await fetchUserOr404(id, res);
  if (!target) return;

  if (!canManageTargetRole(req.user.role, target.role)) {
    return res.status(403).json({ error: 'Non autorizzato a gestire questo account' });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const { rows } = await pool.query(
    `UPDATE users SET password_hash = $1, initial_code = NULL, must_change_password = FALSE
      WHERE id = $2
      RETURNING *`,
    [passwordHash, id]
  );

  return res.json({ user: toSafeUser(rows[0]) });
}

// POST /api/users/:id/regenerate-code - invalida la password attuale e obbliga un nuovo primo accesso
async function regenerateCode(req, res) {
  const { id } = req.params;

  const target = await fetchUserOr404(id, res);
  if (!target) return;

  if (!canManageTargetRole(req.user.role, target.role)) {
    return res.status(403).json({ error: 'Non autorizzato a gestire questo account' });
  }

  const initialCode = generateInitialCode();
  const { rows } = await pool.query(
    `UPDATE users SET initial_code = $1, password_hash = NULL, must_change_password = TRUE
      WHERE id = $2
      RETURNING *`,
    [initialCode, id]
  );

  return res.json({ user: toSafeUser(rows[0]), initialCode });
}

// DELETE /api/users/:id
async function deleteUser(req, res) {
  const { id } = req.params;

  const target = await fetchUserOr404(id, res);
  if (!target) return;

  if (Number(id) === req.user.id) {
    return res.status(400).json({ error: 'Non puoi eliminare il tuo stesso account' });
  }

  if (!canManageTargetRole(req.user.role, target.role)) {
    return res.status(403).json({ error: 'Non autorizzato a gestire questo account' });
  }

  if (target.role === 'dirigente') {
    const { rows } = await pool.query("SELECT COUNT(*)::int AS count FROM users WHERE role = 'dirigente'");
    if (rows[0].count <= 1) {
      return res.status(400).json({ error: "Non è possibile eliminare l'unico account dirigente" });
    }
  }

  await pool.query('DELETE FROM users WHERE id = $1', [id]);
  return res.status(204).send();
}

module.exports = { createUser, listUsers, resetPassword, regenerateCode, deleteUser };
