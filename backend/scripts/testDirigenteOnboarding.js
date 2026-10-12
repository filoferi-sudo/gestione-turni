// ============================================================================
// Harness di regressione: onboarding del primo dirigente di una società
// ============================================================================
// Copre il flusso completo Super Admin → società → primo dirigente → primo accesso con codice
// iniziale → password personale → creazione del responsabile, più i casi d'errore (duplicati,
// credenziali errate, codice perso/rigenerato, account bloccato, accessi cross-società).
//
// Uso: npm run test:onboarding   (DB locale/dev; crea solo dati propri prefissati `onb-test-` e li
// rimuove al termine). Esce con codice != 0 se una sola asserzione fallisce.

require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('../src/config/db');
const app = require('../src/app');
const { login: loginConfig } = require('../src/config/security');

const JWT_SECRET = process.env.JWT_SECRET;
const SUFFIX = `onb-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const PASSWORD = 'Pianificazione#2026x';

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
    { expiresIn: '1h' }
  );
}

async function main() {
  if (!JWT_SECRET) { console.error('JWT_SECRET non impostato'); process.exit(1); }

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const call = async (method, path, body, token) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };

  // Super admin di test dedicato (company_id NULL), rimosso al termine.
  const { rows: [sa] } = await pool.query(
    `INSERT INTO users (username, email, role, company_id, must_change_password)
     VALUES ($1, $2, 'superadmin', NULL, FALSE) RETURNING *`,
    [`sa-${SUFFIX}`, `sa-${SUFFIX}@example.test`]
  );
  const saToken = sign(sa);
  const companyIds = [];
  const extraUserIds = [sa.id];

  try {
    console.log('1. Creazione società + primo dirigente');
    const c = await call('POST', '/companies', { name: `Onboarding ${SUFFIX}` }, saToken);
    assert(c.status === 201 && c.data.company && c.data.company.id, 'società creata');
    const companyId = c.data.company.id;
    companyIds.push(companyId);

    const username = `dir-${SUFFIX}`;
    const d = await call('POST', `/companies/${companyId}/dirigente`, { username: `  ${username} `, email: `${username}@example.test `, phone: '000' }, saToken);
    assert(d.status === 201, 'dirigente creato (201)');
    assert(d.data.user && d.data.user.username === username, 'username normalizzato (spazi rimossi)');
    assert(d.data.user.role === 'dirigente' && d.data.user.companyId === companyId, 'ruolo dirigente e società corretta');
    assert(d.data.user.status === 'pending_first_access', 'stato: in attesa del primo accesso');
    assert(typeof d.data.initialCode === 'string' && d.data.initialCode.length >= 6, 'codice iniziale restituito');
    assert(d.data.company && d.data.company.name === `Onboarding ${SUFFIX}`, 'nome società nella risposta');
    assert(!('password_hash' in d.data.user) && !('initial_code' in d.data.user) && !('initialCode' in d.data.user), 'nessun segreto nella vista utente');
    const dirigenteId = d.data.user.id;

    console.log('2-3. Primo accesso con codice + impostazione password');
    const bad = await call('POST', '/auth/login', { username, password: 'XXXXXX' });
    assert(bad.status === 401, 'codice errato rifiutato (401)');
    const l1 = await call('POST', '/auth/login', { username, password: d.data.initialCode });
    assert(l1.status === 200 && l1.data.firstAccess === true && l1.data.firstAccessToken, 'login con codice → primo accesso');
    const setup = await call('POST', '/auth/first-login-setup', { newPassword: PASSWORD }, l1.data.firstAccessToken);
    assert(setup.status === 200 && setup.data.token, 'password personale impostata');
    const reuse = await call('POST', '/auth/login', { username, password: d.data.initialCode });
    assert(reuse.status === 401, 'codice iniziale non più valido dopo il primo accesso');

    console.log('4. Login con password + dashboard dirigente');
    const l2 = await call('POST', '/auth/login', { username, password: PASSWORD });
    assert(l2.status === 200 && l2.data.token && l2.data.firstAccess === false, 'login con password');
    const dirToken = l2.data.token;
    const me = await call('GET', '/auth/me', null, dirToken);
    assert(me.status === 200 && me.data.user.role === 'dirigente' && me.data.user.companyId === companyId, '/auth/me: dirigente della società giusta');

    console.log('9. Credenziali errate');
    const wrong = await call('POST', '/auth/login', { username, password: 'Sbagliata#2026x' });
    assert(wrong.status === 401, 'password errata rifiutata (401)');

    console.log('5. Il dirigente crea il responsabile');
    const r = await call('POST', '/users', { username: `resp-${SUFFIX}`, email: `resp-${SUFFIX}@example.test`, phone: '000', role: 'admin' }, dirToken);
    assert(r.status === 201 && r.data.user.role === 'admin' && r.data.user.companyId === companyId, 'responsabile creato nella stessa società');
    assert(typeof r.data.initialCode === 'string', 'codice iniziale del responsabile restituito');
    const rl = await call('POST', '/auth/login', { username: `resp-${SUFFIX}`, password: r.data.initialCode });
    assert(rl.status === 200 && rl.data.firstAccess === true, 'il responsabile può fare il primo accesso');
    const up = await call('POST', '/users', { username: `x-${SUFFIX}`, email: `x-${SUFFIX}@example.test`, phone: '000', role: 'dirigente' }, dirToken);
    assert(up.status === 400, 'il dirigente non può creare altri dirigenti via /users');
    const respLogin = await call('POST', '/auth/first-login-setup', { newPassword: PASSWORD }, rl.data.firstAccessToken);
    const respToken = respLogin.data.token;
    const respUp = await call('POST', '/users', { username: `y-${SUFFIX}`, email: `y-${SUFFIX}@example.test`, phone: '000', role: 'admin' }, respToken);
    assert(respUp.status === 403, 'il responsabile non può creare responsabili');

    console.log('6. Email/username già esistenti');
    const dupU = await call('POST', `/companies/${companyId}/dirigente`, { username, email: `other-${SUFFIX}@example.test`, phone: '000' }, saToken);
    const dupE = await call('POST', `/companies/${companyId}/dirigente`, { username: `other-${SUFFIX}`, email: `${username}@example.test`, phone: '000' }, saToken);
    assert(dupU.status === 409 && dupE.status === 409, 'conflitto username/email → 409');
    const { rows: cnt } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE company_id = $1 AND role = 'dirigente'", [companyId]);
    assert(cnt[0].n === 1, 'nessun dirigente duplicato');

    console.log('8. Doppio invio concorrente');
    const twin = { username: `twin-${SUFFIX}`, email: `twin-${SUFFIX}@example.test`, phone: '000' };
    const [t1, t2] = await Promise.all([
      call('POST', `/companies/${companyId}/dirigente`, twin, saToken),
      call('POST', `/companies/${companyId}/dirigente`, twin, saToken),
    ]);
    assert([t1.status, t2.status].sort().join() === '201,409', 'un solo account creato, l\'altro 409 (non 500)');
    const { rows: twinRows } = await pool.query('SELECT COUNT(*)::int AS n FROM users WHERE username = $1', [twin.username]);
    assert(twinRows[0].n === 1, 'un solo record nel DB');
    const missing = await call('POST', `/companies/${companyId}/dirigente`, { username: `m-${SUFFIX}`, email: '', phone: '000' }, saToken);
    assert(missing.status === 400, 'campi mancanti → 400, nessun account');

    console.log('7. Recupero: elenco dirigenti + codice perso/account bloccato');
    const list = await call('GET', `/companies/${companyId}/dirigenti`, null, saToken);
    assert(list.status === 200 && list.data.dirigenti.length === 2, 'elenco dirigenti della società');
    const twinD = list.data.dirigenti.find((x) => x.username === twin.username);
    const mainD = list.data.dirigenti.find((x) => x.id === dirigenteId);
    assert(twinD.status === 'pending_first_access' && mainD.status === 'active', 'stati di attivazione corretti');
    assert(list.data.dirigenti.every((x) => !('initialCode' in x) && !('password_hash' in x)), 'elenco senza codici né hash');

    // Il dirigente "twin" ha perso il codice e si è bloccato provando codici sbagliati.
    for (let i = 0; i < loginConfig.maxAttempts; i += 1) await call('POST', '/auth/login', { username: twin.username, password: 'ZZZZZZ' });
    const locked = await call('POST', '/auth/login', { username: twin.username, password: 'ZZZZZZ' });
    assert(locked.status === 429, 'account bloccato dopo troppi tentativi');
    const regen = await call('POST', `/companies/${companyId}/dirigenti/${twinD.id}/regenerate-code`, null, saToken);
    assert(regen.status === 200 && regen.data.initialCode && regen.data.user.status === 'pending_first_access', 'nuovo codice generato');
    const afterRegen = await call('POST', '/auth/login', { username: twin.username, password: regen.data.initialCode });
    assert(afterRegen.status === 200 && afterRegen.data.firstAccess === true, 'nuovo codice funziona subito (blocco rimosso)');

    console.log('10. Isolamento: società non autorizzate');
    const c2 = await call('POST', '/companies', { name: `Onboarding B ${SUFFIX}` }, saToken);
    companyIds.push(c2.data.company.id);
    const cross = await call('POST', `/companies/${c2.data.company.id}/dirigenti/${twinD.id}/regenerate-code`, null, saToken);
    assert(cross.status === 404, 'rigenerazione con società sbagliata → 404');
    const notDir = await call('POST', `/companies/${companyId}/dirigenti/${r.data.user.id}/regenerate-code`, null, saToken);
    assert(notDir.status === 404, 'rigenerazione su un non-dirigente → 404');
    const dirOnCompanies = await call('GET', `/companies/${companyId}/dirigenti`, null, dirToken);
    const dirRegen = await call('POST', `/companies/${c2.data.company.id}/dirigente`, { username: `z-${SUFFIX}`, email: `z-${SUFFIX}@example.test`, phone: '000' }, dirToken);
    assert(dirOnCompanies.status === 403 && dirRegen.status === 403, 'un dirigente non accede agli endpoint di piattaforma (403)');
    const crossDelete = await call('DELETE', `/users/${sa.id}`, null, dirToken);
    assert(crossDelete.status === 404, 'un dirigente non tocca utenti fuori dalla propria società');
  } finally {
    for (const id of companyIds) await pool.query('DELETE FROM companies WHERE id = $1', [id]);
    await pool.query('DELETE FROM users WHERE id = ANY($1::int[])', [extraUserIds]);
    server.close();
    await pool.end();
  }

  console.log(`\n${passed} superati, ${failed} falliti`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
