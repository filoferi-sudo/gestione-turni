const pool = require('../config/db');
const billingService = require('../services/billing/billingService');
const entitlements = require('../services/entitlements');
const audit = require('../services/auditService');

// ============================================================================
// Billing (Step 8) — endpoint pagamenti. Spento di default (config/billing).
// ============================================================================

// GET /api/billing/status (authenticate) — il frontend decide se mostrare la UI di abbonamento.
async function getStatus(req, res) {
  const ent = await entitlements.getEntitlements(req.user.companyId);
  return res.json({
    enabled: billingService.isEnabled(),
    live: billingService.isLive(),
    planCode: ent.planCode,
    planName: ent.planName,
    status: ent.status,
  });
}

// GET /api/billing/plans (authenticate) — piani PUBBLICI attivi, per l'upgrade lato Dirigente
// (endpoint tenant: NON espone limiti/feature di dettaglio né i piani interni/legacy).
async function listPublicPlans(req, res) {
  const { rows } = await pool.query(
    `SELECT id, code, name, description, external_price_ref
       FROM plans WHERE is_public = TRUE AND is_active = TRUE
      ORDER BY display_order, id`
  );
  return res.json({
    plans: rows.map((p) => ({ id: p.id, code: p.code, name: p.name, description: p.description, hasPrice: !!p.external_price_ref })),
  });
}

// POST /api/billing/checkout (requireDirigente) — crea la sessione di pagamento per un piano.
async function createCheckout(req, res) {
  if (!billingService.isEnabled()) return res.status(404).json({ error: 'Pagamenti non attivi' });
  const planId = Number(req.body.planId);
  if (!Number.isInteger(planId)) return res.status(400).json({ error: 'planId è obbligatorio' });
  try {
    const session = await billingService.createCheckoutSession({ companyId: req.user.companyId, planId });
    await audit.logFromReq(req, { action: 'billing.checkout', entityType: 'company', entityId: req.user.companyId, metadata: { planId, stub: !!session.stub } });
    return res.json({ url: session.url });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message });
  }
}

// POST /api/billing/webhook (PUBBLICO, corpo grezzo) — verifica la firma del provider e sincronizza
// l'abbonamento. La sicurezza è nella firma: nessuna sessione, nessun ruolo. Corpo raw montato in
// app.js (express.raw prima di express.json), necessario per la verifica HMAC.
async function webhook(req, res) {
  if (!billingService.isEnabled()) return res.status(404).json({ error: 'Pagamenti non attivi' });
  let event;
  try {
    event = billingService.constructEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    return res.status(400).json({ error: `Webhook non valido: ${err.message}` });
  }
  try {
    const { handled } = await billingService.applyEvent(event);
    return res.json({ received: true, handled });
  } catch (err) {
    console.error('[billing] elaborazione evento fallita:', err.message);
    return res.status(500).json({ error: 'Errore elaborazione evento' });
  }
}

module.exports = { getStatus, listPublicPlans, createCheckout, webhook };
