// Dati reali del sito, confermati dal committente. Usati ovunque (footer, /contatti, barra
// sticky, LeadForm, JSON-LD). Unica fonte di verità per i contatti: non hardcodare altrove.
//
// P.IVA e ragione sociale sono `null` di proposito: NON ancora disponibili. Dove servirebbero
// (footer, pagine legali) il componente li OMETTE finché sono null — non inventare valori.
export const site = {
  name: 'Planivo',
  tagline: 'Software gestione turni e sostituzioni per il personale',
  domain: 'planivo.it',
  url: 'https://planivo.it',

  // Telefono / WhatsApp (stesso numero)
  phone: '3667289566',
  phoneDisplay: '366 728 9566', // formato leggibile per la UI
  phoneIntl: '+393667289566', // per tel:
  whatsapp: '393667289566', // per wa.me/
  whatsappText: 'Ciao, vorrei informazioni su Planivo', // messaggio precompilato

  // Email
  email: 'info.gestioneturni@gmail.com',

  // Localizzazione (niente indirizzo civico finché non fornito)
  region: 'Lombardia',
  country: 'IT',

  // TODO_PIVA: non ancora disponibili → i componenti NON devono stampare nulla finché sono null.
  vat: null,
  legalName: null,

  // Social (TODO: aggiungere i profili reali quando esistono → alimentano sameAs in JSON-LD)
  social: {
    // facebook: 'https://www.facebook.com/...',
    // instagram: 'https://www.instagram.com/...',
  },

  // Promessa di funnel ripetuta vicino alle CTA (abbassa il rischio percepito)
  reassurance: 'Nessun impegno · ti richiamiamo entro 24h · pilota gratuito',
};

// Helper derivati (evitano di ricomporre le stringhe nei template)
export const telHref = `tel:${site.phoneIntl}`;
export const mailHref = `mailto:${site.email}`;
export const whatsappHref = `https://wa.me/${site.whatsapp}?text=${encodeURIComponent(site.whatsappText)}`;
