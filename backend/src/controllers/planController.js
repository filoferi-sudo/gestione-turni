const pool = require('../config/db');
const entitlements = require('../services/entitlements');
const audit = require('../services/auditService');
const { LIMIT_KEYS, FEATURE_KEYS } = require('../config/planCatalog');

// ============================================================================
// Piani commerciali e abbonamenti — amministrazione di piattaforma (Super Admin)
// ============================================================================
// Gestione dei piani (plans) e dell'abbonamento di ciascuna società (company_subscriptions). È una
// funzione di PIATTAFORMA, riservata al Super Admin (rotte con requireSuperAdmin): coerente con la
// separazione dei ruoli del progetto — Super Admin = anagrafica/commerciale di piattaforma,
// Dirigente = regole aziendali, Responsabile = operatività.
//
// FILOSOFIA "zero valori hardcoded": limiti e feature dei piani sono dati modificabili qui a
// runtime, non costanti nel codice. Il codice conosce solo la SEMANTICA (services/entitlements.js),
// non i valori.

function toSafePlan(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    isActive: row.is_active,
    isPublic: row.is_public,
    displayOrder: row.display_order,
    limits: row.limits || {},
    features: row.features || {},
    externalPriceRef: row.external_price_ref || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    companiesCount: row.companies_count !== undefined ? Number(row.companies_count) : undefined,
  };
}

// I limiti sono una mappa { chiave: numero>=0 | null }. null = illimitato (come l'assenza di chiave).
// Rifiuta valori non numerici, negativi o strutture annidate: i dati sporchi renderebbero opaco
// l'enforcement.
function validateLimits(limits) {
  if (limits === undefined) return { ok: true, value: undefined };
  if (limits === null || typeof limits !== 'object' || Array.isArray(limits)) {
    return { ok: false, error: 'limits deve essere un oggetto { chiave: numero }' };
  }
  for (const [key, val] of Object.entries(limits)) {
    if (val === null) continue; // esplicitamente illimitato
    const n = Number(val);
    if (!Number.isInteger(n) || n < 0) {
      return { ok: false, error: `Limite "${key}" non valido: deve essere un intero >= 0 oppure null (illimitato)` };
    }
  }
  return { ok: true, value: limits };
}

// Le feature sono una mappa { chiave: bool }. Solo booleani: false = negata, true = concessa
// esplicitamente (l'assenza vale già come concessa, default permissivo).
function validateFeatures(features) {
  if (features === undefined) return { ok: true, value: undefined };
  if (features === null || typeof features !== 'object' || Array.isArray(features)) {
    return { ok: false, error: 'features deve essere un oggetto { chiave: booleano }' };
  }
  for (const [key, val] of Object.entries(features)) {
    if (typeof val !== 'boolean') {
      return { ok: false, error: `Feature "${key}" non valida: deve essere true o false` };
    }
  }
  return { ok: true, value: features };
}

// GET /api/plans/catalog (super admin) — vocabolario delle chiavi configurabili (limiti + feature),
// così la UI del Super Admin sa cosa può impostare in un piano senza replicare le chiavi nel
// frontend. Nessun valore commerciale: solo i nomi/etichette delle chiavi.
async function getCatalog(req, res) {
  return res.json({ limits: LIMIT_KEYS, features: FEATURE_KEYS });
}

// GET /api/plans (super admin) — elenco piani con quante società li usano.
async function listPlans(req, res) {
  const { rows } = await pool.query(
    `SELECT p.*, COUNT(s.id) AS companies_count
       FROM plans p
       LEFT JOIN company_subscriptions s ON s.plan_id = p.id
      GROUP BY p.id
      ORDER BY p.display_order, p.id`
  );
  return res.json({ plans: rows.map(toSafePlan) });
}

// POST /api/plans (super admin) — crea un nuovo piano. `code` è l'identificatore stabile (immutabile
// dopo la creazione). I valori commerciali (limits/features) sono opzionali: un piano nasce vuoto e
// si configura dopo.
async function createPlan(req, res) {
  const { code, name, description, isActive, isPublic, displayOrder, limits, features, externalPriceRef } = req.body;

  if (!code || !String(code).trim()) return res.status(400).json({ error: 'Il codice del piano è obbligatorio' });
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Il nome del piano è obbligatorio' });

  const normalizedCode = String(code).trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(normalizedCode)) {
    return res.status(400).json({ error: 'Il codice può contenere solo lettere minuscole, numeri, - e _' });
  }

  const limitsCheck = validateLimits(limits);
  if (!limitsCheck.ok) return res.status(400).json({ error: limitsCheck.error });
  const featuresCheck = validateFeatures(features);
  if (!featuresCheck.ok) return res.status(400).json({ error: featuresCheck.error });

  const existing = await pool.query('SELECT id FROM plans WHERE code = $1', [normalizedCode]);
  if (existing.rows.length > 0) return res.status(409).json({ error: 'Esiste già un piano con questo codice' });

  const { rows } = await pool.query(
    `INSERT INTO plans (code, name, description, is_active, is_public, display_order, limits, features, external_price_ref)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
     RETURNING *`,
    [
      normalizedCode,
      String(name).trim(),
      description || null,
      isActive !== undefined ? Boolean(isActive) : true,
      isPublic !== undefined ? Boolean(isPublic) : true,
      Number.isInteger(displayOrder) ? displayOrder : 0,
      JSON.stringify(limitsCheck.value || {}),
      JSON.stringify(featuresCheck.value || {}),
      externalPriceRef ? String(externalPriceRef).trim() : null,
    ]
  );

  await audit.logAction({ actorUserId: req.user.id, action: 'plan.create', entityType: 'plan', entityId: rows[0].id, metadata: { code: normalizedCode }, ip: audit.ipFromReq(req) });
  return res.status(201).json({ plan: toSafePlan(rows[0]) });
}

// PUT /api/plans/:id (super admin) — modifica un piano. Il `code` è immutabile (identificatore
// stabile referenziato altrove). Modificare limiti/feature cambia gli entitlements di TUTTE le
// società sul piano: si invalida l'intera cache.
async function updatePlan(req, res) {
  const { id } = req.params;
  const { name, description, isActive, isPublic, displayOrder, limits, features, externalPriceRef } = req.body;

  const { rows: existingRows } = await pool.query('SELECT * FROM plans WHERE id = $1', [id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ error: 'Piano non trovato' });

  const finalName = name !== undefined ? name : existing.name;
  if (!finalName || !String(finalName).trim()) return res.status(400).json({ error: 'Il nome del piano è obbligatorio' });

  const limitsCheck = validateLimits(limits);
  if (!limitsCheck.ok) return res.status(400).json({ error: limitsCheck.error });
  const featuresCheck = validateFeatures(features);
  if (!featuresCheck.ok) return res.status(400).json({ error: featuresCheck.error });

  const { rows } = await pool.query(
    `UPDATE plans
        SET name = $1, description = $2, is_active = $3, is_public = $4, display_order = $5,
            limits = $6::jsonb, features = $7::jsonb, external_price_ref = $8, updated_at = NOW()
      WHERE id = $9
      RETURNING *`,
    [
      String(finalName).trim(),
      description !== undefined ? description || null : existing.description,
      isActive !== undefined ? Boolean(isActive) : existing.is_active,
      isPublic !== undefined ? Boolean(isPublic) : existing.is_public,
      Number.isInteger(displayOrder) ? displayOrder : existing.display_order,
      JSON.stringify(limitsCheck.value !== undefined ? limitsCheck.value : existing.limits || {}),
      JSON.stringify(featuresCheck.value !== undefined ? featuresCheck.value : existing.features || {}),
      externalPriceRef !== undefined ? (externalPriceRef ? String(externalPriceRef).trim() : null) : existing.external_price_ref,
      id,
    ]
  );

  entitlements.invalidate(); // il piano tocca potenzialmente più società
  await audit.logAction({ actorUserId: req.user.id, action: 'plan.update', entityType: 'plan', entityId: Number(id), metadata: { code: existing.code }, ip: audit.ipFromReq(req) });
  return res.json({ plan: toSafePlan(rows[0]) });
}

// Conteggi di utilizzo di una società: confronto immediato con i limiti del piano nella UI Super
// Admin. Solo le entità con un limite naturale (dipendenti/responsabili/sedi); estendibile.
async function getUsage(companyId) {
  const { rows } = await pool.query(
    `SELECT
        COUNT(*) FILTER (WHERE role = 'user')  AS employees,
        COUNT(*) FILTER (WHERE role = 'admin') AS managers,
        (SELECT COUNT(*) FROM sedi WHERE company_id = $1) AS sedi
       FROM users WHERE company_id = $1`,
    [companyId]
  );
  return {
    employees: Number(rows[0].employees),
    managers: Number(rows[0].managers),
    sedi: Number(rows[0].sedi),
  };
}

// GET /api/plans/subscriptions/:companyId (super admin) — abbonamento + entitlements effettivi +
// consumi di una società (per la UI di assegnazione piano).
async function getCompanySubscription(req, res) {
  const { companyId } = req.params;

  const { rows: companyRows } = await pool.query('SELECT id, name FROM companies WHERE id = $1', [companyId]);
  if (companyRows.length === 0) return res.status(404).json({ error: 'Società non trovata' });

  const { rows } = await pool.query(
    `SELECT s.*, p.code AS plan_code, p.name AS plan_name
       FROM company_subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.company_id = $1`,
    [companyId]
  );
  const eff = await entitlements.getEntitlements(Number(companyId));
  const usage = await getUsage(Number(companyId));

  const subscription = rows[0]
    ? {
        planId: rows[0].plan_id,
        planCode: rows[0].plan_code,
        planName: rows[0].plan_name,
        status: rows[0].status,
        trialEndsAt: rows[0].trial_ends_at,
        currentPeriodEnd: rows[0].current_period_end,
        limitOverrides: rows[0].limit_overrides || {},
        featureOverrides: rows[0].feature_overrides || {},
        externalRef: rows[0].external_ref,
      }
    : null;

  return res.json({
    company: { id: companyRows[0].id, name: companyRows[0].name },
    subscription,
    entitlements: { limits: eff.limits, features: eff.features },
    usage,
  });
}

// PUT /api/plans/subscriptions/:companyId (super admin) — assegna/aggiorna il piano di una società,
// con eventuali override per-cliente. Upsert 1:1 (UNIQUE company_id). Invalida la cache della sola
// società toccata, così il nuovo piano vale subito.
async function setCompanySubscription(req, res) {
  const { companyId } = req.params;
  const { planId, status, trialEndsAt, currentPeriodEnd, limitOverrides, featureOverrides, externalRef } = req.body;

  const { rows: companyRows } = await pool.query('SELECT id FROM companies WHERE id = $1', [companyId]);
  if (companyRows.length === 0) return res.status(404).json({ error: 'Società non trovata' });

  if (!Number.isInteger(planId)) return res.status(400).json({ error: 'planId è obbligatorio' });
  const { rows: planRows } = await pool.query('SELECT id, code FROM plans WHERE id = $1', [planId]);
  if (planRows.length === 0) return res.status(400).json({ error: 'Piano non valido' });

  const allowedStatus = ['trialing', 'active', 'past_due', 'canceled'];
  const finalStatus = status !== undefined ? status : 'active';
  if (!allowedStatus.includes(finalStatus)) return res.status(400).json({ error: 'Stato abbonamento non valido' });

  const limitsCheck = validateLimits(limitOverrides);
  if (!limitsCheck.ok) return res.status(400).json({ error: limitsCheck.error });
  const featuresCheck = validateFeatures(featureOverrides);
  if (!featuresCheck.ok) return res.status(400).json({ error: featuresCheck.error });

  const { rows } = await pool.query(
    `INSERT INTO company_subscriptions
        (company_id, plan_id, status, trial_ends_at, current_period_end, limit_overrides, feature_overrides, external_ref)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)
     ON CONFLICT (company_id) DO UPDATE
        SET plan_id = EXCLUDED.plan_id,
            status = EXCLUDED.status,
            trial_ends_at = EXCLUDED.trial_ends_at,
            current_period_end = EXCLUDED.current_period_end,
            limit_overrides = EXCLUDED.limit_overrides,
            feature_overrides = EXCLUDED.feature_overrides,
            external_ref = EXCLUDED.external_ref,
            updated_at = NOW()
     RETURNING *`,
    [
      companyId,
      planId,
      finalStatus,
      trialEndsAt || null,
      currentPeriodEnd || null,
      JSON.stringify(limitsCheck.value || {}),
      JSON.stringify(featuresCheck.value || {}),
      externalRef || null,
    ]
  );

  entitlements.invalidate(Number(companyId));
  await audit.logAction({ companyId: Number(companyId), actorUserId: req.user.id, action: 'subscription.set', entityType: 'company', entityId: Number(companyId), metadata: { planCode: planRows[0].code, status: finalStatus }, ip: audit.ipFromReq(req) });

  return res.json({
    subscription: {
      planId: rows[0].plan_id,
      status: rows[0].status,
      trialEndsAt: rows[0].trial_ends_at,
      currentPeriodEnd: rows[0].current_period_end,
      limitOverrides: rows[0].limit_overrides || {},
      featureOverrides: rows[0].feature_overrides || {},
      externalRef: rows[0].external_ref,
    },
  });
}

module.exports = { getCatalog, listPlans, createPlan, updatePlan, getCompanySubscription, setCompanySubscription };
