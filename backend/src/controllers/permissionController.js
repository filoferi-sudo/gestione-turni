const pool = require('../config/db');
const { PERMISSIONS, isValidPermission, isOverridable, defaultAllows } = require('../config/permissions');
const audit = require('../services/auditService');

// ============================================================================
// Permessi granulari per utente — gestione degli override (RBAC, layer SaaS)
// ============================================================================
// Riservato al Dirigente (rotte requireDirigente): personalizza i permessi di un singolo responsabile
// (o dipendente) della PROPRIA società, sopra i default del ruolo. Il Dirigente/Super Admin non sono
// bersaglio di override (mantengono i propri poteri, vedi middleware/requirePermission).

// Carica il target verificando che esista e appartenga alla società del Dirigente (404 altrimenti,
// per non rivelare l'esistenza di utenti di altre società).
async function fetchTargetOr404(id, req, res) {
  const { rows } = await pool.query('SELECT id, role, company_id, username FROM users WHERE id = $1', [id]);
  const target = rows[0];
  if (!target || target.company_id !== req.user.companyId) {
    res.status(404).json({ error: 'Utente non trovato' });
    return null;
  }
  return target;
}

// Gli override hanno senso solo sui ruoli soggetti a personalizzazione (responsabile/dipendente):
// dirigente e superadmin non sono mai modificabili via override.
function isTargetable(role) {
  return role === 'admin' || role === 'user';
}

// Costruisce la vista permessi del target: per ogni voce del catalogo, default del ruolo, eventuale
// override e permesso effettivo.
async function buildPermissionsView(target) {
  const { rows } = await pool.query(
    'SELECT permission_key, granted FROM user_permission_overrides WHERE user_id = $1',
    [target.id]
  );
  const overrides = {};
  for (const r of rows) overrides[r.permission_key] = r.granted;

  return Object.entries(PERMISSIONS).map(([key, meta]) => {
    const def = defaultAllows(target.role, key);
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key);
    return {
      key,
      label: meta.label,
      overridable: meta.overridable === true,
      default: def,
      override: hasOverride ? overrides[key] : null, // null = nessun override (segue il default)
      effective: hasOverride ? overrides[key] === true : def,
    };
  });
}

// GET /api/users/:id/permissions (dirigente) — catalogo + effettivo + override del target.
async function getUserPermissions(req, res) {
  const target = await fetchTargetOr404(req.params.id, req, res);
  if (!target) return;
  if (!isTargetable(target.role)) {
    return res.status(400).json({ error: 'I permessi personalizzati si applicano solo a responsabili e dipendenti' });
  }
  return res.json({ permissions: await buildPermissionsView(target) });
}

// PUT /api/users/:id/permissions (dirigente) — imposta gli override.
// Body: { overrides: { "<permission_key>": true | false | null } }. null = rimuove l'override (torna
// al default del ruolo). Idempotente per chiave (upsert / delete).
async function setUserPermissions(req, res) {
  const target = await fetchTargetOr404(req.params.id, req, res);
  if (!target) return;
  if (!isTargetable(target.role)) {
    return res.status(400).json({ error: 'I permessi personalizzati si applicano solo a responsabili e dipendenti' });
  }

  const { overrides } = req.body;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    return res.status(400).json({ error: 'overrides deve essere un oggetto { permesso: true|false|null }' });
  }

  // Valida tutto prima di scrivere nulla (nessuna modifica parziale in caso di errore).
  for (const [key, val] of Object.entries(overrides)) {
    if (!isValidPermission(key)) return res.status(400).json({ error: `Permesso sconosciuto: ${key}` });
    if (!isOverridable(key)) return res.status(400).json({ error: `Il permesso "${key}" non è personalizzabile` });
    if (val !== null && typeof val !== 'boolean') {
      return res.status(400).json({ error: `Valore non valido per "${key}": usa true, false o null` });
    }
  }

  for (const [key, val] of Object.entries(overrides)) {
    if (val === null) {
      await pool.query('DELETE FROM user_permission_overrides WHERE user_id = $1 AND permission_key = $2', [target.id, key]);
    } else {
      await pool.query(
        `INSERT INTO user_permission_overrides (user_id, permission_key, granted, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, permission_key) DO UPDATE
            SET granted = EXCLUDED.granted, granted_by = EXCLUDED.granted_by, updated_at = NOW()`,
        [target.id, key, val, req.user.id]
      );
    }
  }

  await audit.logFromReq(req, { action: 'user.set_permissions', entityType: 'user', entityId: target.id, metadata: { overrides } });
  return res.json({ permissions: await buildPermissionsView(target) });
}

module.exports = { getUserPermissions, setUserPermissions };
