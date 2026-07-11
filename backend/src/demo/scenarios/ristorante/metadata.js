// Scenario RISTORANTE — metadati di presentazione (usati da GET /api/demo/status e dal frontend).
// Nessuna colonna DB per il logo: è un placeholder puramente visivo (iniziali + colore), coerente
// con la decisione presa (il logo è un metadato dello scenario, non un dato del gestionale).
module.exports = {
  id: 'ristorante',
  name: 'Ristorante "Da Mario"',
  // Bump della versione ⇒ ri-caricamento lazy dell'ambiente al prossimo demo-login.
  version: 1,
  logoPlaceholder: { initials: 'DM', color: '#b23b3b' },
  // Personas selezionabili dall'ingresso demo. userRef punta a una persona dello scenario.
  personas: [
    { key: 'dirigente', role: 'dirigente', userRef: 'dirigente', label: 'Dirigente',
      description: 'Il titolare: vede tutto, configura sedi/aree e regole.' },
    { key: 'responsabile', role: 'admin', userRef: 'resp_sala', label: 'Responsabile di sala',
      description: 'Gestisce turni, sostituzioni e personale della sala.' },
    { key: 'dipendente', role: 'user', userRef: 'cam_marco', label: 'Cameriere',
      description: 'Vede i propri turni, le proposte e le sostituzioni disponibili.' },
  ],
  // Tour guidati supportati da questo scenario (le definizioni vivono nel frontend, Fase D5).
  // 'commerciale' per Dirigente/Responsabile; 'giornata-dipendente' per la persona Cameriere
  // (il tour manager racconta azioni — approvare, proporre — che il ruolo user non può compiere).
  tours: ['commerciale', 'giornata-dipendente'],
};
