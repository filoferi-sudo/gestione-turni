const pool = require('../config/db');
const { defaultAllows, isValidPermission } = require('../config/permissions');

// ============================================================================
// requirePermission(key) — RBAC granulare con override per utente
// ============================================================================
// Autorizza in base al permesso EFFETTIVO dell'utente = default del ruolo ± override per-utente.
// Sostituisce i middleware binari (requireManager/…) sulle rotte dove serve la personalizzazione,
// mantenendo il comportamento invariato per default (la matrice in config/permissions.js replica il
// gate attuale). Letto a DB ad ogni richiesta (mai nel JWT): una revoca vale subito.

// Calcola se l'utente possiede il permesso.
async function hasPermission(user, key) {
  if (!isValidPermission(key)) return false; // chiave ignota ⇒ fail-closed
  const base = defaultAllows(user.role, key);
  // Pavimento di sicurezza: Dirigente e Super Admin non sono soggetti a override, mantengono sempre
  // i propri poteri di default (non ci si può auto-revocare la gestione della propria società).
  if (user.role === 'dirigente' || user.role === 'superadmin') return base;
  const { rows } = await pool.query(
    'SELECT granted FROM user_permission_overrides WHERE user_id = $1 AND permission_key = $2',
    [user.id, key]
  );
  if (rows.length === 0) return base; // nessun override ⇒ default del ruolo
  return rows[0].granted === true;
}

function requirePermission(key) {
  return async (req, res, next) => {
    try {
      if (!req.user) return res.status(401).json({ error: 'Token mancante' });
      if (await hasPermission(req.user, key)) return next();
      return res.status(403).json({
        error: 'Permesso non concesso per questa operazione',
        code: 'PERMISSION_DENIED',
        permission: key,
      });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requirePermission, hasPermission };
