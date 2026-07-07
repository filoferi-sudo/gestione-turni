// Crea (o aggiorna) l'account super admin. company_id resta sempre NULL: il super admin non
// appartiene a nessuna società, le amministra tutte tramite /api/companies.
// Uso: npm run seed:superadmin

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const USERNAME = process.env.SUPERADMIN_USERNAME || 'superadmin';
const PASSWORD = process.env.SUPERADMIN_PASSWORD || 'CambiaMi1234';
const EMAIL = process.env.SUPERADMIN_EMAIL || 'superadmin@example.com';

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await pool.query(
    `INSERT INTO users (username, email, password_hash, role, company_id, must_change_password)
     VALUES ($1, $2, $3, 'superadmin', NULL, FALSE)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'superadmin',
           company_id = NULL,
           must_change_password = FALSE`,
    [USERNAME, EMAIL, passwordHash]
  );

  console.log(`Super admin pronto -> username: "${USERNAME}"`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Errore durante il seed del super admin:', err);
  process.exit(1);
});
