const pool = require('../config/db');

// ============================================================================
// Entitlements — cosa può fare una società secondo il suo piano (layer SaaS)
// ============================================================================
// UNICA fonte di verità (come services/userAreas.js) per limiti e feature di una società, dato il
// suo abbonamento (company_subscriptions) e il piano collegato (plans), con gli override per-cliente
// applicati SOPRA il piano.
//
// Letto a DB nei SOLI punti di enforcement — MAI messo nel JWT (vincolo esplicito dell'utente): un
// upgrade di piano, un cambio di limite o l'attivazione di una feature devono valere SUBITO, non
// alla scadenza del token di sessione (8h). La cache qui sotto è a TTL breve + invalidazione
// esplicita, non un sostituto del "leggere dal DB".
//
// Semantica (allineata al commento in db/schema.sql):
//   * limiti  : numero >= 0 => tetto; chiave assente/null/non-numerica => ILLIMITATO.
//   * feature : === false esplicito => negata; assente o true => ABILITATA (default permissivo,
//               retrocompatibile). Gli override della subscription vincono per singola chiave.

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map(); // companyId -> { value, expires }

// Default usato se una società non ha (ancora) un abbonamento: illimitato + tutte le feature. È il
// comportamento pre-SaaS, così l'assenza di una riga non blocca mai una società. Le limitazioni
// scattano SOLO quando esiste un piano che le definisce (fail-open è corretto qui: il gating dei
// piani è un confine COMMERCIALE, non di sicurezza — l'isolamento dati resta su company_id).
const SAFE_DEFAULT = { planCode: null, planName: null, status: null, limits: {}, features: {} };

async function loadEntitlements(companyId) {
  const { rows } = await pool.query(
    `SELECT p.code AS plan_code, p.name AS plan_name, s.status,
            p.limits AS plan_limits, p.features AS plan_features,
            s.limit_overrides, s.feature_overrides
       FROM company_subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.company_id = $1`,
    [companyId]
  );
  if (rows.length === 0) return { ...SAFE_DEFAULT };
  const r = rows[0];
  return {
    planCode: r.plan_code,
    planName: r.plan_name,
    status: r.status,
    // Merge poco profondo per chiave: gli override del cliente vincono sui valori del piano.
    limits: { ...(r.plan_limits || {}), ...(r.limit_overrides || {}) },
    features: { ...(r.plan_features || {}), ...(r.feature_overrides || {}) },
  };
}

async function getEntitlements(companyId) {
  if (!companyId) return { ...SAFE_DEFAULT }; // super admin (companyId NULL) o contesto senza società
  const hit = cache.get(companyId);
  if (hit && hit.expires > Date.now()) return hit.value;
  const value = await loadEntitlements(companyId);
  cache.set(companyId, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

// Da chiamare quando cambia un piano o una subscription, per rendere l'effetto immediato nella
// stessa istanza (senza aspettare il TTL). Senza argomento svuota tutta la cache (es. modifica a un
// piano che tocca più società).
function invalidate(companyId) {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}

// Tetto numerico per una chiave, o null se illimitato (assente/null/non numerica/negativa).
function limitFor(entitlements, key) {
  const raw = entitlements && entitlements.limits ? entitlements.limits[key] : undefined;
  if (raw === undefined || raw === null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// Feature abilitata a meno che il piano/override la neghi esplicitamente (=== false).
function isFeatureEnabled(entitlements, key) {
  const v = entitlements && entitlements.features ? entitlements.features[key] : undefined;
  return v !== false;
}

module.exports = { getEntitlements, invalidate, limitFor, isFeatureEnabled, SAFE_DEFAULT };
