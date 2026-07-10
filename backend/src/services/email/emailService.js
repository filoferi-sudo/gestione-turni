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

// Consegna al provider un messaggio GIÀ renderizzato (subject/text/html). Unico punto da cui parte
// qualunque invio reale: il canale email delle notifiche (Fase E1) rende il template per proprio
// conto — così può loggare il subject e gestire la soppressione demo — e poi consegna qui, evitando
// di rendere due volte lo stesso template. Ritorna l'esito del provider (con provider no-op non
// fallisce e non invia nulla).
async function deliver({ to, subject, text, html, from = EMAIL_FROM }) {
  if (!to) {
    throw new Error('deliver: destinatario (to) mancante');
  }
  const provider = getProvider();
  return provider.send({ from, to, subject, text, html });
}

// Invia un'email a partire da un template (per invii singoli: verifica email, reset password, ...).
//   to       = destinatario
//   template = nome del template (vedi templates/index.js)
//   data     = dati per il template
// Ritorna l'esito del provider. NON è best-effort per definizione: i chiamanti decidono se
// attendere/gestire l'errore. Con provider no-op non fallisce.
async function sendEmail({ to, template, data = {}, from = EMAIL_FROM }) {
  const { subject, text, html } = renderTemplate(template, data);
  return deliver({ to, subject, text, html, from });
}

// Verifica se un provider di invio REALE è configurato (diverso dal no-op). Utile in futuro per
// decidere se offrire funzioni che dipendono dall'email (reset via link, 2FA) oppure nasconderle.
function isEmailConfigured() {
  const name = (process.env.EMAIL_PROVIDER || 'noop').toLowerCase();
  return name !== 'noop';
}

module.exports = { sendEmail, deliver, isEmailConfigured, EMAIL_FROM };
