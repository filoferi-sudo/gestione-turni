// ============================================================================
// Harness billing (Step 8) — checkout stub + webhook firmato + sync abbonamento
// ============================================================================
// Verifica la PREDISPOSIZIONE pagamenti senza account Stripe reale: abilita il billing via env nel
// solo processo di test (nessuna chiave segreta ⇒ checkout in modalità segnaposto), poi firma
// localmente eventi webhook con lo stesso schema HMAC di Stripe e verifica la sincronizzazione degli
// abbonamenti. Cleanup finale. Esce != 0 se una sola asserzione fallisce.
//
// Uso: npm run test:billing   (DB locale/dev, nessun addebito reale).

// Env PRIMA di require('../src/app'): abilita il billing e imposta il webhook secret. Niente
// STRIPE_SECRET_KEY ⇒ non "live" ⇒ il checkout ritorna un URL segnaposto (nessuna chiamata a Stripe).
process.env.BILLING_ENABLED = 'true';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_for_harness_only';
process.env.BILLING_SUCCESS_URL = 'http://example.test/ok';

require('dotenv').config();
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET;
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const SUFFIX = `bill-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let passed = 0, failed = 0;
function assert(cond, label) {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label}`); }
}

function signWebhook(payloadStr, t = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${t}.${payloadStr}`).digest('hex');
  return `t=${t},v1=${sig}`;
}

async function main() {
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, { token, body, rawBody, headers } = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { ...(rawBody === undefined ? { 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(headers || {}) },
      body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
    });
    let json = null; try { json = await res.json(); } catch { /* */ }
    return { status: res.status, json };
  };
  const webhook = (payloadStr, signature) => call('POST', '/api/billing/webhook', { rawBody: payloadStr, headers: { 'Stripe-Signature': signature } });

  let company, targetPlan, dirToken;
  try {
    const { rows: cRows } = await pool.query(`INSERT INTO companies (name, is_active, is_demo) VALUES ($1, TRUE, FALSE) RETURNING *`, [`Billing Test ${SUFFIX}`]);
    company = cRows[0];
    const { rows: dRows } = await pool.query(
      `INSERT INTO users (username, email, phone, role, company_id, must_change_password) VALUES ($1,$2,'000','dirigente',$3,FALSE) RETURNING *`,
      [`dir-${SUFFIX}`, `dir-${SUFFIX}@example.test`, company.id]
    );
    dirToken = jwt.sign({ id: dRows[0].id, username: dRows[0].username, role: 'dirigente', companyId: company.id, type: 'session' }, JWT_SECRET, { expiresIn: '8h' });
    const legacy = (await pool.query("SELECT id FROM plans WHERE code='legacy'")).rows[0].id;
    await pool.query(`INSERT INTO company_subscriptions (company_id, plan_id, status) VALUES ($1,$2,'active')`, [company.id, legacy]);
    const { rows: pRows } = await pool.query(
      `INSERT INTO plans (code, name, is_active, is_public, external_price_ref) VALUES ($1,'Billing Target',TRUE,TRUE,'price_test_123') RETURNING *`,
      [`billing-target-${SUFFIX}`]
    );
    targetPlan = pRows[0];

    console.log('\n== 1) Stato billing ==');
    const status = await call('GET', '/api/billing/status', { token: dirToken });
    assert(status.status === 200 && status.json.enabled === true && status.json.live === false, 'status: enabled=true, live=false (nessuna chiave Stripe)');
    const pubPlans = await call('GET', '/api/billing/plans', { token: dirToken });
    assert(pubPlans.status === 200 && pubPlans.json.plans.some((p) => p.id === targetPlan.id && p.hasPrice === true), 'plans pubblici: include il piano target con prezzo');

    console.log('\n== 2) Checkout (segnaposto, nessun addebito) ==');
    const checkout = await call('POST', '/api/billing/checkout', { token: dirToken, body: { planId: targetPlan.id } });
    assert(checkout.status === 200 && /stub=1/.test(checkout.json.url), 'checkout → URL segnaposto (stub)');
    assert((await call('POST', '/api/billing/checkout', { token: dirToken, body: {} })).status === 400, 'checkout senza planId → 400');

    console.log('\n== 3) Webhook: firma e sincronizzazione ==');
    // Firma mancante / errata → 400.
    assert((await call('POST', '/api/billing/webhook', { rawBody: '{}' })).status === 400, 'webhook senza firma → 400');
    assert((await webhook('{"type":"x"}', 't=1,v1=deadbeef')).status === 400, 'webhook con firma errata → 400');

    // checkout.session.completed → abbonamento passa al piano target, status active, external_ref salvato.
    const completed = JSON.stringify({ type: 'checkout.session.completed', data: { object: { metadata: { companyId: String(company.id), planId: String(targetPlan.id) }, subscription: 'sub_test_123', id: 'cs_test' } } });
    const wc = await webhook(completed, signWebhook(completed));
    assert(wc.status === 200 && wc.json.handled === true, 'checkout.session.completed → 200 handled');
    const afterComplete = (await pool.query('SELECT plan_id, status, external_ref FROM company_subscriptions WHERE company_id=$1', [company.id])).rows[0];
    assert(afterComplete.plan_id === targetPlan.id && afterComplete.status === 'active' && afterComplete.external_ref === 'sub_test_123', 'abbonamento sincronizzato: piano target + active + external_ref');

    // Entitlements riflettono subito il nuovo piano (cache invalidata dal webhook).
    const ent = await call('GET', '/api/company/entitlements', { token: dirToken });
    assert(ent.json.entitlements.planCode === targetPlan.code, 'entitlements aggiornati al piano target');

    // customer.subscription.updated → status past_due + period end.
    const periodEnd = Math.floor(Date.now() / 1000) + 86400;
    const updated = JSON.stringify({ type: 'customer.subscription.updated', data: { object: { id: 'sub_test_123', status: 'past_due', current_period_end: periodEnd } } });
    const wu = await webhook(updated, signWebhook(updated));
    assert(wu.status === 200 && wu.json.handled === true, 'customer.subscription.updated → 200 handled');
    const afterUpdate = (await pool.query('SELECT status, current_period_end FROM company_subscriptions WHERE company_id=$1', [company.id])).rows[0];
    assert(afterUpdate.status === 'past_due' && afterUpdate.current_period_end !== null, 'status past_due + current_period_end salvati');

    // customer.subscription.deleted → canceled.
    const deleted = JSON.stringify({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_test_123', status: 'canceled' } } });
    const wd = await webhook(deleted, signWebhook(deleted));
    assert(wd.status === 200 && wd.json.handled === true, 'customer.subscription.deleted → 200 handled');
    assert((await pool.query('SELECT status FROM company_subscriptions WHERE company_id=$1', [company.id])).rows[0].status === 'canceled', 'status canceled');

    // Evento sconosciuto → 200 handled=false (il provider non deve ritentare).
    const unknown = JSON.stringify({ type: 'invoice.paid', data: { object: {} } });
    const wun = await webhook(unknown, signWebhook(unknown));
    assert(wun.status === 200 && wun.json.handled === false, 'evento non gestito → 200 handled=false');

    console.log('\n== 4) Isolamento: solo il Dirigente può fare checkout ==');
    // (il checkout è requireDirigente; verificato che un token non-dirigente sia respinto)
    const empToken = jwt.sign({ id: 0, username: 'x', role: 'user', companyId: company.id, type: 'session' }, JWT_SECRET, { expiresIn: '8h' });
    assert((await call('POST', '/api/billing/checkout', { token: empToken, body: { planId: targetPlan.id } })).status === 403, 'checkout come dipendente → 403');
  } finally {
    if (company) await pool.query('DELETE FROM companies WHERE id=$1', [company.id]);
    if (targetPlan) await pool.query('DELETE FROM plans WHERE id=$1', [targetPlan.id]);
    await new Promise((r) => server.close(r));
    await pool.end();
  }

  console.log(`\n=== Risultato: ${passed} passate, ${failed} fallite ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Errore harness:', err); process.exit(1); });
