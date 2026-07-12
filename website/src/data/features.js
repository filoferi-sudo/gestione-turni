// Le 6 funzionalità chiave, fedeli al prodotto reale (§4.1 punto 4 e §4.2).
// `short` alimenta le card della home; `long` + `capabilities` la pagina /funzionalita.
// IMPORTANTE (tabella di verità §4.0): il motore SUGGERISCE e propone, non assegna mai da solo;
// notifiche IN PIATTAFORMA (non push/SMS/WhatsApp); web app (nessuna app da installare).
//
// `icon` è la chiave di un set SVG disegnato in casa (components/Icon.astro).

export const features = [
  {
    id: 'calendario',
    icon: 'calendar',
    title: 'Calendario turni per sede e area',
    short:
      'Turni fissi ricorrenti e singoli su un unico calendario, con gli orari personalizzati per ogni sede.',
    long:
      "Un calendario per ogni area operativa della tua struttura. Pianifichi turni fissi che si ripetono ogni settimana e turni singoli per le eccezioni, con l'intervallo orario del calendario adattato a come lavora davvero la tua sede.",
    capabilities: [
      'Turni fissi ricorrenti e turni singoli nello stesso calendario',
      'Orari del calendario personalizzabili per ogni sede (es. 05:00 → mezzanotte)',
      'Più aree operative sotto la stessa sede, ognuna col proprio calendario',
      'Lo staff consulta i propri turni dal telefono, senza installare nulla',
    ],
    screenshot: 'calendario-responsabile.png',
    screenshotAlt: 'Calendario turni settimanale di un responsabile in Planivo',
  },
  {
    id: 'sostituzioni',
    icon: 'swap',
    title: 'Sostituzioni senza caos',
    short:
      'Il turno scoperto lo vede solo il personale idoneo dell’area: il primo disponibile lo copre, o lo proponi tu ai candidati migliori.',
    long:
      'Quando un turno resta scoperto, lo pubblichi come sostituzione: la vede solo chi è assegnato a quell’area ed è davvero disponibile. Il primo che la prende la copre. In alternativa la proponi in modo mirato ai candidati più adatti, con una classifica costruita su disponibilità, vincoli contrattuali e storico. Il software suggerisce — la decisione resta tua.',
    capabilities: [
      'Turni scoperti visibili solo al personale idoneo dell’area',
      'Il primo disponibile copre la sostituzione con un tap',
      'Proposta mirata ai candidati migliori (classifica di compatibilità)',
      'Il candidato accetta o rifiuta: nessuna assegnazione forzata',
      'Se resta scoperta oltre le ore configurate, avvisa i responsabili in piattaforma',
    ],
    screenshot: 'sostituzione-candidati.png',
    screenshotAlt: 'Elenco dei candidati idonei per una sostituzione in Planivo',
  },
  {
    id: 'fabbisogno',
    icon: 'coverage',
    title: 'Fabbisogno e copertura',
    short:
      'Dichiari quante persone servono per fascia oraria: il calendario mostra in tempo reale coperto e mancante.',
    long:
      'Per ogni area dichiari di quante persone hai bisogno in ciascuna fascia oraria. Planivo confronta il fabbisogno con i turni già assegnati e ti mostra a colpo d’occhio dove sei coperto e dove manca qualcuno — così i buchi li vedi prima, non la sera stessa. I posti mancanti li trasformi in sostituzioni con un click.',
    capabilities: [
      'Fabbisogno di personale per fascia oraria e per area',
      'Confronto automatico coperto / mancante direttamente sul calendario',
      'Genera le sostituzioni per i posti scoperti con un click',
      'Regole ricorrenti settimanali o fabbisogni per una singola data',
    ],
    screenshot: 'fabbisogno-copertura.png',
    screenshotAlt: 'Indicatori di copertura del fabbisogno per fascia oraria in Planivo',
  },
  {
    id: 'disponibilita',
    icon: 'clock',
    title: 'Disponibilità e vincoli dello staff',
    short:
      'Ogni dipendente dichiara le proprie disponibilità; i limiti contrattuali informano i suggerimenti.',
    long:
      'Ogni membro dello staff indica quando è disponibile. I vincoli contrattuali — ore massime, riposi — sono a disposizione del sistema per ordinare meglio i candidati a una sostituzione. Sono informazioni che ti aiutano a scegliere, mai regole che decidono al posto tuo.',
    capabilities: [
      'Disponibilità settimanali dichiarate dal dipendente',
      'Vincoli contrattuali (ore, riposi) come criterio dei suggerimenti',
      'Opt-out “non partecipare” per periodi di indisponibilità',
      'Il responsabile legge tutto in sola lettura, senza doverlo raccogliere a voce',
    ],
    screenshot: 'disponibilita-staff.png',
    screenshotAlt: 'Disponibilità settimanali di un dipendente in Planivo',
  },
  {
    id: 'richieste',
    icon: 'check-shield',
    title: 'Richieste e approvazioni tracciate',
    short:
      'Le cancellazioni passano sempre da una tua approvazione; storico e statistiche ore sempre a portata.',
    long:
      'Quando un dipendente chiede di cancellare un turno, la richiesta arriva a te: approvi o rifiuti con un tap, e la sostituzione parte da sola. Ogni passaggio è tracciato, con lo storico delle richieste e le statistiche delle ore lavorate sempre consultabili.',
    capabilities: [
      'Ogni cancellazione richiede la tua approvazione (niente cambi “di nascosto”)',
      'All’approvazione, il turno scoperto diventa subito una sostituzione',
      'Storico completo di richieste e approvazioni',
      'Statistiche delle ore lavorate e pianificate per dipendente',
    ],
    screenshot: 'richieste-approvazioni.png',
    screenshotAlt: 'Richieste di cancellazione turno in attesa di approvazione in Planivo',
  },
  {
    id: 'multi-sede',
    icon: 'layers',
    title: 'Multi-sede, ruoli e permessi',
    short:
      'Dirigente, responsabili e dipendenti vedono solo ciò che serve; più sedi sotto un’unica regia.',
    long:
      'Gestisci più sedi da un unico posto. Ogni ruolo — Dirigente, Responsabili, Dipendenti — vede esattamente ciò che gli serve e nient’altro. I dati di ogni struttura restano isolati, e i permessi li regoli tu, anche per singolo responsabile.',
    capabilities: [
      'Più sedi e più aree operative sotto la stessa azienda',
      'Ruoli distinti: Dirigente, Responsabile, Dipendente',
      'Ogni persona vede solo le aree di sua competenza',
      'Permessi regolabili anche per singolo responsabile',
    ],
    screenshot: 'multi-sede-ruoli.png',
    screenshotAlt: 'Gestione di più sedi e ruoli in Planivo',
  },
];

// Come funziona in 3 step (home §4.1 punto 3)
export const steps = [
  {
    n: 1,
    title: 'Configura e invita lo staff',
    text: 'Crei sedi e aree e inviti il personale con un codice di accesso. Nessuna formazione: se sanno usare WhatsApp, sanno usare Planivo.',
  },
  {
    n: 2,
    title: 'Pianifica turni e fabbisogno',
    text: 'Costruisci il calendario e dichiari quante persone servono per fascia. Vedi subito dove sei coperto e dove no.',
  },
  {
    n: 3,
    title: 'Copri le sostituzioni',
    text: 'Quando serve un cambio, pubblichi la sostituzione: il personale idoneo la vede e la copre. Tu resti in controllo.',
  },
];
