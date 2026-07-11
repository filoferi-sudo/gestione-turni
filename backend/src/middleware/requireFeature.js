const entitlements = require('../services/entitlements');

// ============================================================================
// requireFeature(key) — gate di una funzionalità secondo il piano della società
// ============================================================================
// Nega l'accesso a una rotta se la feature non è inclusa nel piano corrente della società di chi
// opera (letto a DB via services/entitlements, mai dal JWT). Da montare DOPO `authenticate` (serve
// req.user.companyId). Fail-closed su feature ignota? No: la semantica è "abilitata a meno di un
// diniego esplicito" (default permissivo, retrocompatibile) — coerente con isFeatureEnabled. Il
// gating dei piani è un confine COMMERCIALE, non di sicurezza: l'isolamento dati resta su company_id.
function requireFeature(key) {
  return async (req, res, next) => {
    try {
      const ent = await entitlements.getEntitlements(req.user.companyId);
      if (entitlements.isFeatureEnabled(ent, key)) return next();
      return res.status(403).json({
        error: 'Questa funzione non è inclusa nel piano corrente della società',
        code: 'PLAN_FEATURE',
        feature: key,
      });
    } catch (err) {
      next(err);
    }
  };
}

module.exports = requireFeature;
