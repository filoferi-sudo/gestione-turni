// Modello prezzo: PER SEDE / mese, non per utente (leva anti-suite HR §1.3/§4.4).
// La cifra è in validazione: `priceFrom` è un SEGNAPOSTO ben marcato (TODO_PREZZO). Non stampare
// una cifra definitiva finché non confermata; niente prezzo nello schema JSON-LD finché è TODO.
export const pricing = {
  priceFrom: 'XX', // TODO_PREZZO: cifra da validare col committente
  unit: '€ / sede al mese',
  note: 'TODO_PREZZO_DA_VALIDARE',
  isPlaceholder: true, // se true, la UI mostra la cifra come segnaposto e nasconde il prezzo dai dati strutturati

  included: [
    'Utenti illimitati (anche stagionali)',
    'Sedi e aree operative configurabili',
    'Sostituzioni e suggerimenti dei candidati',
    'Fabbisogno e copertura del personale',
    'Statistiche delle ore lavorate',
    'Supporto diretto, in italiano',
  ],

  pilot: {
    title: 'Pilota gratuito, 1 mese',
    text: 'Parti con un mese di pilota gratuito: configuriamo insieme la tua struttura, tu decidi solo alla fine.',
  },

  // FAQ specifiche del prezzo (accordion su /prezzi)
  faq: [
    {
      q: 'Il prezzo cresce se assumo personale stagionale?',
      a: 'No. Il canone è per sede, non per dipendente: puoi avere tutti gli account che ti servono, anche stagionali che ruotano, senza sorprese in bolletta.',
    },
    {
      q: 'Serve una carta di credito per iniziare?',
      a: 'No. Si parte dal pilota gratuito: nessun pagamento richiesto per provare Planivo sulla tua struttura.',
    },
    {
      q: 'Posso disdire quando voglio?',
      a: 'Sì, nessun vincolo annuale.', // TODO: confermare i termini esatti col committente
    },
    {
      q: 'Come funziona la fatturazione?',
      a: 'Ti seguiamo direttamente per l’attivazione e la fatturazione. I dettagli operativi li vediamo insieme durante il pilota.', // TODO: dettagli fatturazione/pagamento
    },
  ],
};
