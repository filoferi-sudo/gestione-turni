// Servizio email centralizzato (Fase S5). Punto unico da cui passa qualunque invio email futuro:
// reset password, verifica email, proposte di sostituzione, comunicazioni. In questa fase è una
// PREDISPOSIZIONE — il provider di default è "no-op" (non invia nulla), così la struttura è
// completa e testabile ma nessuna email parte finché non si configura un provider reale.
//
// Design: il chiamante indica un `template` (per nome) e i `data`; il servizio costruisce
// subject/text/html dal template e delega l'invio al provider selezionato via EMAIL_PROVIDER.
// Così i chiamanti non conoscono né il provider né la forma del messaggio.

const { renderTemplate } = require('./templates');
const { getProvider } = require('./providers');

// Mittente di default, sovrascrivibile via env. In produzione va impostato un dominio verificato.
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@example.com';

// Invia un'email a partire da un template.
//   to       = destinatario
//   template = nome del template (vedi templates/index.js)
//   data     = dati per il template
// Ritorna l'esito del provider. NON è best-effort per definizione: i chiamanti futuri decideranno
// se attendere/gestire l'errore (per ora nessun chiamante attivo). Con provider no-op non fallisce.
async function sendEmail({ to, template, data = {}, from = EMAIL_FROM }) {
  if (!to) {
    throw new Error('sendEmail: destinatario (to) mancante');
  }
  const { subject, text, html } = renderTemplate(template, data);
  const provider = getProvider();
  return provider.send({ from, to, subject, text, html });
}

// Verifica se un provider di invio REALE è configurato (diverso dal no-op). Utile in futuro per
// decidere se offrire funzioni che dipendono dall'email (reset via link, 2FA) oppure nasconderle.
function isEmailConfigured() {
  const name = (process.env.EMAIL_PROVIDER || 'noop').toLowerCase();
  return name !== 'noop';
}

module.exports = { sendEmail, isEmailConfigured, EMAIL_FROM };
