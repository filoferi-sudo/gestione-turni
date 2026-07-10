const pool = require('../../config/db');
const { renderTemplate } = require('../email/templates');
const { deliver, EMAIL_FROM } = require('../email/emailService');
const { isEmailAllowed } = require('../notificationPreferencesService');

// Canale EMAIL delle notifiche (Fase E1, esteso in E2). È un canale fratello del canale in-app (la
// tabella notifications, gestita da notificationService.js): la stessa logica di evento alimenta
// entrambi senza conoscerne i dettagli. Aggiungere in futuro un canale WhatsApp/SMS/Push significa
// creare un modulo fratello con la stessa interfaccia e chiamarlo dagli stessi eventi.
//
// Due modalità di invio, che condividono lo stesso core (`sendOne`):
//   - deliverEventEmail       = notifiche di evento a più destinatari (per id), GATED: si invia solo
//                               agli indirizzi verificati (salvo EMAIL_REQUIRE_VERIFIED=false).
//   - deliverTransactionalEmail = email "di servizio" (verifica email, reset password) a UN indirizzo
//                               esplicito, NON gated: deve partire proprio verso indirizzi non ancora
//                               verificati (è ciò che li verifica).
//
// INVARIANTE: interamente BEST-EFFORT. Nessuna funzione qui lancia mai: un problema di invio non deve
// MAI far fallire l'azione applicativa che l'ha generato. Ogni tentativo (riuscito, fallito o
// soppresso) viene registrato in email_log per lo storico consultabile.

// Gate v1: si inviano email di evento solo agli indirizzi verificati. Disattivabile via env per
// testare gli invii reali prima/durante il rollout della verifica email (Fase E2).
function requireVerifiedEmail() {
  return (process.env.EMAIL_REQUIRE_VERIFIED || 'true').toLowerCase() !== 'false';
}

// Info di contatto dei destinatari, in un'unica query (l'evento passa solo gli id, come per l'in-app).
async function fetchRecipients(userIds) {
  const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return [];
  // LEFT JOIN preferenze (Fase E6): assenza di riga = default "tutte".
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.email_verified,
            np.email_mode, np.disabled_categories
       FROM users u
       LEFT JOIN notification_preferences np ON np.user_id = u.id
      WHERE u.id = ANY($1::int[])`,
    [ids]
  );
  return rows;
}

async function isDemoCompany(companyId) {
  if (!companyId) return false;
  const { rows } = await pool.query('SELECT is_demo FROM companies WHERE id = $1', [companyId]);
  return rows[0]?.is_demo === true;
}

// Inserisce una riga nello storico invii. Best-effort a sua volta: se il log fallisce non deve
// propagare (non facciamo fallire un invio riuscito perché la scrittura del log è andata male).
async function logEmail({ companyId, userId, toEmail, eventType, template, subject, status, error = null, provider = null, providerMessageId = null, payload = {} }) {
  try {
    await pool.query(
      `INSERT INTO email_log
         (company_id, user_id, to_email, event_type, template, subject, status, error, provider, provider_message_id, payload, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)`,
      [
        companyId || null,
        userId || null,
        toEmail,
        eventType,
        template,
        subject || null,
        status,
        error,
        provider,
        providerMessageId,
        JSON.stringify(payload || {}),
        status === 'sent' ? new Date() : null,
      ]
    );
  } catch (err) {
    console.error('[email-channel] scrittura email_log fallita (non bloccante):', err.message);
  }
}

// Core dell'invio a UN destinatario (email esplicita). Applica soppressione demo, gate (solo se
// `gated`), render, consegna, e registrazione dell'esito. Cattura i propri errori e non li propaga.
async function sendOne({ companyId, userId, toEmail, emailVerified, eventType, template, data, payload = {}, demo, gated, prefs = null }) {
  const base = { companyId, userId, toEmail, eventType, template, payload };

  if (!toEmail) {
    await logEmail({ ...base, subject: null, status: 'suppressed', error: 'destinatario senza email' });
    return;
  }

  // Il subject serve anche quando l'invio è soppresso (per uno storico leggibile): renderizziamo qui.
  let subject = null;
  let text;
  let html;
  try {
    ({ subject, text, html } = renderTemplate(template, data));
  } catch (err) {
    await logEmail({ ...base, subject: null, status: 'failed', error: `render template: ${err.message}` });
    return;
  }

  // Ambiente demo: pipeline identica ma NESSUN invio reale (email fittizie = solo bounce). Il demo
  // ha la precedenza su tutto: vale anche per le email transazionali.
  if (demo) {
    await logEmail({ ...base, subject, status: 'suppressed', error: 'ambiente demo (nessun invio reale)' });
    return;
  }

  // Preferenze notifiche (E6): l'utente può aver disattivato questa categoria o scelto "solo
  // importanti"/"nessuna". Solo per le email di evento (le transazionali passano gated=false).
  if (gated && !isEmailAllowed(prefs, eventType)) {
    await logEmail({ ...base, subject, status: 'suppressed', error: 'preferenze notifiche utente' });
    return;
  }

  // Gate v1: solo indirizzi verificati (solo per le email di evento; le transazionali passano `gated=false`).
  if (gated && requireVerifiedEmail() && !emailVerified) {
    await logEmail({ ...base, subject, status: 'suppressed', error: 'email non verificata' });
    return;
  }

  try {
    const result = await deliver({ from: EMAIL_FROM, to: toEmail, subject, text, html });
    await logEmail({
      ...base,
      subject,
      status: 'sent',
      provider: result?.provider || null,
      providerMessageId: result?.id || null,
    });
  } catch (err) {
    await logEmail({ ...base, subject, status: 'failed', error: err.message });
  }
}

// Notifica di evento (gated): consegna a un insieme di destinatari (per id).
//   companyId     = società dell'evento (storico + rilevamento demo)
//   userIds       = destinatari (id utente); l'attore va escluso con excludeUserId
//   eventType     = tipo di evento applicativo (email_log.event_type)
//   template      = nome del template email
//   buildData     = (recipient) => data per il template (il greeting usa recipient.username). Può
//                   essere ASYNC: le Email Actions (E5) generano un token per-destinatario qui.
//   payload       = riferimenti dell'evento (shiftId/requestId/...), in email_log.payload
//   excludeUserId = utente da NON notificare (tipicamente chi ha compiuto l'azione)
async function deliverEventEmail({ companyId, userIds, eventType, template, buildData, payload = {}, excludeUserId = null }) {
  try {
    const recipients = (await fetchRecipients(userIds)).filter((r) => r.id !== excludeUserId);
    if (recipients.length === 0) return;

    const demo = await isDemoCompany(companyId);
    for (const recipient of recipients) {
      // Try/catch per destinatario: un errore nel preparare i dati (es. emissione token azione) di
      // un destinatario non deve impedire l'invio agli altri.
      try {
        const data = await buildData(recipient);
        await sendOne({
          companyId,
          userId: recipient.id,
          toEmail: recipient.email,
          emailVerified: recipient.email_verified,
          eventType,
          template,
          data,
          payload,
          demo,
          gated: true,
          prefs: { emailMode: recipient.email_mode, disabledCategories: recipient.disabled_categories },
        });
      } catch (err) {
        console.error(`[email-channel] preparazione invio a ${recipient.id} fallita (non bloccante):`, err.message);
      }
    }
  } catch (err) {
    console.error(`[email-channel] deliverEventEmail(${eventType}) fallita (non bloccante):`, err.message);
  }
}

// Email transazionale (NON gated): verifica email, reset password. Destinatario esplicito — può essere
// un indirizzo non ancora verificato (es. `pending_email` nel cambio email). Demo comunque soppressa;
// sempre loggata. Best-effort.
async function deliverTransactionalEmail({ companyId, userId, toEmail, eventType, template, data, payload = {} }) {
  try {
    const demo = await isDemoCompany(companyId);
    await sendOne({
      companyId,
      userId,
      toEmail,
      emailVerified: true, // ignorato: gated=false
      eventType,
      template,
      data,
      payload,
      demo,
      gated: false,
    });
  } catch (err) {
    console.error(`[email-channel] deliverTransactionalEmail(${eventType}) fallita (non bloccante):`, err.message);
  }
}

module.exports = { deliverEventEmail, deliverTransactionalEmail };
