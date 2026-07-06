// Ripulisce tutti i dati applicativi lasciando solo l'account dirigente.
// Utile per portare l'ambiente a uno stato "prima installazione" (locale o su un DB di produzione appena creato).
// Uso: npm run db:reset

require('dotenv').config();
const pool = require('../config/db');

const DIRIGENTE_USERNAME = process.env.DIRIGENTE_USERNAME || 'dirigente2353';

async function reset() {
  await pool.query('DELETE FROM cancellation_requests');
  await pool.query('DELETE FROM shifts');
  const { rowCount } = await pool.query('DELETE FROM users WHERE username != $1', [DIRIGENTE_USERNAME]);

  console.log(`Reset completato: rimossi ${rowCount} account, tutti i turni e le richieste di cancellazione.`);
  console.log(`Account superstite: "${DIRIGENTE_USERNAME}" (se già presente).`);
  await pool.end();
}

reset().catch((err) => {
  console.error('Errore durante il reset:', err);
  process.exit(1);
});
