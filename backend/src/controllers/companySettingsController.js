const pool = require('../config/db');
const entitlements = require('../services/entitlements');

// ============================================================================
// Impostazioni società — regole aziendali configurabili dal Dirigente (Fase 7)
// ============================================================================
// Endpoint scoped alla PROPRIA società (req.user.companyId): il Dirigente configura le regole
// organizzative interne, il Super Admin non entra qui (gestisce solo l'anagrafica della piattaforma)
// e il Responsabile gestisce l'operatività ma non modifica le regole (rotte con requireDirigente).
// La forma della risposta è un oggetto `settings` estendibile: nuove regole di escalation
// (comportamento, livelli successivi) si aggiungeranno qui senza cambiare la struttura.

function toSafeSettings(row) {
  return {
    // NULL in DB = escalation disattivata; esposto come null (il frontend mostra il campo vuoto).
    substitutionEscalationHours: row.substitution_escalation_hours,
  };
}

// GET /api/company/settings
async function getCompanySettings(req, res) {
  const { rows } = await pool.query(
    'SELECT substitution_escalation_hours FROM companies WHERE id = $1',
    [req.user.companyId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Società non trovata' });
  }
  return res.json({ settings: toSafeSettings(rows[0]) });
}

// PUT /api/company/settings
// Body: { substitutionEscalationHours: number|null }. Vuoto/null/0 = escalation disattivata (salvata
// come NULL, così "disattivata" è un unico valore canonico).
async function updateCompanySettings(req, res) {
  const raw = req.body.substitutionEscalationHours;

  let value = null;
  if (raw !== null && raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      return res.status(400).json({ error: 'Le ore di escalation devono essere un intero ≥ 0 (vuoto o 0 = escalation disattivata)' });
    }
    value = n === 0 ? null : n; // 0 equivale a "disattivata"
  }

  const { rows } = await pool.query(
    'UPDATE companies SET substitution_escalation_hours = $1 WHERE id = $2 RETURNING substitution_escalation_hours',
    [value, req.user.companyId]
  );
  if (rows.length === 0) {
    return res.status(404).json({ error: 'Società non trovata' });
  }
  return res.json({ settings: toSafeSettings(rows[0]) });
}

// GET /api/company/entitlements
// Entitlements EFFETTIVI della propria società (piano + limiti + feature): li usa il frontend per
// mostrare/nascondere voci e bottoni secondo il piano. Il backend resta comunque l'unico punto
// autoritativo di enforcement (frontend "dumb"): questo endpoint è solo un aiuto UX. Accessibile a
// tutti i ruoli con una società (authenticate): anche il dipendente ne ha bisogno per la propria UI.
// Letto a DB (via cache TTL breve), MAI dal JWT: un cambio di piano vale subito.
async function getMyEntitlements(req, res) {
  const eff = await entitlements.getEntitlements(req.user.companyId);
  return res.json({
    entitlements: {
      planCode: eff.planCode,
      planName: eff.planName,
      status: eff.status,
      limits: eff.limits,
      features: eff.features,
    },
  });
}

module.exports = { getCompanySettings, updateCompanySettings, getMyEntitlements };
