// ============================================================================
// Harness di regressione: enforcement limiti, feature gating, permessi granulari (layer SaaS)
// ============================================================================
// Verifica end-to-end il "sistema configurabile" (Step 2–5): i valori restano dati (nessun limite
// commerciale nel codice), ma i MECCANISMI devono funzionare. Crea una società di test, le assegna
// un piano con override mirati (via Super Admin), e verifica che limiti/feature/permessi rispondano.
// Cleanup finale (CASCADE). Esce != 0 se una sola asserzione fallisce.
//
// Uso: npm run test:saas   (DB locale/dev).

require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');

const JWT_SECRET = process.env.JWT_SECRET;
const SUFFIX = `saas-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) { passed += 1; console.log(`  ✓ ${label}`); }
  else { failed += 1; console.error(`  ✗ ${label}`); }
}

function sign(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, companyId: user.company_id, type: 'session' },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

async function mkUser(companyId, role, tag) {
  const { rows } = await pool.query(
    `INSERT INTO users (username, email, phone, role, company_id, must_change_password)
     VALUES ($1, $2, '000', $3, $4, FALSE) RETURNING *`,
    [`${role}-${tag}-${SUFFIX}`, `${role}-${tag}-${SUFFIX}@example.test`, role, companyId]
  );
  return rows[0];
}

async function main() {
  if (!JWT_SECRET) { console.error('JWT_SECRET non impostato'); process.exit(1); }
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, path, token, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let json = null; try { json = await res.json(); } catch { /* 204 */ }
    return { status: res.status, json };
  };

  let companyA, companyB, superUser;
  try {
    // --- Setup: società A (dirigente + admin + sede + area, nessun dipendente iniziale) e B ---
    const mkCompany = async (tag) => {
      const { rows } = await pool.query(
        `INSERT INTO companies (name, is_active, is_demo) VALUES ($1, TRUE, FALSE) RETURNING *`,
        [`SAAS Test ${tag} ${SUFFIX}`]
      );
      return rows[0];
    };
    companyA = await mkCompany('A');
    companyB = await mkCompany('B');
    const dirA = await mkUser(companyA.id, 'dirigente', 'A');
    const adminA = await mkUser(companyA.id, 'admin', 'A');
    const dirB = await mkUser(companyB.id, 'dirigente', 'B');
    const adminB = await mkUser(companyB.id, 'admin', 'B');
    const { rows: sedeRows } = await pool.query(`INSERT INTO sedi (company_id, name) VALUES ($1, 'S') RETURNING *`, [companyA.id]);
    const { rows: areaRows } = await pool.query(`INSERT INTO operational_areas (company_id, sede_id, name) VALUES ($1, $2, 'Ar') RETURNING *`, [companyA.id, sedeRows[0].id]);
    const areaA = areaRows[0];
    const dirAToken = sign(dirA);
    const adminAToken = sign(adminA);

    const { rows: suRows } = await pool.query(
      `INSERT INTO users (username, email, phone, role, must_change_password) VALUES ($1, $2, '000', 'superadmin', FALSE) RETURNING *`,
      [`super-${SUFFIX}`, `super-${SUFFIX}@example.test`]
    );
    superUser = suRows[0];
    const superToken = sign(superUser);

    const plans = (await call('GET', '/api/plans', superToken)).json.plans;
    const starterId = plans.find((p) => p.code === 'starter').id;
    const assignA = (body) => call('PUT', `/api/plans/subscriptions/${companyA.id}`, superToken, { planId: starterId, ...body });
    const newEmployee = (n) => call('POST', '/api/users', dirAToken, { username: `emp${n}-${SUFFIX}`, email: `emp${n}-${SUFFIX}@example.test`, phone: '000', role: 'user', areaIds: [areaA.id] });

    console.log('\n== 1) Catalogo configurabile (Super Admin) ==');
    const cat = await call('GET', '/api/plans/catalog', superToken);
    assert(cat.status === 200 && cat.json.limits.maxEmployees && cat.json.features.reports, 'GET /api/plans/catalog espone chiavi limiti+feature');
    assert((await call('GET', '/api/plans/catalog', dirAToken)).status === 403, 'catalogo negato ai non-super-admin');

    console.log('\n== 2) Enforcement limiti (configurabile, no-op se non impostato) ==');
    // Nessun limite impostato ⇒ creazione libera.
    assert((await assignA({ limitOverrides: {}, featureOverrides: {} })).status === 200, 'assegnato piano starter (nessun limite)');
    assert((await newEmployee('free')).status === 201, 'senza limite: creazione dipendente consentita');
    // Ora impongo maxEmployees = 2 (la società ha già 1 dipendente creato sopra).
    assert((await assignA({ limitOverrides: { maxEmployees: 2 } })).status === 200, 'impostato maxEmployees=2');
    assert((await newEmployee('2')).status === 201, '2° dipendente (entro il limite) consentito');
    const over = await newEmployee('3');
    assert(over.status === 403 && over.json.code === 'PLAN_LIMIT', '3° dipendente oltre il limite → 403 PLAN_LIMIT');
    // Alzando il limite si sblocca subito (cache invalidata).
    assert((await assignA({ limitOverrides: { maxEmployees: 10 } })).status === 200, 'alzato maxEmployees=10');
    assert((await newEmployee('4')).status === 201, 'dopo l’aumento: creazione di nuovo consentita');

    console.log('\n== 3) Feature gating (configurabile, default abilitato) ==');
    assert((await assignA({ limitOverrides: {}, featureOverrides: {} })).status === 200, 'reset override');
    assert((await call('GET', '/api/reports/employees', dirAToken)).status === 200, 'feature reports abilitata di default → 200');
    assert((await assignA({ featureOverrides: { reports: false } })).status === 200, 'disattivato reports sul piano');
    const rep = await call('GET', '/api/reports/employees', dirAToken);
    assert(rep.status === 403 && rep.json.code === 'PLAN_FEATURE', 'reports disattivato → 403 PLAN_FEATURE');
    assert((await assignA({ featureOverrides: { reports: true } })).status === 200, 'riattivato reports');
    assert((await call('GET', '/api/reports/employees', dirAToken)).status === 200, 'reports riattivato → 200');

    console.log('\n== 4) Permessi granulari + override (RBAC) ==');
    const FAKE = 999999999;
    // Default: il responsabile A può approvare cancellazioni (non 403: la richiesta finta dà 404).
    const beforeRevoke = await call('POST', `/api/cancellation-requests/${FAKE}/approve`, adminAToken);
    assert(beforeRevoke.status !== 403, 'default: responsabile può approvare (middleware passa, id finto → non 403)');

    // GET permessi del responsabile (Dirigente).
    const permView = await call('GET', `/api/users/${adminA.id}/permissions`, dirAToken);
    const permRow = (permView.json.permissions || []).find((p) => p.key === 'cancellations.approve');
    assert(permView.status === 200 && permRow && permRow.default === true && permRow.effective === true && permRow.override === null, 'GET permessi: default+effective true, nessun override');

    // Revoca l'approvazione al solo responsabile A.
    assert((await call('PUT', `/api/users/${adminA.id}/permissions`, dirAToken, { overrides: { 'cancellations.approve': false } })).status === 200, 'revoca cancellations.approve al responsabile');
    const afterRevoke = await call('POST', `/api/cancellation-requests/${FAKE}/approve`, adminAToken);
    assert(afterRevoke.status === 403 && afterRevoke.json.code === 'PERMISSION_DENIED', 'dopo revoca: responsabile → 403 PERMISSION_DENIED');
    const permView2 = await call('GET', `/api/users/${adminA.id}/permissions`, dirAToken);
    assert((permView2.json.permissions.find((p) => p.key === 'cancellations.approve')).effective === false, 'GET permessi riflette effective=false');

    // Ripristino (override null = torna al default).
    assert((await call('PUT', `/api/users/${adminA.id}/permissions`, dirAToken, { overrides: { 'cancellations.approve': null } })).status === 200, 'rimosso override (torna al default)');
    assert((await call('POST', `/api/cancellation-requests/${FAKE}/approve`, adminAToken)).status !== 403, 'dopo ripristino: responsabile di nuovo autorizzato');

    // Il Dirigente NON è soggetto a override (pavimento di sicurezza): mantiene sempre l'approvazione.
    assert((await call('POST', `/api/cancellation-requests/${FAKE}/approve`, dirAToken)).status !== 403, 'il Dirigente mantiene sempre l’approvazione');

    console.log('\n== 5) Guardie RBAC: ruolo, isolamento, validazione ==');
    assert((await call('PUT', `/api/users/${adminA.id}/permissions`, adminAToken, { overrides: {} })).status === 403, 'un responsabile non può modificare i permessi (requireDirigente)');
    assert((await call('GET', `/api/users/${adminB.id}/permissions`, dirAToken)).status === 404, 'Dirigente A non vede i permessi di un utente di B (404)');
    assert((await call('GET', `/api/users/${dirB.id}/permissions`, dirAToken)).status === 404, 'utente di altra società → 404 anche se dirigente');
    assert((await call('PUT', `/api/users/${adminA.id}/permissions`, dirAToken, { overrides: { 'chiave.inesistente': true } })).status === 400, 'chiave permesso sconosciuta → 400');
    assert((await call('PUT', `/api/users/${adminA.id}/permissions`, dirAToken, { overrides: { 'cancellations.approve': 'x' } })).status === 400, 'valore override non booleano/null → 400');
  } finally {
    if (companyA) await pool.query('DELETE FROM companies WHERE id = $1', [companyA.id]);
    if (companyB) await pool.query('DELETE FROM companies WHERE id = $1', [companyB.id]);
    if (superUser) await pool.query('DELETE FROM users WHERE id = $1', [superUser.id]);
    await new Promise((r) => server.close(r));
    await pool.end();
  }

  console.log(`\n=== Risultato: ${passed} passate, ${failed} fallite ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Errore harness:', err); process.exit(1); });
