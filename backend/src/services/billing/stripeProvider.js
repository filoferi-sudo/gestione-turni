const crypto = require('crypto');
const { billing } = require('../../config/billing');

// ============================================================================
// Provider Stripe (Step 8) — chiamate REST via fetch nativo, zero dipendenze
// ============================================================================
// Concreto ma isolato dietro billingService: sostituire provider = cambiare questo modulo (stesso
// principio dell'astrazione email/provider del progetto). Nessun addebito avviene qui a meno che
// billingService non decida di chiamarlo (solo in modalità "live", vedi config/billing.isLive).

// Crea una sessione di Checkout Stripe per un abbonamento e ne restituisce l'URL di pagamento.
async function createCheckoutSession({ priceRef, companyId, planId, customerEmail, successUrl, cancelUrl }) {
  const body = new URLSearchParams();
  body.set('mode', 'subscription');
  body.set('line_items[0][price]', priceRef);
  body.set('line_items[0][quantity]', '1');
  if (successUrl) body.set('success_url', successUrl);
  if (cancelUrl) body.set('cancel_url', cancelUrl);
  body.set('client_reference_id', String(companyId));
  body.set('metadata[companyId]', String(companyId));
  body.set('metadata[planId]', String(planId));
  if (customerEmail) body.set('customer_email', customerEmail);

  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${billing.stripeSecretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data.error && data.error.message) || `Errore Stripe (${res.status})`);
  }
  return { id: data.id, url: data.url };
}

// Verifica la firma dell'header `Stripe-Signature` (schema ufficiale: t=<ts>,v1=<hmac>) sul corpo
// grezzo e restituisce l'evento JSON. Lancia se la firma è assente/malformata/non valida o scaduta.
// HMAC-SHA256 di `${t}.${rawBody}` con lo webhook secret; confronto timing-safe.
function constructEvent(rawBody, signatureHeader, secret, toleranceSeconds) {
  if (!secret) throw new Error('Webhook secret non configurato');
  if (!signatureHeader) throw new Error('Firma mancante');

  let timestamp = null;
  const signatures = [];
  for (const part of String(signatureHeader).split(',')) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    else if (key === 'v1') signatures.push(value);
  }
  if (!timestamp || signatures.length === 0) throw new Error('Firma malformata');

  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`, 'utf8').update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected);
  const valid = signatures.some(
    (sig) => sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), expectedBuf)
  );
  if (!valid) throw new Error('Firma non valida');

  if (toleranceSeconds && toleranceSeconds > 0) {
    const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (ageSeconds > toleranceSeconds) throw new Error('Timestamp della firma fuori tolleranza');
  }

  return JSON.parse(Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody));
}

module.exports = { createCheckoutSession, constructEvent };
