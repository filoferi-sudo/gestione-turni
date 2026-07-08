// Ripulisce tutti i dati applicativi lasciando solo l'account dirigente (e l'eventuale super
// admin). SOLO per uso locale/dev: in un mondo multi-azienda non ha senso rilanciarlo contro un
// database di produzione già popolato da più società reali, cancellerebbe i loro dati.
// Uso: npm run db:reset

require('dotenv').config();
const pool = require('../config/db');
const { assertDestructiveAllowed } = require('../utils/envGuard');

// Protezione hard: non deve mai girare per errore contro il DB di produzione (vedi commento sopra).
assertDestructiveAllowed('db:reset');

const DIRIGENTE_USERNAME = process.env.DIRIGENTE_USERNAME || 'dirigente2353';

async function reset() {
  await pool.query('DELETE FROM cancellation_requests');
  await pool.query('DELETE FROM shifts');
  await pool.query('DELETE FROM courses');
  const { rowCount } = await pool.query(
    "DELETE FROM users WHERE username != $1 AND role != 'superadmin'",
    [DIRIGENTE_USERNAME]
  );

  console.log(`Reset completato: rimossi ${rowCount} account, tutti i turni, corsi e le richieste di cancellazione.`);
  console.log(`Account superstiti: "${DIRIGENTE_USERNAME}" e l'eventuale super admin (se già presenti).`);
  await pool.end();
}

reset().catch((err) => {
  console.error('Errore durante il reset:', err);
  process.exit(1);
});
