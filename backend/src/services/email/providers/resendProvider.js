// Provider di invio email via Resend (https://resend.com) — Fase E1.
//
// Scelto per Planivo perché: API REST semplice chiamabile con il `fetch` NATIVO di Node 18+
// (nessuna dipendenza npm aggiuntiva, coerente con la filosofia "niente dipendenze inutili" del
// progetto), free tier generoso, verifica dominio con SPF/DKIM guidata, buon rapporto con Vercel.
//
// L'astrazione providers/index.js rende la scelta reversibile: per passare a un altro provider
// basta aggiungere un modulo fratello e una riga nello switch, senza toccare i chiamanti.
//
// Attivazione: EMAIL_PROVIDER=resend + RESEND_API_KEY=... (vedi .env.example e la guida di
// configurazione). Con la chiave assente il send fallisce in modo esplicito (il canale email è
// best-effort: l'errore viene loggato in email_log come `failed`, non blocca l'azione applicativa).

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

async function send({ from, to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY non configurata: impossibile inviare email con il provider resend');
  }

  const resp = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to, subject, html, text }),
  });

  if (!resp.ok) {
    // Non logghiamo il corpo completo (può contenere echo dei dati inviati): solo status + estratto.
    const detail = await resp.text().catch(() => '');
    throw new Error(`Resend ha risposto ${resp.status}: ${detail.slice(0, 300)}`);
  }

  const data = await resp.json().catch(() => ({}));
  return { accepted: [to], provider: 'resend', delivered: true, id: data.id || null };
}

module.exports = { send };
