// Script di test invio email (Fase E8). Invia UNA email di prova all'indirizzo indicato usando il
// provider configurato via env, e stampa l'esito. Serve a validare end-to-end la configurazione del
// provider (API key, mittente, dominio) senza passare dai flussi applicativi.
//
// Uso:
//   node scripts/testEmail.js destinatario@esempio.it
//   npm run email:test -- destinatario@esempio.it
//
// Legge la configurazione da .env (EMAIL_PROVIDER, RESEND_API_KEY, EMAIL_FROM). Con EMAIL_PROVIDER
// assente o 'noop' NON invia nulla (logga soltanto): è il default sicuro, va impostato 'resend' per
// un invio reale.
require('dotenv').config();
const { deliver } = require('../src/services/email/emailService');

async function main() {
  const to = process.argv[2] || process.env.EMAIL_TEST_TO;
  const provider = (process.env.EMAIL_PROVIDER || 'noop').toLowerCase();
  const from = process.env.EMAIL_FROM || 'no-reply@example.com';

  if (!to) {
    console.error('Uso: node scripts/testEmail.js destinatario@esempio.it');
    process.exit(1);
  }

  console.log('--- Test invio email Planivo ---');
  console.log('  provider :', provider);
  console.log('  from     :', from);
  console.log('  to       :', to);
  console.log('  RESEND_API_KEY presente:', process.env.RESEND_API_KEY ? 'sì' : 'no');
  if (provider === 'noop') {
    console.log('\n⚠  EMAIL_PROVIDER=noop: nessun invio reale (imposta EMAIL_PROVIDER=resend per inviare davvero).');
  }
  console.log('');

  const when = new Date().toLocaleString('it-IT');
  try {
    const result = await deliver({
      from,
      to,
      subject: 'Planivo — email di prova',
      text: `Questa è un'email di prova inviata da Planivo il ${when}.\n\nSe la stai leggendo, la configurazione del provider funziona correttamente.`,
      html: `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px;color:#1f2430">
        <h2 style="color:#2f6f4f;margin:0 0 12px">Planivo — email di prova</h2>
        <p>Questa è un'email di prova inviata il <strong>${when}</strong>.</p>
        <p>Se la stai leggendo, la configurazione del provider funziona correttamente. ✅</p>
      </div>`,
    });
    console.log('✅ Invio riuscito:', JSON.stringify(result));
    process.exit(0);
  } catch (err) {
    console.error('❌ Invio fallito:', err.message);
    process.exit(1);
  }
}

main();
