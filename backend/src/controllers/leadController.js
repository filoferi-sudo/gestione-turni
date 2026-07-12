// Raccolta lead pubblica dal sito marketing (planivo.it). UNICA feature nuova del backend per il
// sito: additiva, isolata, NESSUNA modifica ad auth/controller esistenti. Rotta pubblica (nessun
// token). Vedi PROJECT_CONTEXT → "Lead pubblici".
const pool = require('../config/db');

const BUSINESS_TYPES = ['ristorante', 'bar', 'piscina', 'palestra', 'altro'];
const EMPLOYEE_RANGES = ['1-5', '6-15', '16-30', '30+'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+\s().-]{6,20}$/;

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim().slice(0, 100);
  return req.socket && req.socket.remoteAddress ? String(req.socket.remoteAddress).slice(0, 100) : null;
}
const trunc = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);

// Notifica email al founder — best-effort, MAI bloccante, skip silenzioso se manca la config.
// Provider: Brevo se BREVO_API_KEY è presente (come da brief del sito); in alternativa Resend
// (provider già usato dal progetto) se RESEND_API_KEY è presente. Se manca tutto, si logga e basta.
async function notifyLead(lead) {
  const to = process.env.LEAD_NOTIFY_EMAIL;
  if (!to) return; // nessun destinatario configurato → niente notifica (il lead è già salvato)

  const subject = `Nuovo lead Planivo — ${lead.business_type}`;
  const text = [
    `Nome: ${lead.name}`,
    `Telefono: ${lead.phone}`,
    `Email: ${lead.email}`,
    `Tipo struttura: ${lead.business_type}`,
    `Dipendenti: ${lead.employees_range || '-'}`,
    `Messaggio: ${lead.message || '-'}`,
    `Origine form: ${lead.form_source || '-'}`,
    `Landing: ${lead.landing_path || '-'}`,
    `UTM: ${[lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ') || '-'}`,
    `Referrer: ${lead.referrer || '-'}`,
    `IP: ${lead.ip || '-'}`,
    `Ricevuto: ${lead.created_at}`,
  ].join('\n');

  try {
    if (process.env.BREVO_API_KEY) {
      await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'api-key': process.env.BREVO_API_KEY,
          'Content-Type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sender: { name: 'Planivo Sito', email: process.env.LEAD_NOTIFY_FROM || to },
          to: [{ email: to }],
          replyTo: { email: lead.email, name: lead.name },
          subject,
          textContent: text,
        }),
      });
    } else if (process.env.RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || 'Planivo <onboarding@resend.dev>',
          to: [to],
          reply_to: lead.email,
          subject,
          text,
        }),
      });
    } else {
      console.log('[leads] Nessun provider email configurato: notifica saltata (lead salvato).');
    }
  } catch (err) {
    // Best-effort: un errore di invio non deve MAI far fallire la raccolta del lead.
    console.error('[leads] Notifica email fallita (lead salvato comunque):', err.message);
  }
}

async function createLead(req, res) {
  const b = req.body || {};

  // 1. Honeypot: se il campo esca "website" è compilato, è un bot → 201 silenzioso, nessun insert.
  if (typeof b.website === 'string' && b.website.trim() !== '') {
    return res.status(201).json({ ok: true });
  }

  // 2. Validazioni (400 con messaggio in italiano).
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (name.length < 2 || name.length > 100) {
    return res.status(400).json({ error: 'Inserisci nome e cognome (2–100 caratteri).' });
  }
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  if (!email || email.length > 150 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Inserisci un indirizzo email valido.' });
  }
  const phone = typeof b.phone === 'string' ? b.phone.trim() : '';
  if (!PHONE_RE.test(phone)) {
    return res.status(400).json({ error: 'Inserisci un numero di telefono valido.' });
  }
  const business_type = typeof b.business_type === 'string' ? b.business_type.trim() : '';
  if (!BUSINESS_TYPES.includes(business_type)) {
    return res.status(400).json({ error: 'Seleziona un tipo di struttura valido.' });
  }
  let employees_range = typeof b.employees_range === 'string' ? b.employees_range.trim() : '';
  if (employees_range && !EMPLOYEE_RANGES.includes(employees_range)) {
    return res.status(400).json({ error: 'Seleziona un numero di dipendenti valido.' });
  }
  if (!employees_range) employees_range = null;
  if (b.privacy_consent !== true && b.privacy_consent !== 'true') {
    return res.status(400).json({ error: 'Devi accettare la privacy policy per continuare.' });
  }

  // Campi liberi/di contesto: troncati a lunghezze sane.
  const message = trunc(b.message, 1000);
  const form_source = trunc(b.form_source, 20);
  const landing_path = trunc(b.landing_path, 300);
  const utm_source = trunc(b.utm_source, 200);
  const utm_medium = trunc(b.utm_medium, 200);
  const utm_campaign = trunc(b.utm_campaign, 200);
  const utm_content = trunc(b.utm_content, 200);
  const utm_term = trunc(b.utm_term, 200);
  const referrer = trunc(b.referrer, 400);
  const ip = clientIp(req);
  const user_agent = trunc(req.headers['user-agent'], 400);

  // 3. Throttle su DB (funziona sul serverless, niente stato in memoria): max 5 in 10 min per IP.
  if (ip) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM leads WHERE ip = $1 AND created_at > now() - interval '10 minutes'`,
      [ip]
    );
    if (rows[0].c >= 5) {
      return res.status(429).json({ error: 'Troppe richieste. Riprova tra qualche minuto.' });
    }
  }

  // 4. INSERT parametrizzato (consent_at = now()).
  const { rows } = await pool.query(
    `INSERT INTO leads
       (name, email, phone, business_type, employees_range, message, form_source, landing_path,
        utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, ip, user_agent,
        privacy_consent, consent_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,true,now())
     RETURNING *`,
    [name, email, phone, business_type, employees_range, message, form_source, landing_path,
     utm_source, utm_medium, utm_campaign, utm_content, utm_term, referrer, ip, user_agent]
  );

  // 5. Notifica best-effort (await con try/catch interno: non fa mai fallire la risposta; su
  //    serverless attendere l'invio evita che il processo si congeli prima della chiamata).
  await notifyLead(rows[0]);

  // 6. Risposta.
  return res.status(201).json({ ok: true });
}

module.exports = { createLead };
