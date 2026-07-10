const pool = require('../config/db');

// Preferenze notifiche (Fase E6). Regola quali email di EVENTO un utente riceve. NON tocca le
// notifiche in-app (registro completo dell'attività) né le email transazionali (verifica/reset,
// sempre inviate). L'assenza di riga = default "tutte" (retrocompatibile).

// Catalogo delle categorie email di evento (solo gli event_type che il canale email invia davvero).
// `important` = incluso anche in modalità 'important'. Ordine = ordine di visualizzazione nella UI.
const EMAIL_CATEGORIES = [
  { key: 'shift_assigned', label: 'Turno assegnato', important: true },
  { key: 'shift_modified', label: 'Turno modificato', important: true },
  { key: 'substitution_proposed', label: 'Proposta di sostituzione', important: true },
  { key: 'cancellation_approved', label: 'Cancellazione approvata', important: true },
  { key: 'cancellation_rejected', label: 'Cancellazione rifiutata', important: true },
  { key: 'cancellation_requested', label: 'Richiesta di cancellazione (per responsabili)', important: true },
  { key: 'substitution_proposal_declined', label: 'Proposta rifiutata (per responsabili)', important: false },
];

const CATEGORY_KEYS = new Set(EMAIL_CATEGORIES.map((c) => c.key));
const IMPORTANT_KEYS = new Set(EMAIL_CATEGORIES.filter((c) => c.important).map((c) => c.key));

const DEFAULT_PREFS = { emailMode: 'all', disabledCategories: [] };

// Legge le preferenze di un utente (default se non esiste riga).
async function getPreferences(userId) {
  const { rows } = await pool.query(
    'SELECT email_mode, disabled_categories FROM notification_preferences WHERE user_id = $1',
    [userId]
  );
  if (rows.length === 0) return { ...DEFAULT_PREFS };
  return {
    emailMode: rows[0].email_mode,
    disabledCategories: Array.isArray(rows[0].disabled_categories) ? rows[0].disabled_categories : [],
  };
}

// Decide se una email di evento di categoria `eventType` va inviata date le preferenze `prefs`.
// Categorie non nel catalogo (es. eventi non ancora classificati) sono sempre consentite.
function isEmailAllowed(prefs, eventType) {
  const mode = prefs?.emailMode || 'all';
  const disabled = prefs?.disabledCategories || [];
  if (!CATEGORY_KEYS.has(eventType)) return true; // categoria sconosciuta: non filtrare
  if (mode === 'none') return false;
  if (disabled.includes(eventType)) return false;
  if (mode === 'important' && !IMPORTANT_KEYS.has(eventType)) return false;
  return true;
}

// Normalizza/valida un update (per il controller). Ritorna { emailMode, disabledCategories } pulito.
function sanitizePreferences({ emailMode, disabledCategories }) {
  const mode = ['all', 'important', 'none'].includes(emailMode) ? emailMode : 'all';
  const disabled = Array.isArray(disabledCategories)
    ? [...new Set(disabledCategories.filter((k) => CATEGORY_KEYS.has(k)))]
    : [];
  return { emailMode: mode, disabledCategories: disabled };
}

module.exports = { EMAIL_CATEGORIES, getPreferences, isEmailAllowed, sanitizePreferences, DEFAULT_PREFS };
