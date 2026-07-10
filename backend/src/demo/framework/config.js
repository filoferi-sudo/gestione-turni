// Configurazione del Demo Framework, letta SOLO da variabili d'ambiente (stesso principio di
// config/security.js: nessun valore hardcoded, i comportamenti si cambiano senza toccare il codice).
// Le funzioni leggono process.env al momento della chiamata (non al require) così i test possono
// attivare/disattivare la modalità demo senza riavviare il processo.

// Interruttore generale della modalità demo. Default: SPENTA. Con DEMO_MODE diverso da 'true'
// tutte le rotte /api/demo/* (tranne /status, che risponde { enabled: false }) restituiscono 404,
// il bottone "Prova la demo" non compare nel frontend e nessuno scenario può essere caricato.
function isDemoEnabled() {
  return process.env.DEMO_MODE === 'true';
}

// Giorni di vita di un ambiente demo prima che il framework lo ri-generi (lazy, al demo-login)
// con ancora = oggi: mantiene la demo "viva" (turni futuri, stati pendenti) senza cron.
function reseedAfterDays() {
  const parsed = Number.parseInt(process.env.DEMO_RESEED_AFTER_DAYS, 10);
  if (!Number.isInteger(parsed) || parsed < 1) return 7;
  return parsed;
}

// SOLO sviluppo locale: se impostata, gli utenti demo ricevono questa password, così si può
// ispezionare l'ambiente col login normale. In produzione va lasciata vuota: gli utenti demo
// ricevono una password casuale mai comunicata (l'ingresso è solo via POST /api/demo/login).
function personaPassword() {
  return process.env.DEMO_PERSONA_PASSWORD || null;
}

module.exports = { isDemoEnabled, reseedAfterDays, personaPassword };
