// ============================================================================
// Vocabolario di limiti e feature dei piani (layer SaaS)
// ============================================================================
// Definisce QUALI chiavi di limite/feature esistono — NON i loro valori commerciali. Ogni chiave
// esiste perché c'è un punto di enforcement corrispondente nel codice (un limite senza controllo, o
// una feature senza gate, sarebbero finzioni). I VALORI (quali limiti, quali feature per ogni piano)
// vivono in `plans`/`company_subscriptions` (JSONB) e li configura il Super Admin a runtime: qui non
// c'è alcun valore commerciale hardcoded, solo il dizionario delle chiavi configurabili.
//
// La UI del Super Admin legge questo catalogo (via GET /api/plans/catalog) per sapere cosa può
// configurare, senza doverlo replicare nel frontend.

// Limiti numerici. `label` per la UI; `appliesTo` (dove pertinente) documenta l'entità contata.
const LIMIT_KEYS = {
  maxEmployees: { label: 'Numero massimo di dipendenti', appliesTo: 'user' },
  maxManagers: { label: 'Numero massimo di responsabili', appliesTo: 'admin' },
  maxSedi: { label: 'Numero massimo di sedi' },
};

// Feature attivabili per piano. Ogni chiave è agganciata a un gate `requireFeature(chiave)` su un
// dominio di rotte (vedi i file routes/*). Assenza/true = abilitata; false = negata (default
// permissivo, retrocompatibile — vedi services/entitlements.js).
const FEATURE_KEYS = {
  reports: { label: 'Report analisi del personale' },
  substitutionEngine: { label: 'Motore compatibilità + proposte mirate di sostituzione' },
  emailAutomation: { label: 'Automazioni email e storico invii' },
};

// Chiave di limite pertinente al ruolo che si sta creando (single-source per l'enforcement in
// userController). null per ruoli senza un limite dedicato.
function limitKeyForRole(role) {
  if (role === 'admin') return 'maxManagers';
  if (role === 'user') return 'maxEmployees';
  return null;
}

module.exports = { LIMIT_KEYS, FEATURE_KEYS, limitKeyForRole };
