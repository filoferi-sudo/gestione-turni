// Mini-tour di benvenuto: scenario-AGNOSTICO (referenzia solo id [data-tour], route con {base} e
// criteri di avanzamento — nessun dato di dominio). Serve anche a validare l'engine (Fase D4).
// Il tour commerciale completo è in tourCommerciale.js (Fase D5).
export default {
  id: 'benvenuto',
  name: 'Benvenuto in Planivo',
  steps: [
    {
      id: 'welcome',
      title: 'Benvenuto in Planivo',
      body: 'Ti mostriamo in pochi passi come funziona il gestionale. Puoi uscire quando vuoi.',
      target: null, // step centrato
      advanceOn: { type: 'next' },
    },
    {
      id: 'dashboard',
      title: 'La dashboard',
      body: 'La panoramica riassume sostituzioni aperte, richieste in attesa e copertura di oggi.',
      route: '{base}',
      target: '[data-tour="nav-dashboard"]',
      placement: 'right',
      advanceOn: { type: 'next' },
    },
    {
      id: 'vai-calendario',
      title: 'Il calendario',
      body: 'Apri il Calendario: qui vivono i turni, organizzati per area operativa.',
      target: '[data-tour="nav-calendario"]',
      placement: 'right',
      advanceOn: { type: 'click', target: '[data-tour="nav-calendario"]' },
    },
    {
      id: 'sostituzioni',
      title: 'Le sostituzioni',
      body: 'Nella sezione Sostituzioni gestisci i turni scoperti e trovi i migliori candidati.',
      target: '[data-tour="nav-sostituzioni"]',
      placement: 'right',
      advanceOn: { type: 'next' },
    },
    {
      id: 'fine',
      title: 'Tutto qui!',
      body: 'Ora esplora liberamente l\'ambiente demo. Puoi reinizializzarlo in qualsiasi momento dal banner.',
      target: null,
      advanceOn: { type: 'next' },
    },
  ],
};
