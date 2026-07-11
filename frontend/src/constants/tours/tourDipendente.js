// Tour DIPENDENTE: racconta il punto di vista di chi i turni li esegue. Ogni step descrive SOLO
// azioni che il ruolo 'user' può davvero compiere (vedere i propri turni, chiedere una
// cancellazione, accettare sostituzioni/proposte) — mai funzioni manager (approvare richieste,
// "Trova sostituzione", fabbisogno), che il backend gli nega con 403. Scenario-agnostico come gli
// altri tour: solo id [data-tour], route con {base} e nessuna azione simulata lato server.
export default {
  id: 'giornata-dipendente',
  name: 'Planivo per il dipendente',
  // Pertinente al solo ruolo dipendente: DemoBanner/TourProvider lo propongono solo a role='user'.
  roles: ['user'],
  steps: [
    {
      id: 'benvenuto',
      title: 'Benvenuto in Planivo',
      body: 'Questo è il punto di vista del dipendente: i tuoi turni, le tue richieste e le sostituzioni che puoi accettare. Vediamo il giro completo.',
      target: null,
      advanceOn: { type: 'next' },
    },
    {
      id: 'dashboard',
      title: 'La tua home',
      body: 'A colpo d\'occhio: proposte di sostituzione a cui rispondere, sostituzioni disponibili nelle tue aree, lo stato delle tue richieste e le notifiche.',
      route: '{base}',
      target: '[data-tour="nav-dashboard"]',
      placement: 'right',
      advanceOn: { type: 'next' },
    },
    {
      id: 'calendario',
      title: 'I tuoi turni',
      body: 'Apri il Calendario: qui vedi i tuoi turni, area per area. Da un tuo turno puoi chiedere la cancellazione al responsabile, con una motivazione.',
      target: '[data-tour="nav-calendario"]',
      placement: 'right',
      hint: 'Clicca "Calendario" per proseguire, oppure usa Avanti.',
      advanceOn: { type: 'click', target: '[data-tour="nav-calendario"]' },
    },
    {
      id: 'richieste',
      title: 'Le tue richieste',
      body: 'Nella sezione Turni segui l\'esito delle richieste di cancellazione che hai inviato: in attesa, approvata o rifiutata. Decide sempre il responsabile.',
      route: '{base}/turni',
      target: '[data-tour="nav-turni"]',
      placement: 'right',
      advanceOn: { type: 'next' },
    },
    {
      id: 'sostituzioni',
      title: 'Sostituzioni disponibili',
      body: 'Quando un turno resta scoperto compare qui, per tutti i colleghi dell\'area: se ti interessa lo accetti con un clic e diventa tuo.',
      route: '{base}/sostituzioni',
      target: '[data-tour="substitutions-panel"]',
      placement: 'top',
      advanceOn: { type: 'next' },
    },
    {
      id: 'proposte',
      title: 'Proposte su misura per te',
      body: 'Il responsabile può anche proporti direttamente un turno scoperto: la proposta arriva qui e tra le notifiche, e rispondi con Accetta o Rifiuta. Nessuna telefonata.',
      route: '{base}/sostituzioni',
      target: '[data-tour="notifications-bell"]',
      placement: 'bottom',
      advanceOn: { type: 'next' },
    },
    {
      id: 'fine',
      title: 'Tutto qui!',
      body: 'Ora esplora liberamente: è un ambiente demo, nessun dato reale. Puoi reinizializzarlo in qualsiasi momento dal banner in alto.',
      target: null,
      advanceOn: { type: 'next' },
    },
  ],
};
