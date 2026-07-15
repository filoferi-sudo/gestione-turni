// Modello prezzo: nessuna cifra pubblica. Ogni struttura è diversa (numero di sedi, esigenze),
// quindi il prezzo si dà a PREVENTIVO gratuito su misura. Resta il principio-valore: per sede,
// non per dipendente (prevedibile anche con gli stagionali). Niente prezzo nei dati strutturati.
export const pricing = {
  model: 'Un prezzo per sede, non per dipendente',

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

  // FAQ del prezzo (accordion su /prezzi)
  faq: [
    {
      q: 'Quanto costa?',
      a: 'Il prezzo è su misura sulla tua struttura (quante sedi, come lavori): per questo facciamo un preventivo gratuito e senza impegno. Il modello è per sede, non per dipendente.',
    },
    {
      q: 'Il prezzo cresce se assumo personale stagionale?',
      a: 'No. Il canone è per sede, non per dipendente: puoi avere tutti gli account che ti servono, anche stagionali che ruotano, senza sorprese.',
    },
    {
      q: 'Serve una carta di credito per iniziare?',
      a: 'No. Si parte dal pilota gratuito: nessun pagamento richiesto per provare Planivo sulla tua struttura.',
    },
    {
      q: 'Posso disdire quando voglio?',
      a: 'Sì, nessun vincolo annuale.',
    },
  ],
};
