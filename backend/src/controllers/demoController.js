// Controller del dominio Demo Framework. Espone lo stato pubblico + ingresso demo (login per
// persona) e reset. Le azioni simulate dei tour si aggiungeranno qui in Fase D5.
const pool = require('../config/db');
const { isDemoEnabled } = require('../demo/framework/config');
const { getScenario, listScenarios } = require('../demo/framework/registry');
const { loadScenario } = require('../demo/framework/loader');
const { resetScenarioCompany } = require('../demo/framework/reset');
const { runAction, runCheck } = require('../demo/framework/simulations');
const { toSafeUserWithAreas, signSessionToken } = require('./authController');
const audit = require('../services/auditService');

// GET /api/demo/status — PUBBLICO (unico endpoint demo raggiungibile anche a modalità spenta: il
// frontend lo usa per decidere se mostrare il bottone "Prova la demo"). Nessun dato sensibile.
async function getStatus(req, res) {
  if (!isDemoEnabled()) {
    return res.json({ enabled: false });
  }
  const scenarios = listScenarios().map((s) => ({
    id: s.id,
    name: s.name,
    logoPlaceholder: s.logoPlaceholder || null,
    personas: (s.personas || []).map(({ key, label, description }) => ({ key, label, description })),
  }));
  res.json({ enabled: true, scenarios });
}

// Carica la riga utente (con is_demo della società) di una persona a partire dallo stato demo.
async function loadPersonaUser(state, personaKey) {
  const userId = state.personas && state.personas[personaKey];
  if (!userId) {
    const err = new Error(`Persona "${personaKey}" non trovata nello scenario`);
    err.status = 400;
    throw err;
  }
  const { rows } = await pool.query(
    `SELECT u.*, c.is_demo AS is_demo
       FROM users u LEFT JOIN companies c ON c.id = u.company_id
      WHERE u.id = $1`,
    [userId]
  );
  return rows[0] || null;
}

// Emette una sessione demo per la persona: garantisce un ambiente fresco (lazy load/re-anchor),
// poi firma un NORMALE JWT di sessione dell'utente-persona. La risposta ha la stessa forma di
// /api/auth/login, così middleware, controller e frontend funzionano identici (zero modifiche
// altrove). Il token è un session token standard: l'isolamento multi-tenant fa il resto.
async function demoLogin(req, res) {
  const scenarioId = req.body.scenarioId || 'ristorante';
  const personaKey = req.body.persona;
  let scenario;
  try {
    scenario = getScenario(scenarioId);
  } catch (err) {
    return res.status(400).json({ error: 'Scenario non valido' });
  }
  if (!personaKey || !scenario.personas.some((p) => p.key === personaKey)) {
    return res.status(400).json({ error: 'Persona non valida' });
  }

  const { state } = await loadScenario(scenarioId);
  const user = await loadPersonaUser(state, personaKey);
  if (!user) {
    return res.status(500).json({ error: 'Utente demo non disponibile' });
  }

  await audit.logAction({
    companyId: user.company_id, actorUserId: user.id, action: 'demo.login',
    ip: audit.ipFromReq(req), metadata: { scenario: scenarioId, persona: personaKey },
  });

  const token = signSessionToken(user);
  return res.json({ firstAccess: false, token, user: await toSafeUserWithAreas(user) });
}

// POST /api/demo/reset — reinizializza l'ambiente demo della PROPRIA società (guardia
// assertDemoCompany nella route). Gli id utente cambiano, quindi risponde con un token+user
// freschi per la stessa persona (il frontend fa loginWithToken e ricarica). Richiede la persona
// corrente nel body (il frontend la conosce dall'ingresso).
async function demoReset(req, res) {
  // Lo scenario è quello ospitato dalla società demo di chi chiama (già verificata is_demo dalla
  // guardia di route). Ricarica sempre forzando (richiesta esplicita di reinizializzazione).
  const { rows } = await pool.query(
    'SELECT scenario_id FROM demo_state WHERE company_id = $1', [req.user.companyId]
  );
  const scenarioId = rows[0] ? rows[0].scenario_id : 'ristorante';
  const { state: fresh } = await loadScenario(scenarioId, { force: true });

  // Persona: quella indicata dal frontend, o in fallback la prima persona col ruolo corrente.
  const scenario = getScenario(scenarioId);
  let personaKey = req.body.persona;
  if (!personaKey || !fresh.personas[personaKey]) {
    const match = scenario.personas.find((p) => p.role === req.user.role);
    personaKey = match ? match.key : scenario.personas[0].key;
  }
  const user = await loadPersonaUser(fresh, personaKey);

  await audit.logAction({
    companyId: user.company_id, actorUserId: user.id, action: 'demo.reset',
    ip: audit.ipFromReq(req), metadata: { scenario: scenarioId },
  });

  const token = signSessionToken(user);
  return res.json({ firstAccess: false, token, user: await toSafeUserWithAreas(user) });
}

// POST /api/demo/tour/actions/:name — esegue un'azione simulata di un tour (es. il collega che
// accetta la proposta). Scoped alla società demo di chi opera (guardie di route).
async function tourAction(req, res) {
  const result = await runAction(req.params.name, req.user.companyId);
  if (!result.ok) {
    return res.status(result.code || 400).json({ error: result.error });
  }
  return res.json({ ok: true, ...(result.data || {}) });
}

// GET /api/demo/tour/checks/:name — valuta un criterio di avanzamento del tour (sola lettura).
async function tourCheck(req, res) {
  const result = await runCheck(req.params.name, req.user.companyId);
  if (!result.found) {
    return res.status(404).json({ error: 'Criterio demo sconosciuto' });
  }
  return res.json({ satisfied: !!result.satisfied });
}

module.exports = { getStatus, demoLogin, demoReset, tourAction, tourCheck };
