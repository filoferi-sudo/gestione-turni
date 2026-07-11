// ============================================================================
// Configurazione billing (Step 8 - layer SaaS) — interamente guidata da env
// ============================================================================
// PREDISPOSIZIONE pagamenti, SPENTA di default. Stesso approccio già usato nel progetto per le
// integrazioni esterne rischiose (email S5, cifratura S6): l'infrastruttura esiste, testabile, ma non
// effettua alcun addebito reale finché non viene configurata e attivata esplicitamente via env.
//   * BILLING_ENABLED (default false): espone gli endpoint /api/billing e la UI di abbonamento.
//   * STRIPE_SECRET_KEY: se presente (oltre a enabled) le chiamate al provider sono REALI ("live").
//     Senza chiave, il checkout ritorna un URL segnaposto (per sviluppo/test senza account Stripe).
//   * STRIPE_WEBHOOK_SECRET: segreto per verificare la firma dei webhook in ingresso.
// I PREZZI non stanno qui né nel codice: vivono nel provider e si mappano al piano tramite
// plans.external_price_ref (configurabile dal Super Admin). Coerente col vincolo "zero valori
// commerciali hardcoded".

const { envBool } = require('./security');

const billing = {
  enabled: envBool('BILLING_ENABLED', false),
  provider: process.env.BILLING_PROVIDER || 'stripe',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
  successUrl: process.env.BILLING_SUCCESS_URL || '',
  cancelUrl: process.env.BILLING_CANCEL_URL || '',
  // Tolleranza (secondi) sul timestamp della firma webhook, contro i replay. 0 = disattivata.
  webhookToleranceSeconds: Number(process.env.BILLING_WEBHOOK_TOLERANCE_SECONDS || 300),
};

// Chiamate reali al provider possibili solo se abilitato E con chiave segreta presente.
function isLive() {
  return billing.enabled && !!billing.stripeSecretKey;
}

module.exports = { billing, isLive };
