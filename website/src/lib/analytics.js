// Tracking & consenso — un unico punto d'integrazione (GTM + dataLayer + consenso).
// I tag specifici (GA4, Meta Pixel, Google Ads) si configurano poi DENTRO GTM, senza toccare qui.
//
// Due parti:
//  1) SEMPRE attive (funzionali, nessun cookie di terze parti): cattura attribuzione UTM in
//     sessionStorage (serve al LeadForm) + push di eventi su dataLayer (array innocuo se GTM assente).
//  2) SOLO se PUBLIC_GTM_ID è impostata (build-time): banner cookie + Consent Mode update. Con la
//     env vuota, questo blocco è codice morto e NON viene incluso nel bundle (niente libreria CC).

const GTM_ID = import.meta.env.PUBLIC_GTM_ID;

function dl(obj) {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(obj);
}

// --- 1a. Attribuzione: al primo pageview salva utm_* + landing_path + referrer in sessionStorage ---
function captureAttribution() {
  try {
    const KEY = 'planivo_attribution';
    if (sessionStorage.getItem(KEY)) return; // solo il PRIMO pageview della sessione
    const params = new URLSearchParams(location.search);
    const attr = { landing_path: location.pathname + location.search, referrer: document.referrer || '' };
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach((k) => {
      const v = params.get(k);
      if (v) attr[k] = v.slice(0, 200);
    });
    sessionStorage.setItem(KEY, JSON.stringify(attr));
  } catch (_) {}
}

// --- 1b. Eventi dataLayer (delegation su data-track) ---
function setupEvents() {
  // Conversione principale: pageview di /grazie
  if (location.pathname === '/grazie' || location.pathname === '/grazie/') {
    dl({ event: 'generate_lead' });
  }

  // Primo focus su un campo del LeadForm
  const leadForm = document.querySelector('[data-lead-form]');
  if (leadForm) {
    let started = false;
    leadForm.addEventListener(
      'focusin',
      () => {
        if (started) return;
        started = true;
        dl({ event: 'lead_form_start' });
      },
      { once: false }
    );
  }

  // Click su CTA e contatti (delegation)
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-track]');
    if (!el) return;
    const map = {
      'cta-demo': 'cta_demo_click',
      'click-tel': 'click_tel',
      'click-whatsapp': 'click_whatsapp',
      'click-email': 'click_email',
    };
    const event = map[el.getAttribute('data-track')];
    if (event) dl({ event });
  });
}

captureAttribution();
setupEvents();

// --- 2. Consenso + GTM (solo con PUBLIC_GTM_ID). Codice morto e tree-shaken se la env è vuota. ---
if (GTM_ID) {
  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(arguments);
  }

  // Carica libreria banner + CSS in modo lazy (chunk separato, solo quando GTM è configurato).
  Promise.all([
    import('vanilla-cookieconsent'),
    import('vanilla-cookieconsent/dist/cookieconsent.css'),
  ]).then(([CC]) => {
    const applyConsent = () => {
      const analytics = CC.acceptedCategory('analytics');
      const marketing = CC.acceptedCategory('marketing');
      gtag('consent', 'update', {
        analytics_storage: analytics ? 'granted' : 'denied',
        ad_storage: marketing ? 'granted' : 'denied',
        ad_user_data: marketing ? 'granted' : 'denied',
        ad_personalization: marketing ? 'granted' : 'denied',
      });
    };

    CC.run({
      guiOptions: {
        consentModal: { layout: 'box', position: 'bottom left' },
        preferencesModal: { layout: 'box' },
      },
      onFirstConsent: applyConsent,
      onConsent: applyConsent,
      onChange: applyConsent,
      categories: {
        necessary: { enabled: true, readOnly: true },
        analytics: {},
        marketing: {},
      },
      language: {
        default: 'it',
        translations: {
          it: {
            consentModal: {
              title: 'Rispettiamo la tua privacy',
              description:
                'Usiamo cookie tecnici necessari e, solo con il tuo consenso, cookie di analisi e marketing per migliorare il sito e misurare le campagne. Puoi accettare, rifiutare o scegliere.',
              acceptAllBtn: 'Accetta tutti',
              acceptNecessaryBtn: 'Rifiuta',
              showPreferencesBtn: 'Personalizza',
              footer: '<a href="/privacy">Privacy Policy</a> · <a href="/cookie-policy">Cookie Policy</a>',
            },
            preferencesModal: {
              title: 'Preferenze cookie',
              acceptAllBtn: 'Accetta tutti',
              acceptNecessaryBtn: 'Rifiuta',
              savePreferencesBtn: 'Salva le preferenze',
              closeIconLabel: 'Chiudi',
              sections: [
                {
                  title: 'Cookie necessari',
                  description: 'Indispensabili al funzionamento del sito e alla memorizzazione delle tue scelte. Sempre attivi.',
                  linkedCategory: 'necessary',
                },
                {
                  title: 'Cookie analitici',
                  description: 'Ci aiutano a capire come viene usato il sito, in forma aggregata (Google Analytics via Tag Manager).',
                  linkedCategory: 'analytics',
                },
                {
                  title: 'Cookie di marketing',
                  description: "Usati per misurare l'efficacia delle campagne pubblicitarie (Meta Pixel, Google Ads).",
                  linkedCategory: 'marketing',
                },
                {
                  title: 'Maggiori informazioni',
                  description: 'Per qualsiasi dubbio consulta la nostra <a href="/cookie-policy">Cookie Policy</a>.',
                },
              ],
            },
          },
        },
      },
    });
  });
}
