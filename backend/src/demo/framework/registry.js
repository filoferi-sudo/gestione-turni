// Registro degli scenari demo disponibili. AGGIUNGERE UNO SCENARIO = una cartella in
// backend/src/demo/scenarios/<id>/ che rispetta il contratto (vedi loader.js) + UNA riga qui.
// Il framework non contiene alcuna logica di settore: tutto ciò che è specifico (ristorante,
// hotel, RSA, ...) vive esclusivamente nel modulo dello scenario.
const scenarios = {
  ristorante: require('../scenarios/ristorante'),
};

function getScenario(scenarioId) {
  const scenario = scenarios[scenarioId];
  if (!scenario) {
    const err = new Error(`Scenario demo non registrato: ${scenarioId}`);
    err.code = 'UNKNOWN_SCENARIO';
    throw err;
  }
  return scenario;
}

function listScenarios() {
  return Object.values(scenarios);
}

module.exports = { getScenario, listScenarios };
