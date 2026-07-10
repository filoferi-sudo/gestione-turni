// Reset di un ambiente demo: cancella la SOLA società demo indicata e tutto ciò che le appartiene.
// La cancellazione della riga companies propaga in cascata (ON DELETE CASCADE) a users -> contratti/
// disponibilità/opt-out/proposte, shifts -> eccezioni, courses, sedi -> aree, notifications,
// staffing_requirements. Le UNICHE eccezioni sono audit_logs e demo_state... demo_state è CASCADE,
// mentre audit_logs ha company_id ON DELETE SET NULL (lo storico reale deve sopravvivere alla
// rimozione di una società): per la demo invece i log vanno rimossi esplicitamente, altrimenti
// resterebbero righe orfane fittizie nel registro.
const { assertDemoCompany } = require('./guard');

// Va chiamata con un client di transazione (client di pool.connect() dentro BEGIN/COMMIT):
// il wipe e l'eventuale ricaricamento successivo devono essere atomici.
async function resetScenarioCompany(client, companyId) {
  // Chokepoint anti-dati-reali: PRIMA istruzione di ogni percorso di scrittura del framework.
  await assertDemoCompany(companyId, client);

  await client.query('DELETE FROM audit_logs WHERE company_id = $1', [companyId]);
  // demo_state cadrebbe comunque in cascata con la company: il DELETE esplicito rende l'ordine
  // indipendente dai vincoli e chiaro alla lettura.
  await client.query('DELETE FROM demo_state WHERE company_id = $1', [companyId]);

  // Predicato ridondante AND is_demo = TRUE: anche se un bug a monte passasse l'id di una società
  // reale (già bloccato da assertDemoCompany), questo DELETE non la toccherebbe comunque.
  const result = await client.query('DELETE FROM companies WHERE id = $1 AND is_demo = TRUE', [companyId]);
  if (result.rowCount === 0) {
    throw new Error(`[demo] Reset fallito: nessuna società demo con id ${companyId}`);
  }
}

module.exports = { resetScenarioCompany };
