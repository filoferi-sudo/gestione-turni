// CLI locale del Demo Framework: carica o resetta uno scenario da terminale (per lo sviluppo e
// l'ispezione manuale). In produzione il caricamento avviene comunque in modo lazy al demo-login;
// questo strumento è solo una comodità da riga di comando.
//   node src/demo/cli.js load ristorante [--force]
//   node src/demo/cli.js reset ristorante
require('dotenv').config();
const pool = require('../config/db');
const { loadScenario, getDemoState } = require('./framework/loader');
const { resetScenarioCompany } = require('./framework/reset');
const { getScenario } = require('./framework/registry');

async function main() {
  const [command, scenarioId, ...flags] = process.argv.slice(2);
  if (!command || !scenarioId) {
    console.error('Uso: node src/demo/cli.js <load|reset> <scenarioId> [--force]');
    process.exit(1);
  }
  // Verifica subito che lo scenario esista (errore chiaro invece di un fallimento più avanti).
  getScenario(scenarioId);

  if (command === 'load') {
    const force = flags.includes('--force');
    const started = Date.now();
    const { state, reloaded } = await loadScenario(scenarioId, { force });
    const ms = Date.now() - started;
    console.log(reloaded
      ? `Scenario "${scenarioId}" caricato (società demo #${state.company_id}, ancora ${formatDate(state.anchor_date)}) in ${ms}ms.`
      : `Scenario "${scenarioId}" già aggiornato (società demo #${state.company_id}); nessun ricaricamento. --force per forzare.`);
  } else if (command === 'reset') {
    const state = await getDemoState(scenarioId);
    if (!state) {
      console.log(`Nessun ambiente demo per lo scenario "${scenarioId}": niente da resettare.`);
    } else {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await resetScenarioCompany(client, state.company_id);
        await client.query('COMMIT');
        console.log(`Ambiente demo "${scenarioId}" (società #${state.company_id}) rimosso.`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }
  } else {
    console.error(`Comando sconosciuto: ${command} (usa load | reset)`);
    process.exit(1);
  }
  await pool.end();
}

function formatDate(value) {
  // TZ-safe: toISOString convertirebbe in UTC facendo slittare il giorno nei fusi UTC+.
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

main().catch((err) => {
  console.error('[demo:cli]', err.message);
  process.exit(1);
});
