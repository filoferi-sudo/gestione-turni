// ============================================================================
// Harness di regressione: isolamento multi-tenant tra società (layer sicurezza SaaS)
// ============================================================================
// Rete di sicurezza automatica (richiesta esplicita: "test automatici cross-tenant, verifica
// isolamento tra aziende"). Crea DUE società di test isolate, poi verifica sistematicamente che un
// utente di una società NON possa vedere né toccare i dati dell'altra (atteso 404 cross-tenant, per
// convenzione del progetto: non si rivela l'esistenza di risorse altrui). Verifica anche il nuovo
// layer piani/entitlements end-to-end. Al termine rimuove tutti i dati di test (CASCADE).
//
// Uso: npm run test:isolation   (DB locale/dev; NON tocca dati reali oltre a crearne/rimuoverne di
// propri, prefissati `iso-test-`). Esce con codice != 0 se una sola asserzione fallisce.
//
// Estendibile: aggiungere un probe = una riga nell'array `probes` (o un blocco assert). Man mano che
// si aggiungono endpoint scoped per società, aggiungere qui la relativa verifica cross-tenant.

require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');
const entitlements = require('../src/services/entitlements');

const JWT_SECRET = process.env.JWT_SECRET;
const SUFFIX = `iso-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

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

// Crea una società di test completa (dirigente + dipendente + sede + area) via SQL diretto.
async function createTenant(tag) {
  const { rows: cRows } = await pool.query(
    `INSERT INTO companies (name, is_active, is_demo) VALUES ($1, TRUE, FALSE) RETURNING *`,
    [`ISO Test ${tag} ${SUFFIX}`]
  );
  const company = cRows[0];

  const mkUser = async (role) => {
    const { rows } = await pool.query(
      `INSERT INTO users (username, email, phone, role, company_id, must_change_password)
       VALUES ($1, $2, '000', $3, $4, FALSE) RETURNING *`,
      [`${role}-${tag}-${SUFFIX}`, `${role}-${tag}-${SUFFIX}@example.test`, role, company.id]
    );
    return rows[0];
  };
  const dirigente = await mkUser('dirigente');
  const employee = await mkUser('user');

  const { rows: sRows } = await pool.query(
    `INSERT INTO sedi (company_id, name) VALUES ($1, $2) RETURNING *`,
    [company.id, `Sede ${tag}`]
  );
  const sede = sRows[0];
  const { rows: aRows } = await pool.query(
    `INSERT INTO operational_areas (company_id, sede_id, name) VALUES ($1, $2, $3) RETURNING *`,
    [company.id, sede.id, `Area ${tag}`]
  );
  const area = aRows[0];
  await pool.query('INSERT INTO user_areas (user_id, area_id) VALUES ($1, $2)', [employee.id, area.id]);

  return { company, dirigente, employee, sede, area, token: sign(dirigente) };
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
    let json = null;
    try { json = await res.json(); } catch { /* 204 ecc. */ }
    return { status: res.status, json };
  };

  let A, B, superToken, superUser;
  try {
    A = await createTenant('A');
    B = await createTenant('B');

    // Super admin temporaneo (company_id NULL) per i test del layer piani.
    const { rows: suRows } = await pool.query(
      `INSERT INTO users (username, email, phone, role, must_change_password)
       VALUES ($1, $2, '000', 'superadmin', FALSE) RETURNING *`,
      [`super-${SUFFIX}`, `super-${SUFFIX}@example.test`]
    );
    superUser = suRows[0];
    superToken = sign(superUser);

    console.log('\n== 1) Isolamento cross-tenant: A non deve vedere/toccare i dati di B ==');

    // Liste scoped: A vede i propri utenti, non quelli di B.
    const usersA = await call('GET', '/api/users', A.token);
    assert(usersA.status === 200, 'GET /api/users (A) → 200');
    const idsA = (usersA.json.users || []).map((u) => u.id);
    assert(idsA.includes(A.employee.id), 'A vede il proprio dipendente');
    assert(!idsA.includes(B.employee.id), 'A NON vede il dipendente di B');

    // Mutazioni cross-tenant sugli utenti di B → 404 (non si rivela l'esistenza).
    assert((await call('POST', `/api/users/${B.employee.id}/reset-password`, A.token, { newPassword: 'Xx1!xxxxxx' })).status === 404, 'reset-password su utente di B → 404');
    assert((await call('PUT', `/api/users/${B.employee.id}/areas`, A.token, { areaIds: [] })).status === 404, 'update-areas su utente di B → 404');
    assert((await call('DELETE', `/api/users/${B.employee.id}`, A.token)).status === 404, 'delete utente di B → 404');
    assert((await call('GET', `/api/users/${B.employee.id}/contract`, A.token)).status === 404, 'GET contratto utente di B → 404');

    // Sedi/aree scoped.
    const sediA = await call('GET', '/api/sedi', A.token);
    const sedeIdsA = (sediA.json.sedi || []).map((s) => s.id);
    assert(sedeIdsA.includes(A.sede.id) && !sedeIdsA.includes(B.sede.id), 'GET /api/sedi (A) contiene solo la sede di A');
    assert((await call('PUT', `/api/sedi/${B.sede.id}`, A.token, { name: 'hack' })).status === 404, 'update sede di B → 404');
    assert((await call('GET', `/api/sedi/${B.sede.id}/areas`, A.token)).status === 404, 'GET aree della sede di B → 404');

    console.log('\n== 2) Endpoint del layer piani: scoping di ruolo ==');
    assert((await call('GET', '/api/plans', A.token)).status === 403, 'GET /api/plans come dirigente → 403 (solo super admin)');
    const plansSuper = await call('GET', '/api/plans', superToken);
    assert(plansSuper.status === 200 && (plansSuper.json.plans || []).some((p) => p.code === 'legacy'), 'GET /api/plans come super admin → 200 con piano legacy');
    const subSuper = await call('GET', `/api/plans/subscriptions/${A.company.id}`, superToken);
    assert(subSuper.status === 200 && subSuper.json.usage && typeof subSuper.json.usage.employees === 'number', 'GET subscription di A come super admin → 200 con usage');

    console.log('\n== 3) Entitlements end-to-end (assegnazione piano → effetto immediato) ==');
    const entBefore = await call('GET', '/api/company/entitlements', A.token);
    assert(entBefore.status === 200 && entBefore.json.entitlements.features.reports !== false, 'A (nessun override) → feature reports abilitata di default');

    // Super admin assegna a A il piano starter con override limite+feature.
    const planId = plansSuper.json.plans.find((p) => p.code === 'starter').id;
    const setRes = await call('PUT', `/api/plans/subscriptions/${A.company.id}`, superToken, {
      planId, limitOverrides: { maxEmployees: 3 }, featureOverrides: { reports: false },
    });
    assert(setRes.status === 200, 'PUT subscription (A → starter + override) → 200');

    const entAfter = await call('GET', '/api/company/entitlements', A.token);
    assert(entAfter.status === 200, 'GET entitlements (A) dopo assegnazione → 200');
    assert(entAfter.json.entitlements.limits.maxEmployees === 3, 'override limite maxEmployees=3 visibile subito (cache invalidata)');
    assert(entAfter.json.entitlements.features.reports === false, 'override feature reports=false visibile subito');
    assert(entAfter.json.entitlements.planCode === 'starter', 'planCode aggiornato a starter');

    // L'assegnazione a A non deve intaccare B.
    const entB = await call('GET', '/api/company/entitlements', B.token);
    assert(entB.json.entitlements.features.reports !== false, "il piano di A non tocca gli entitlements di B");

    console.log('\n== 4) Semantica del service entitlements (unit) ==');
    assert(entitlements.limitFor({ limits: { maxEmployees: 5 } }, 'maxEmployees') === 5, 'limitFor legge il numero');
    assert(entitlements.limitFor({ limits: {} }, 'maxEmployees') === null, 'limitFor assente → null (illimitato)');
    assert(entitlements.limitFor({ limits: { maxEmployees: null } }, 'maxEmployees') === null, 'limitFor null → illimitato');
    assert(entitlements.isFeatureEnabled({ features: {} }, 'reports') === true, 'feature assente → abilitata (default permissivo)');
    assert(entitlements.isFeatureEnabled({ features: { reports: false } }, 'reports') === false, 'feature false → negata');
  } finally {
    // Cleanup: le due società di test (CASCADE su users/sedi/aree/subscription) + il super admin temporaneo.
    if (A) await pool.query('DELETE FROM companies WHERE id = $1', [A.company.id]);
    if (B) await pool.query('DELETE FROM companies WHERE id = $1', [B.company.id]);
    if (superUser) await pool.query('DELETE FROM users WHERE id = $1', [superUser.id]);
    await new Promise((r) => server.close(r));
    await pool.end();
  }

  console.log(`\n=== Risultato: ${passed} passate, ${failed} fallite ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => { console.error('Errore harness:', err); process.exit(1); });
