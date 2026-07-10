const authTokens = require('./authTokenService');
const { deliverTransactionalEmail } = require('./notificationChannels/emailChannel');

// Servizio di verifica email (Fase E2). Unico punto che emette un token monouso a scadenza (riusa
// authTokenService, purpose 'email_verification') e invia il link di conferma via canale email
// (transazionale: non filtrato dal gate "solo verificate", perché è proprio ciò che verifica
// l'indirizzo). Riusato da: creazione utente, reinvio self-service, cambio email.
//
// Best-effort come tutto il canale email: se l'invio fallisce, l'azione chiamante non deve fallire.
// La creazione del token può invece lanciare (errore DB): il chiamante decide se assorbirlo
// (createUser: sì, non blocca la creazione) o propagarlo (endpoint di reinvio: 500 esplicito).
async function issueAndSendVerification({ userId, companyId, username, toEmail }) {
  if (!toEmail) return { ok: false, reason: 'no_email' };

  // invalidatePrevious (default) = resta valido solo l'ultimo link inviato per questo utente.
  const { token } = await authTokens.createToken(userId, 'email_verification');

  await deliverTransactionalEmail({
    companyId,
    userId,
    toEmail,
    eventType: 'email_verification',
    template: 'email_verification',
    data: { username, token },
    payload: { kind: 'email_verification' },
  });

  return { ok: true };
}

module.exports = { issueAndSendVerification };
