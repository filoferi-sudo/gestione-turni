// Provider "no-op" (Fase S5): NON invia email. Registra a console il fatto che un'email sarebbe
// stata inviata (destinatario, oggetto, e il link se presente nel testo), utile per verificare i
// flussi in sviluppo senza un provider reale e senza rischio di invii accidentali.
//
// È il provider di default finché EMAIL_PROVIDER non punta a un provider reale (futuro).

async function send({ from, to, subject }) {
  console.log(`[email:noop] (nessun invio) from=${from} to=${to} subject="${subject}"`);
  return { accepted: [to], provider: 'noop', delivered: false };
}

module.exports = { send };
