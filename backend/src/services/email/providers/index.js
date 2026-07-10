// Selezione del provider di invio email (Fase S5). L'astrazione permette di aggiungere in futuro
// provider reali (SMTP via nodemailer, API tipo SendGrid/Postmark/Resample, ...) senza toccare i
// chiamanti: basta impostare EMAIL_PROVIDER e le relative credenziali via env.
//
// Provider di default: 'noop' — NON invia nulla, si limita a loggare. Così l'intero sistema email
// è utilizzabile e testabile end-to-end (template, link, destinatari) SENZA configurare un provider
// reale e senza rischiare invii accidentali in sviluppo.

const noopProvider = require('./noopProvider');

// Ogni provider espone: async send({ from, to, subject, text, html }) => { accepted, provider, ... }
function getProvider() {
  const name = (process.env.EMAIL_PROVIDER || 'noop').toLowerCase();

  switch (name) {
    case 'noop':
      return noopProvider;
    case 'resend': // Invio reale via API Resend (fetch nativo, nessuna dipendenza) — Fase E1.
      return require('./resendProvider');
    // case 'smtp':  // Futuro: return require('./smtpProvider');  (richiederà `nodemailer`)
    // case 'sendgrid': // Futuro: return require('./sendgridProvider');
    default:
      // Provider richiesto ma non ancora implementato: si ricade sul no-op con avviso, così non si
      // rompe nulla se qualcuno imposta EMAIL_PROVIDER prima che il provider esista.
      console.warn(`[email] EMAIL_PROVIDER="${name}" non implementato: uso il transport no-op (nessun invio).`);
      return noopProvider;
  }
}

module.exports = { getProvider };
