const pool = require('../config/db');
const { EMAIL_CATEGORIES, getPreferences, sanitizePreferences } = require('../services/notificationPreferencesService');

// Preferenze notifiche self-service (Fase E6): ogni utente gestisce le PROPRIE. Il catalogo delle
// categorie è restituito insieme alle preferenze, così il frontend rende le etichette senza doverle
// duplicare.

async function getMyPreferences(req, res) {
  const preferences = await getPreferences(req.user.id);
  return res.json({ preferences, catalog: EMAIL_CATEGORIES });
}

async function updateMyPreferences(req, res) {
  const clean = sanitizePreferences({
    emailMode: req.body.emailMode,
    disabledCategories: req.body.disabledCategories,
  });

  await pool.query(
    `INSERT INTO notification_preferences (user_id, email_mode, disabled_categories, updated_at)
     VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET email_mode = EXCLUDED.email_mode,
           disabled_categories = EXCLUDED.disabled_categories,
           updated_at = NOW()`,
    [req.user.id, clean.emailMode, JSON.stringify(clean.disabledCategories)]
  );

  return res.json({ preferences: clean, catalog: EMAIL_CATEGORIES });
}

module.exports = { getMyPreferences, updateMyPreferences };
