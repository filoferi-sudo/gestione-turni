// Registro dei template email. Ogni template è una funzione pura che riceve `data` e restituisce
// { subject, text, html }. Il `text` è il fallback in solo testo; l'`html` è rivestito dal layout
// professionale condiviso (Fase E4, ./layout.js): aspetto coerente, responsive, compatibile coi
// client di posta. Le firme dei dati NON sono cambiate tra E1–E3 ed E4 (i chiamanti restano invariati).
//
// APP_BASE_URL serve a costruire i link (verifica/reset/apertura app): con transport no-op i link
// vengono comunque generati e loggati, utili per testare il flusso senza un provider reale.

const { renderLayout, paragraph, button, buttonRow, detailBox, highlightBox, BRAND } = require('./layout');

const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';

function verificationLink(token) {
  return `${APP_BASE_URL}/verifica-email?token=${encodeURIComponent(token)}`;
}
function resetLink(token) {
  return `${APP_BASE_URL}/reset-password?token=${encodeURIComponent(token)}`;
}

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

// Nota "se non sei stato tu ignora" ricorrente, in piccolo.
function fineStampa(text) {
  return `<span style="font-size:13px;color:#6b7280;">${text}</span>`;
}

const templates = {
  // Verifica dell'indirizzo email. data: { username, token }
  email_verification: ({ username, token }) => {
    const link = verificationLink(token);
    return {
      subject: 'Conferma il tuo indirizzo email',
      text: `Ciao ${username},\n\nconferma il tuo indirizzo email aprendo questo link:\n${link}\n\nSe non hai richiesto tu la verifica, ignora questo messaggio.`,
      html: renderLayout({
        heading: 'Conferma il tuo indirizzo email',
        previewText: 'Conferma il tuo indirizzo email per attivare le comunicazioni.',
        contentHtml:
          paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
          paragraph('conferma il tuo indirizzo email per attivare le comunicazioni del tuo account.') +
          button('Conferma il mio indirizzo', link) +
          paragraph(fineStampa('Se non hai richiesto tu la verifica, ignora questo messaggio.')),
      }),
    };
  },

  // Reset password via link temporaneo. data: { username, token }
  password_reset: ({ username, token }) => {
    const link = resetLink(token);
    return {
      subject: 'Reimposta la tua password',
      text: `Ciao ${username},\n\nhai richiesto di reimpostare la password. Apri questo link (valido per un tempo limitato):\n${link}\n\nSe non sei stato tu, ignora questo messaggio: la password non verrà cambiata.`,
      html: renderLayout({
        heading: 'Reimposta la tua password',
        previewText: 'Reimposta la password del tuo account.',
        contentHtml:
          paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
          paragraph('hai richiesto di reimpostare la password. Il link è valido per un tempo limitato.') +
          button('Reimposta la password', link) +
          paragraph(fineStampa('Se non sei stato tu, ignora questo messaggio: la password non verrà cambiata.')),
      }),
    };
  },

  // Codice 2FA via email. data: { username, code }
  two_factor_code: ({ username, code }) => ({
    subject: 'Il tuo codice di accesso',
    text: `Ciao ${username},\n\nil tuo codice di accesso è: ${code}\n\nScade a breve. Se non stai effettuando l'accesso, ignora questo messaggio.`,
    html: renderLayout({
      heading: 'Il tuo codice di accesso',
      previewText: 'Codice di accesso a tempo.',
      contentHtml:
        paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
        paragraph('usa questo codice per completare l\'accesso:') +
        highlightBox(escapeHtml(String(code))) +
        paragraph(fineStampa('Il codice scade a breve. Se non stai effettuando l\'accesso, ignora questo messaggio.')),
    }),
  }),

  // Proposta di sostituzione. data: { username, date, startTime, endTime, areaName, acceptUrl, declineUrl }
  // Se acceptUrl/declineUrl sono presenti (Email Actions, E5), mostra i bottoni Accetta/Rifiuta che
  // agiscono direttamente dalla mail; altrimenti un semplice link all'app.
  substitution_proposal: ({ username, date, startTime, endTime, areaName, acceptUrl, declineUrl }) => {
    const where = areaName ? ` (${areaName})` : '';
    const actions =
      acceptUrl && declineUrl
        ? buttonRow([
            { label: 'Accetta', url: acceptUrl, variant: 'primary' },
            { label: 'Rifiuta', url: declineUrl, variant: 'danger' },
          ])
        : button(`Apri in ${escapeHtml(BRAND)}`, APP_BASE_URL);
    return {
      subject: 'Ti è stata proposta una sostituzione',
      text: `Ciao ${username},\n\nti è stata proposta una sostituzione${where}: ${date} ${startTime}-${endTime}.\nAccedi all'app per accettare o rifiutare.`,
      html: renderLayout({
        heading: 'Ti è stata proposta una sostituzione',
        previewText: `Sostituzione ${date} ${startTime}-${endTime}`,
        contentHtml:
          paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
          paragraph('ti è stata proposta una sostituzione. Ecco i dettagli:') +
          detailBox([
            ['Data', escapeHtml(date)],
            ['Orario', `${escapeHtml(startTime)}-${escapeHtml(endTime)}`],
            ['Area', areaName ? escapeHtml(areaName) : ''],
          ]) +
          actions +
          paragraph(fineStampa('Puoi rispondere direttamente da qui oppure accedendo all\'app.')),
      }),
    };
  },

  // Richiesta di cancellazione turno → responsabile. data: { username (responsabile),
  // requesterUsername, date, startTime, endTime, areaName, approveUrl, rejectUrl }
  cancellation_requested: ({ username, requesterUsername, date, startTime, endTime, areaName, approveUrl, rejectUrl }) => {
    const where = areaName ? ` (${areaName})` : '';
    const actions =
      approveUrl && rejectUrl
        ? buttonRow([
            { label: 'Approva', url: approveUrl, variant: 'primary' },
            { label: 'Rifiuta', url: rejectUrl, variant: 'danger' },
          ])
        : button('Gestisci la richiesta', APP_BASE_URL);
    return {
      subject: 'Nuova richiesta di cancellazione turno',
      text: `Ciao ${username},\n\n${requesterUsername} ha richiesto la cancellazione del turno del ${date} ${startTime}-${endTime}${where}.\nAccedi all'app per approvare o rifiutare la richiesta.`,
      html: renderLayout({
        heading: 'Nuova richiesta di cancellazione',
        previewText: `${requesterUsername} chiede di cancellare un turno`,
        contentHtml:
          paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
          paragraph(`<strong>${escapeHtml(requesterUsername)}</strong> ha richiesto la cancellazione di un turno.`) +
          detailBox([
            ['Data', escapeHtml(date)],
            ['Orario', `${escapeHtml(startTime)}-${escapeHtml(endTime)}`],
            ['Area', areaName ? escapeHtml(areaName) : ''],
            ['Richiesta da', escapeHtml(requesterUsername)],
          ]) +
          actions +
          paragraph(fineStampa('Puoi decidere direttamente da qui oppure accedendo all\'app.')),
      }),
    };
  },

  // Richiesta di cancellazione APPROVATA → dipendente. data: { username, date, startTime, endTime }
  cancellation_approved: ({ username, date, startTime, endTime }) => ({
    subject: 'Richiesta di cancellazione approvata',
    text: `Ciao ${username},\n\nla tua richiesta di cancellazione del turno del ${date} ${startTime}-${endTime} è stata approvata.`,
    html: renderLayout({
      heading: 'Richiesta approvata',
      previewText: 'La tua richiesta di cancellazione è stata approvata.',
      contentHtml:
        paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
        paragraph('la tua richiesta di cancellazione è stata <strong>approvata</strong>. Il turno seguente non è più a tuo carico:') +
        detailBox([
          ['Data', escapeHtml(date)],
          ['Orario', `${escapeHtml(startTime)}-${escapeHtml(endTime)}`],
        ]),
    }),
  }),

  // Richiesta di cancellazione RIFIUTATA → dipendente. data: { username, date, startTime, endTime }
  cancellation_rejected: ({ username, date, startTime, endTime }) => ({
    subject: 'Richiesta di cancellazione rifiutata',
    text: `Ciao ${username},\n\nla tua richiesta di cancellazione del turno del ${date} ${startTime}-${endTime} è stata rifiutata. Il turno resta assegnato a te.`,
    html: renderLayout({
      heading: 'Richiesta rifiutata',
      previewText: 'La tua richiesta di cancellazione è stata rifiutata.',
      contentHtml:
        paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
        paragraph('la tua richiesta di cancellazione è stata <strong>rifiutata</strong>. Il turno resta assegnato a te:') +
        detailBox([
          ['Data', escapeHtml(date)],
          ['Orario', `${escapeHtml(startTime)}-${escapeHtml(endTime)}`],
        ]),
    }),
  }),

  // Un dipendente ha RIFIUTATO una proposta di sostituzione → responsabile.
  // data: { username (responsabile), declinerUsername, date, startTime, endTime, areaName }
  substitution_proposal_declined: ({ username, declinerUsername, date, startTime, endTime, areaName }) => {
    const where = areaName ? ` (${areaName})` : '';
    return {
      subject: 'Proposta di sostituzione rifiutata',
      text: `Ciao ${username},\n\n${declinerUsername} ha rifiutato la proposta di sostituzione del ${date} ${startTime}-${endTime}${where}.\nAccedi all'app per proporla a un altro dipendente.`,
      html: renderLayout({
        heading: 'Proposta di sostituzione rifiutata',
        previewText: `${declinerUsername} ha rifiutato la proposta`,
        contentHtml:
          paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
          paragraph(`<strong>${escapeHtml(declinerUsername)}</strong> ha rifiutato la proposta di sostituzione.`) +
          detailBox([
            ['Data', escapeHtml(date)],
            ['Orario', `${escapeHtml(startTime)}-${escapeHtml(endTime)}`],
            ['Area', areaName ? escapeHtml(areaName) : ''],
          ]) +
          button('Proponi a un altro', APP_BASE_URL),
      }),
    };
  },

  // Nuovo turno assegnato (Fase E3). data: { username, companyName, date, startTime, endTime,
  // areaName, sedeName, assignedBy }
  shift_assigned: ({ username, companyName, date, startTime, endTime, areaName, sedeName, assignedBy }) => {
    const dettagli = [
      `Data: ${date}`,
      `Orario: ${startTime}-${endTime}`,
      areaName ? `Area: ${areaName}` : null,
      sedeName ? `Sede: ${sedeName}` : null,
      assignedBy ? `Assegnato da: ${assignedBy}` : null,
    ].filter(Boolean);
    const azienda = companyName ? ` presso ${companyName}` : '';
    return {
      subject: `Nuovo turno assegnato — ${date} ${startTime}-${endTime}`,
      text: `Ciao ${username},\n\nti è stato assegnato un nuovo turno${azienda} per il giorno ${date} dalle ${startTime} alle ${endTime}.\n\n${dettagli.join('\n')}\n\nAccedi all'app per i dettagli.`,
      html: renderLayout({
        heading: 'Nuovo turno assegnato',
        previewText: `Turno ${date} ${startTime}-${endTime}`,
        contentHtml:
          paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
          paragraph(`ti è stato assegnato un nuovo turno${escapeHtml(azienda)}.`) +
          detailBox([
            ['Data', escapeHtml(date)],
            ['Orario', `${escapeHtml(startTime)}-${escapeHtml(endTime)}`],
            ['Area', areaName ? escapeHtml(areaName) : ''],
            ['Sede', sedeName ? escapeHtml(sedeName) : ''],
            ['Assegnato da', assignedBy ? escapeHtml(assignedBy) : ''],
          ]) +
          button('Apri il calendario', APP_BASE_URL),
      }),
    };
  },

  // Turno modificato (Fase E3). data: { username, companyName, oldDate, oldStartTime, oldEndTime,
  // newDate, newStartTime, newEndTime, areaName, sedeName, reason, modifiedBy }
  shift_modified: ({ username, companyName, oldDate, oldStartTime, oldEndTime, newDate, newStartTime, newEndTime, areaName, sedeName, reason, modifiedBy }) => {
    const azienda = companyName ? ` presso ${companyName}` : '';
    const vecchio = `${oldDate} ${oldStartTime}-${oldEndTime}`;
    const nuovo = `${newDate} ${newStartTime}-${newEndTime}`;
    const extraText = [
      areaName ? `Area: ${areaName}` : null,
      sedeName ? `Sede: ${sedeName}` : null,
      modifiedBy ? `Modificato da: ${modifiedBy}` : null,
      reason ? `Motivo: ${reason}` : null,
    ].filter(Boolean);
    return {
      subject: `Turno modificato — ${newDate} ${newStartTime}-${newEndTime}`,
      text: `Ciao ${username},\n\nun tuo turno${azienda} è stato modificato.\n\nPrima: ${vecchio}\nAdesso: ${nuovo}\n${extraText.join('\n')}\n\nAccedi all'app per i dettagli.`,
      html: renderLayout({
        heading: 'Turno modificato',
        previewText: `Ora: ${nuovo}`,
        contentHtml:
          paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) +
          paragraph(`un tuo turno${escapeHtml(azienda)} è stato modificato.`) +
          detailBox([
            ['Prima', escapeHtml(vecchio)],
            ['Adesso', escapeHtml(nuovo)],
            ['Area', areaName ? escapeHtml(areaName) : ''],
            ['Sede', sedeName ? escapeHtml(sedeName) : ''],
            ['Modificato da', modifiedBy ? escapeHtml(modifiedBy) : ''],
            ['Motivo', reason ? escapeHtml(reason) : ''],
          ]) +
          button('Apri il calendario', APP_BASE_URL),
      }),
    };
  },

  // Comunicazione/notifica generica. data: { username, message }
  generic_notification: ({ username, message }) => ({
    subject: 'Nuova comunicazione',
    text: `Ciao ${username},\n\n${message}`,
    html: renderLayout({
      heading: 'Nuova comunicazione',
      previewText: String(message).slice(0, 80),
      contentHtml:
        paragraph(`Ciao <strong>${escapeHtml(username)}</strong>,`) + paragraph(escapeHtml(message)),
    }),
  }),
};

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
