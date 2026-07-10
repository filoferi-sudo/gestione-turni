const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { generateInitialCode } = require('../utils/generateCode');
const { fetchUserAreas, fetchUserAreasBatch } = require('../services/userAreas');
const { validatePassword } = require('../utils/passwordPolicy');
const { bcryptRounds } = require('../config/security');
const audit = require('../services/auditService');
const { issueAndSendVerification } = require('../services/emailVerificationService');

function toSafeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    phone: user.phone,
    role: user.role,
    category: user.category,
    companyId: user.company_id,
    mustChangePassword: user.must_change_password,
    // Stato verifica email (Fase E2): allineato all'altra copia di toSafeUser in authController.
    emailVerified: user.email_verified === true,
    pendingEmail: user.pending_email || null,
    // isDemo (colonna della società): tenuto allineato all'altra copia di toSafeUser in
    // authController — vedi PROJECT_CONTEXT "toSafeUser duplicata". Fonte autoritativa per il
    // frontend è comunque /auth/me; qui è per coerenza. false se la colonna non è nel result set.
    isDemo: user.is_demo === true,
    // Il codice iniziale è visibile solo finché non è stato consumato al primo accesso
    initialCode: user.must_change_password ? user.initial_code : null,
    createdAt: user.created_at,
    areas: [], // valorizzato dai chiamanti con fetchUserAreas/fetchUserAreasBatch (vedi sotto)
  };
}

// Verifica che tutte le aree indicate esistano e appartengano alla società di chi opera: evita
// di assegnare un dipendente ad aree di un'altra società (anche indovinando l'id).
async function assertAreasBelongToCompany(areaIds, companyId) {
  if (areaIds.length === 0) return true;
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS count FROM operational_areas WHERE id = ANY($1::int[]) AND company_id = $2',
    [areaIds, companyId]
  );
  return rows[0].count === areaIds.length;
}

async function setUserAreas(userId, areaIds) {
  await pool.query('DELETE FROM user_areas WHERE user_id = $1', [userId]);
  if (areaIds.length > 0) {
    const values = areaIds.map((_, i) => `($1, $${i + 2})`).join(', ');
    await pool.query(`INSERT INTO user_areas (user_id, area_id) VALUES ${values}`, [userId, ...areaIds]);
  }
}

// Solo il dirigente può creare/modificare/eliminare account di responsabili (o del dirigente stesso).
// Sugli account 'user' possono operare sia responsabili che dirigente.
function canManageTargetRole(actorRole, targetRole) {
  if (targetRole === 'user') return actorRole === 'admin' || actorRole === 'dirigente';
  return actorRole === 'dirigente';
}

// Un dirigente/responsabile può gestire solo account della propria società: anche indovinando
// l'id di un utente di un'altra società, l'operazione va bloccata qui.
function sameCompany(req, target) {
  return target.company_id === req.user.companyId;
}

// POST /api/users (responsabile o dirigente)
// Crea un nuovo utente assegnandogli username e codice iniziale di primo accesso.
// Solo il dirigente può creare account con ruolo 'admin' (responsabile); il ruolo 'dirigente'
// non è creabile da API (esiste un solo account dirigente, creato via seed).
async function createUser(req, res) {
  const { username, email, phone, role, areaIds } = req.body;
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

  // Le aree operative (Bagnini, Reception, Bar, ...) esistono solo per i dipendenti: determinano
  // quali calendari vedrà. Responsabili e dirigente non ne hanno. Un dipendente può appartenere
  // a più aree, o anche a nessuna al momento della creazione (assegnabili dopo in qualsiasi momento).
  const targetAreaIds = targetRole === 'user' && Array.isArray(areaIds) ? areaIds.map(Number) : [];
  if (targetAreaIds.length > 0 && !(await assertAreasBelongToCompany(targetAreaIds, req.user.companyId))) {
    return res.status(400).json({ error: "Una o più aree operative non sono valide" });
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
    `INSERT INTO users (username, email, phone, initial_code, role, company_id, must_change_password)
     VALUES ($1, $2, $3, $4, $5, $6, TRUE)
     RETURNING *`,
    [username, email, phone, initialCode, targetRole, req.user.companyId]
  );
  const user = rows[0];

  if (targetAreaIds.length > 0) {
    await setUserAreas(user.id, targetAreaIds);
  }

  await audit.logFromReq(req, { action: 'user.create', entityType: 'user', entityId: user.id, metadata: { role: targetRole, username } });

  // Invia il link di verifica al nuovo indirizzo (best-effort: un problema di invio non deve far
  // fallire la creazione dell'account). Con provider no-op/gate/demo il comportamento è già gestito
  // dal canale email; qui assorbiamo solo eventuali errori di emissione token.
  try {
    await issueAndSendVerification({ userId: user.id, companyId: user.company_id, username, toEmail: email });
  } catch (err) {
    console.error('[users] invio verifica email alla creazione fallito (non bloccante):', err.message);
  }

  return res.status(201).json({
    user: { ...toSafeUser(user), areas: await fetchUserAreas(user.id) },
    initialCode, // comunicato una sola volta al responsabile, da consegnare al dipendente
  });
}

// GET /api/users (responsabile o dirigente) - elenco utenti della propria società
async function listUsers(req, res) {
  const { rows } = await pool.query(
    `SELECT u.*, c.is_demo AS is_demo
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
      WHERE u.company_id = $1 ORDER BY u.created_at DESC`,
    [req.user.companyId]
  );
  const areasByUser = await fetchUserAreasBatch(rows.map((r) => r.id));
  return res.json({
    users: rows.map((row) => ({ ...toSafeUser(row), areas: areasByUser[row.id] || [] })),
  });
}

// PUT /api/users/:id/areas (responsabile o dirigente) - riassegna in blocco le aree operative di
// un dipendente esistente, in qualsiasi momento (non solo alla creazione).
async function updateUserAreas(req, res) {
  const { id } = req.params;
  const { areaIds } = req.body;

  const target = await fetchUserOr404(id, res);
  if (!target) return;

  if (!sameCompany(req, target)) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }
  if (target.role !== 'user') {
    return res.status(400).json({ error: 'Solo i dipendenti possono avere aree operative assegnate' });
  }
  if (!Array.isArray(areaIds)) {
    return res.status(400).json({ error: 'areaIds deve essere un array' });
  }

  const normalizedAreaIds = areaIds.map(Number);
  if (normalizedAreaIds.length > 0 && !(await assertAreasBelongToCompany(normalizedAreaIds, req.user.companyId))) {
    return res.status(400).json({ error: 'Una o più aree operative non sono valide' });
  }

  await setUserAreas(id, normalizedAreaIds);

  await audit.logFromReq(req, { action: 'user.update_areas', entityType: 'user', entityId: id, metadata: { areaIds: normalizedAreaIds } });

  return res.json({ user: { ...toSafeUser(target), areas: await fetchUserAreas(id) } });
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

  const target = await fetchUserOr404(id, res);
  if (!target) return;

  if (!sameCompany(req, target)) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }
  if (!canManageTargetRole(req.user.role, target.role)) {
    return res.status(403).json({ error: 'Non autorizzato a gestire questo account' });
  }

  const check = validatePassword(newPassword, { username: target.username });
  if (!check.valid) {
    return res.status(400).json({ error: check.errors[0], errors: check.errors });
  }

  const passwordHash = await bcrypt.hash(newPassword, bcryptRounds);
  const { rows } = await pool.query(
    `UPDATE users SET password_hash = $1, initial_code = NULL, must_change_password = FALSE
      WHERE id = $2
      RETURNING *`,
    [passwordHash, id]
  );

  await audit.logFromReq(req, { action: 'user.reset_password', entityType: 'user', entityId: id });

  return res.json({ user: toSafeUser(rows[0]) });
}

// POST /api/users/:id/regenerate-code - invalida la password attuale e obbliga un nuovo primo accesso
async function regenerateCode(req, res) {
  const { id } = req.params;

  const target = await fetchUserOr404(id, res);
  if (!target) return;

  if (!sameCompany(req, target)) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }
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

  await audit.logFromReq(req, { action: 'user.regenerate_code', entityType: 'user', entityId: id });

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

  if (!sameCompany(req, target)) {
    return res.status(404).json({ error: 'Utente non trovato' });
  }
  if (!canManageTargetRole(req.user.role, target.role)) {
    return res.status(403).json({ error: 'Non autorizzato a gestire questo account' });
  }

  if (target.role === 'dirigente') {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS count FROM users WHERE role = 'dirigente' AND company_id = $1",
      [target.company_id]
    );
    if (rows[0].count <= 1) {
      return res.status(400).json({ error: "Non è possibile eliminare l'unico account dirigente della società" });
    }
  }

  await pool.query('DELETE FROM users WHERE id = $1', [id]);

  await audit.logFromReq(req, { action: 'user.delete', entityType: 'user', entityId: id, metadata: { role: target.role, username: target.username } });

  return res.status(204).send();
}

module.exports = { createUser, listUsers, resetPassword, regenerateCode, deleteUser, updateUserAreas };
