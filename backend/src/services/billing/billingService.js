const pool = require('../../config/db');
const { billing, isLive } = require('../../config/billing');
const stripe = require('./stripeProvider');
const entitlements = require('../entitlements');

// ============================================================================
// billingService (Step 8) — orchestrazione pagamenti sopra company_subscriptions
// ============================================================================
// Unico punto che collega il provider (Stripe) al modello dati degli abbonamenti. Il resto del
// sistema NON sa nulla del provider. Spento di default (config/billing): se non abilitato, gli
// endpoint rispondono 404; se abilitato ma senza chiave, il checkout ritorna un URL segnaposto.

function isEnabled() {
  return billing.enabled;
}

// Crea una sessione di checkout per portare la società `companyId` al piano `planId`.
async function createCheckoutSession({ companyId, planId, customerEmail }) {
  const { rows } = await pool.query(
    'SELECT id, code, name, external_price_ref FROM plans WHERE id = $1 AND is_active = TRUE',
    [planId]
  );
  const plan = rows[0];
  if (!plan) {
    const e = new Error('Piano non valido o non attivo');
    e.status = 400;
    throw e;
  }

  if (!isLive()) {
    // Ambiente non configurato per chiamate reali (nessuna chiave Stripe): URL segnaposto, utile in
    // sviluppo/test senza account di pagamento. Nessun addebito.
    return {
      url: `${billing.successUrl || '/superadmin'}?stub=1&company=${companyId}&plan=${planId}`,
      stub: true,
    };
  }

  if (!plan.external_price_ref) {
    const e = new Error('Il piano selezionato non ha un prezzo configurato');
    e.status = 400;
    throw e;
  }
  return stripe.createCheckoutSession({
    priceRef: plan.external_price_ref,
    companyId,
    planId,
    customerEmail,
    successUrl: billing.successUrl,
    cancelUrl: billing.cancelUrl,
  });
}

// Verifica e decodifica un evento webhook del provider (lancia se la firma non è valida).
function constructEvent(rawBody, signatureHeader) {
  return stripe.constructEvent(rawBody, signatureHeader, billing.stripeWebhookSecret, billing.webhookToleranceSeconds);
}

function mapStripeStatus(eventType, stripeStatus) {
  if (eventType === 'customer.subscription.deleted') return 'canceled';
  const map = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    unpaid: 'past_due',
    incomplete: 'past_due',
    incomplete_expired: 'canceled',
    canceled: 'canceled',
  };
  return map[stripeStatus] || 'active';
}

// Applica un evento del provider agli abbonamenti. Additivo/idempotente per natura degli eventi
// (uno stesso evento riapplicato porta allo stesso stato). Invalida la cache entitlements della
// società toccata così il cambio vale subito. Ritorna { handled }.
async function applyEvent(event) {
  const type = event && event.type;

  if (type === 'checkout.session.completed') {
    const s = event.data.object;
    const companyId = Number((s.metadata && s.metadata.companyId) || s.client_reference_id);
    const planId = Number(s.metadata && s.metadata.planId);
    if (Number.isInteger(companyId) && Number.isInteger(planId)) {
      const externalRef = s.subscription || s.id || null;
      const { rowCount } = await pool.query(
        `UPDATE company_subscriptions
            SET plan_id = $1, status = 'active', external_ref = $2, updated_at = NOW()
          WHERE company_id = $3`,
        [planId, externalRef, companyId]
      );
      if (rowCount > 0) {
        entitlements.invalidate(companyId);
        return { handled: true };
      }
    }
    return { handled: false };
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const status = mapStripeStatus(type, sub.status);
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
    const { rows } = await pool.query('SELECT company_id FROM company_subscriptions WHERE external_ref = $1', [sub.id]);
    if (rows[0]) {
      await pool.query(
        'UPDATE company_subscriptions SET status = $1, current_period_end = $2, updated_at = NOW() WHERE company_id = $3',
        [status, periodEnd, rows[0].company_id]
      );
      entitlements.invalidate(rows[0].company_id);
      return { handled: true };
    }
    return { handled: false };
  }

  // Evento non gestito: risposta 200 comunque (il provider non deve ritentare all'infinito).
  return { handled: false };
}

module.exports = { isEnabled, isLive, createCheckoutSession, constructEvent, applyEvent };
