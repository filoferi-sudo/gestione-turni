// ============================================================================
// Catalogo permessi granulari (RBAC con override per utente)
// ============================================================================
// I 4 ruoli restano invariati (superadmin/dirigente/admin/user). Sopra di essi, questo catalogo
// definisce permessi granulari con una MATRICE DEFAULT per ruolo che REPLICA esattamente il
// comportamento attuale: al rilascio nulla cambia. Il Dirigente può poi personalizzare il singolo
// responsabile tramite override (tabella user_permission_overrides) — es. "il responsabile B può
// solo vedere i turni, non approvare le cancellazioni".
//
// IMPORTANTE: un permesso è EFFETTIVAMENTE applicato solo dove una rotta usa requirePermission(key).
// Il catalogo contiene perciò solo permessi realmente agganciati a una rotta (niente toggle finti).
// Aggiungere un permesso = una voce qui (con defaultRoles = il gate attuale della rotta) + sostituire
// il middleware della rotta con requirePermission(key). Così il default resta invariato e diventa
// personalizzabile.
//
// overridable=false ⇒ pavimento di sicurezza: il permesso non è modificabile via override. Inoltre
// il Dirigente e il Super Admin non sono MAI soggetti a override (vedi requirePermission): mantengono
// sempre i propri poteri.

const PERMISSIONS = {
  'cancellations.approve': {
    label: 'Approvare o rifiutare le richieste di cancellazione',
    // Gate attuale della rotta (requireManager = admin + dirigente): la matrice lo replica.
    defaultRoles: ['admin', 'dirigente'],
    overridable: true,
  },
};

function isValidPermission(key) {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, key);
}

function isOverridable(key) {
  return isValidPermission(key) && PERMISSIONS[key].overridable === true;
}

// True se il ruolo, per DEFAULT (senza override), possiede il permesso.
function defaultAllows(role, key) {
  const p = PERMISSIONS[key];
  return !!p && p.defaultRoles.includes(role);
}

module.exports = { PERMISSIONS, isValidPermission, isOverridable, defaultAllows };
