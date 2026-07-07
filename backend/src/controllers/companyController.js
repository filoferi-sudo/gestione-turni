const pool = require('../config/db');
const { generateInitialCode } = require('../utils/generateCode');

// Il super admin non gestisce mai i dati operativi (turni/corsi/dipendenti) di una specifica
// società: solo anagrafica società, il loro primo dirigente, e statistiche aggregate. Ogni
// funzione qui sotto è quindi a livello di piattaforma, mai scoped a una singola company_id
// dell'utente che chiama (il super admin non ne ha una, vedi users.company_id NULL).

function toSafeCompany(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    isActive: row.is_active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    dirigentiCount: row.dirigenti_count !== undefined ? Number(row.dirigenti_count) : undefined,
    usersCount: row.users_count !== undefined ? Number(row.users_count) : undefined,
  };
}

// GET /api/companies (super admin) - tutte le società con conteggi di base
async function listCompanies(req, res) {
  const { rows } = await pool.query(
    `SELECT c.*,
            COUNT(u.id) FILTER (WHERE u.role = 'dirigente') AS dirigenti_count,
            COUNT(u.id) AS users_count
       FROM companies c
       LEFT JOIN users u ON u.company_id = c.id
      GROUP BY c.id
      ORDER BY c.created_at DESC`
  );
  return res.json({ companies: rows.map(toSafeCompany) });
}

// POST /api/companies (super admin) - crea una nuova società (senza dirigente: si aggiunge
// separatamente con POST /api/companies/:id/dirigente). Crea anche una sede di default vuota
// ("Sede Principale", nessuna area operativa): il Dirigente deve avere sempre almeno una sede
// per poter iniziare a configurare le proprie aree, ma non riceve alcuna area predefinita (a
// differenza delle società preesistenti migrate da 'bagnino'/'istruttore', qui non c'è nulla da
// preservare: la struttura la decide da zero il Dirigente).
async function createCompany(req, res) {
  const { name, email, phone, address } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Il nome della società è obbligatorio' });
  }

  const { rows } = await pool.query(
    `INSERT INTO companies (name, email, phone, address, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [name.trim(), email || null, phone || null, address || null, req.user.id]
  );

  await pool.query(`INSERT INTO sedi (company_id, name) VALUES ($1, 'Sede Principale')`, [rows[0].id]);

  return res.status(201).json({ company: toSafeCompany(rows[0]) });
}

// PUT /api/companies/:id (super admin) - modifica dati o attiva/disattiva
async function updateCompany(req, res) {
  const { id } = req.params;
  const { name, email, phone, address, isActive } = req.body;

  const { rows: existingRows } = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
  const existing = existingRows[0];
  if (!existing) {
    return res.status(404).json({ error: 'Società non trovata' });
  }

  const finalName = name !== undefined ? name : existing.name;
  if (!finalName || !finalName.trim()) {
    return res.status(400).json({ error: 'Il nome della società è obbligatorio' });
  }

  const { rows } = await pool.query(
    `UPDATE companies
        SET name = $1, email = $2, phone = $3, address = $4, is_active = $5
      WHERE id = $6
      RETURNING *`,
    [
      finalName.trim(),
      email !== undefined ? email || null : existing.email,
      phone !== undefined ? phone || null : existing.phone,
      address !== undefined ? address || null : existing.address,
      isActive !== undefined ? Boolean(isActive) : existing.is_active,
      id,
    ]
  );

  return res.json({ company: toSafeCompany(rows[0]) });
}

// POST /api/companies/:id/dirigente (super admin) - crea il primo dirigente di una società
// (o un dirigente aggiuntivo/sostitutivo in seguito: l'endpoint resta utilizzabile più volte).
async function createCompanyDirigente(req, res) {
  const { id } = req.params;
  const { username, email, phone } = req.body;

  if (!username || !email || !phone) {
    return res.status(400).json({ error: 'Username, email e telefono sono obbligatori' });
  }

  const { rows: companyRows } = await pool.query('SELECT * FROM companies WHERE id = $1', [id]);
  const company = companyRows[0];
  if (!company) {
    return res.status(404).json({ error: 'Società non trovata' });
  }

  const existing = await pool.query('SELECT id FROM users WHERE username = $1 OR email = $2', [username, email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ error: 'Username o email già in uso' });
  }

  const initialCode = generateInitialCode();

  const { rows } = await pool.query(
    `INSERT INTO users (username, email, phone, initial_code, role, company_id, must_change_password)
     VALUES ($1, $2, $3, $4, 'dirigente', $5, TRUE)
     RETURNING *`,
    [username, email, phone, initialCode, id]
  );

  return res.status(201).json({
    user: {
      id: rows[0].id,
      username: rows[0].username,
      email: rows[0].email,
      phone: rows[0].phone,
      role: rows[0].role,
      companyId: rows[0].company_id,
    },
    initialCode,
  });
}

// GET /api/companies/stats (super admin) - statistiche generali della piattaforma
async function getPlatformStats(req, res) {
  const { rows: companyRows } = await pool.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM companies`
  );
  const { rows: userRows } = await pool.query(
    `SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`
  );

  const usersByRole = { dirigente: 0, admin: 0, user: 0, superadmin: 0 };
  for (const row of userRows) {
    usersByRole[row.role] = row.count;
  }

  return res.json({
    companiesTotal: companyRows[0].total,
    companiesActive: companyRows[0].active,
    usersByRole,
    usersTotal: Object.values(usersByRole).reduce((sum, n) => sum + n, 0),
  });
}

module.exports = { listCompanies, createCompany, updateCompany, createCompanyDirigente, getPlatformStats };
