// Registro dei template email (Fase S5). Ogni template è una funzione pura che riceve `data` e
// restituisce { subject, text, html }. Nessun invio qui: i template sono solo la forma dei
// messaggi, usati dal servizio email quando (in futuro) l'invio verrà attivato.
//
// APP_BASE_URL serve a costruire i link (verifica/reset): con transport no-op i link vengono
// comunque generati e loggati, utili per testare il flusso senza un provider reale.

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

function verificationLink(token) {
  return `${APP_BASE_URL}/verifica-email?token=${encodeURIComponent(token)}`;
}
function resetLink(token) {
  return `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
}

const templates = {
  // Verifica dell'indirizzo email. data: { username, token }
  email_verification: ({ username, token }) => {
    const link = verificationLink(token);
    return {
      subject: 'Conferma il tuo indirizzo email',
      text: `Ciao ${username},\n\nconferma il tuo indirizzo email aprendo questo link:\n${link}\n\nSe non hai richiesto tu la verifica, ignora questo messaggio.`,
      html: `<p>Ciao ${escapeHtml(username)},</p><p>conferma il tuo indirizzo email:</p><p><a href="${escapeHtml(link)}">Conferma email</a></p><p>Se non hai richiesto tu la verifica, ignora questo messaggio.</p>`,
    };
  },

  // Reset password via link temporaneo. data: { username, token }
  password_reset: ({ username, token }) => {
    const link = resetLink(token);
    return {
      subject: 'Reimposta la tua password',
      text: `Ciao ${username},\n\nhai richiesto di reimpostare la password. Apri questo link (valido per un tempo limitato):\n${link}\n\nSe non sei stato tu, ignora questo messaggio: la password non verrà cambiata.`,
      html: `<p>Ciao ${escapeHtml(username)},</p><p>hai richiesto di reimpostare la password:</p><p><a href="${escapeHtml(link)}">Reimposta password</a></p><p>Se non sei stato tu, ignora questo messaggio.</p>`,
    };
  },

  // Codice 2FA via email. data: { username, code }
  two_factor_code: ({ username, code }) => ({
    subject: 'Il tuo codice di accesso',
    text: `Ciao ${username},\n\nil tuo codice di accesso è: ${code}\n\nScade a breve. Se non stai effettuando l'accesso, ignora questo messaggio.`,
    html: `<p>Ciao ${escapeHtml(username)},</p><p>il tuo codice di accesso è: <strong>${escapeHtml(String(code))}</strong></p><p>Scade a breve.</p>`,
  }),

  // Proposta di sostituzione (futuro secondo canale, oltre alla notifica in-app già esistente).
  // data: { username, date, startTime, endTime, areaName }
  substitution_proposal: ({ username, date, startTime, endTime, areaName }) => {
    const where = areaName ? ` (${areaName})` : '';
    return {
      subject: 'Ti è stata proposta una sostituzione',
      text: `Ciao ${username},\n\nti è stata proposta una sostituzione${where}: ${date} ${startTime}-${endTime}.\nAccedi all'app per accettare o rifiutare.`,
      html: `<p>Ciao ${escapeHtml(username)},</p><p>ti è stata proposta una sostituzione${escapeHtml(where)}: <strong>${escapeHtml(date)} ${escapeHtml(startTime)}-${escapeHtml(endTime)}</strong>.</p><p>Accedi all'app per rispondere.</p>`,
    };
  },

  // Comunicazione/notifica generica. data: { username, message }
  generic_notification: ({ username, message }) => ({
    subject: 'Nuova comunicazione',
    text: `Ciao ${username},\n\n${message}`,
    html: `<p>Ciao ${escapeHtml(username)},</p><p>${escapeHtml(message)}</p>`,
  }),
};

// Escape minimale per l'HTML dei template (i dati provengono da nomi utente/note interni, ma è
// buona norma non interpolare mai testo grezzo in HTML).
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Costruisce il messaggio a partire dal nome del template e dai dati. Lancia se il template non
// esiste (errore di programmazione, non di runtime dell'utente).
function renderTemplate(templateName, data = {}) {
  const fn = templates[templateName];
  if (!fn) {
    throw new Error(`Template email sconosciuto: ${templateName}`);
  }
  return fn(data);
}

module.exports = { renderTemplate, templates, escapeHtml };
