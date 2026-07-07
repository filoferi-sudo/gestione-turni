// Crea (o aggiorna) l'account dirigente con le credenziali richieste, collegandolo a una società
// di bootstrap (creata se non esiste già). Utile solo per l'ambiente locale/dev: in produzione le
// società e i loro dirigenti si creano dal pannello Super Admin (POST /api/companies e
// POST /api/companies/:id/dirigente).
// Uso: npm run seed:dirigente

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const USERNAME = process.env.DIRIGENTE_USERNAME || 'dirigente2353';
const PASSWORD = process.env.DIRIGENTE_PASSWORD || 'Filippo124';
const EMAIL = process.env.DIRIGENTE_EMAIL || 'dirigente@example.com';
const COMPANY_NAME = process.env.DIRIGENTE_COMPANY_NAME || 'Società Demo';

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const { rows: existingCompanyRows } = await pool.query('SELECT id FROM companies WHERE name = $1', [COMPANY_NAME]);
  let companyId = existingCompanyRows[0]?.id;
  if (!companyId) {
    const { rows } = await pool.query('INSERT INTO companies (name) VALUES ($1) RETURNING id', [COMPANY_NAME]);
    companyId = rows[0].id;
  }

  // Se l'utente esiste già non tocchiamo company_id: rilanciare questo script non deve spostare
  // un dirigente già assegnato a un'altra società da un run precedente o dal pannello Super Admin.
  await pool.query(
    `INSERT INTO users (username, email, password_hash, role, company_id, must_change_password)
     VALUES ($1, $2, $3, 'dirigente', $4, FALSE)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'dirigente',
           must_change_password = FALSE`,
    [USERNAME, EMAIL, passwordHash, companyId]
  );

  console.log(`Dirigente pronto -> username: "${USERNAME}" (società: "${COMPANY_NAME}")`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Errore durante il seed del dirigente:', err);
  process.exit(1);
});
