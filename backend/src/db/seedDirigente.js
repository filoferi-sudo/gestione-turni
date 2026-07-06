// Crea (o aggiorna) l'account dirigente con le credenziali richieste.
// Uso: npm run seed:dirigente

require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('../config/db');

const USERNAME = process.env.DIRIGENTE_USERNAME || 'dirigente2353';
const PASSWORD = process.env.DIRIGENTE_PASSWORD || 'Filippo124';
const EMAIL = process.env.DIRIGENTE_EMAIL || 'dirigente@example.com';

async function seed() {
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  await pool.query(
    `INSERT INTO users (username, email, password_hash, role, must_change_password)
     VALUES ($1, $2, $3, 'dirigente', FALSE)
     ON CONFLICT (username) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           role = 'dirigente',
           must_change_password = FALSE`,
    [USERNAME, EMAIL, passwordHash]
  );

  console.log(`Dirigente pronto -> username: "${USERNAME}"`);
  await pool.end();
}

seed().catch((err) => {
  console.error('Errore durante il seed del dirigente:', err);
  process.exit(1);
});
