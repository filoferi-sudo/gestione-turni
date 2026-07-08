const pool = require('../config/db');

// Proiezione sicura del contratto verso il frontend (camelCase, coerente con toSafeUser).
// I campi NUMERIC arrivano da pg come stringhe: li riconverto a Number così il frontend
// (e il futuro motore di compatibilità) lavora sempre con numeri, non con "20.00".
function toSafeContract(row) {
  if (!row) return null;
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    userId: row.user_id,
    contractType: row.contract_type,
    maxWeeklyHours: num(row.max_weekly_hours),
    maxMonthlyHours: num(row.max_monthly_hours),
    minWeeklyHours: num(row.min_weekly_hours),
    maxDailyHours: num(row.max_daily_hours),
    maxConsecutiveDays: row.max_consecutive_days,
    weeklyRestDays: row.weekly_rest_days,
    note: row.note,
    customConfig: row.custom_config || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Verifica che l'utente esista, appartenga alla società di chi opera e sia un dipendente
// ('user'): il contratto ha senso solo per chi lavora i turni (stessa restrizione già applicata
// alle aree operative in userController.updateUserAreas). Ritorna 404 anche per un utente di
// un'altra società (non si rivela l'esistenza di risorse fuori dalla propria società).
async function fetchEmployeeOr404(id, companyId, res) {
  const { rows } = await pool.query('SELECT id, role, company_id FROM users WHERE id = $1', [id]);
  const target = rows[0];
  if (!target || target.company_id !== companyId) {
    res.status(404).json({ error: 'Utente non trovato' });
    return null;
  }
  if (target.role !== 'user') {
    res.status(400).json({ error: 'Il contratto è configurabile solo per i dipendenti' });
    return null;
  }
  return target;
}

// GET /api/users/:id/contract (responsabile o dirigente)
// Ritorna il contratto del dipendente, o { contract: null } se non ancora configurato.
async function getUserContract(req, res) {
  const target = await fetchEmployeeOr404(req.params.id, req.user.companyId, res);
  if (!target) return;

  const { rows } = await pool.query('SELECT * FROM user_contracts WHERE user_id = $1', [target.id]);
  return res.json({ contract: toSafeContract(rows[0] || null) });
}

// Normalizza un massimale opzionale del contratto: '' / undefined / null -> null (nessun vincolo);
// altrimenti dev'essere un numero >= 0 (intero per i giorni, decimale per le ore).
function parseOptionalNumber(value, { integer = false } = {}) {
  if (value === undefined || value === null || value === '') return { value: null };
  const n = integer ? Number.parseInt(value, 10) : Number(value);
  if (Number.isNaN(n) || n < 0) return { error: true };
  return { value: n };
}

// PUT /api/users/:id/contract (responsabile o dirigente)
// Crea o aggiorna (upsert 1:1) il contratto corrente del dipendente. Tutti i campi sono
// opzionali: un campo vuoto significa "nessun vincolo su questo parametro".
async function upsertUserContract(req, res) {
  const target = await fetchEmployeeOr404(req.params.id, req.user.companyId, res);
  if (!target) return;

  const { contractType, note } = req.body;

  const numeric = {
    maxWeeklyHours: parseOptionalNumber(req.body.maxWeeklyHours),
    maxMonthlyHours: parseOptionalNumber(req.body.maxMonthlyHours),
    minWeeklyHours: parseOptionalNumber(req.body.minWeeklyHours),
    maxDailyHours: parseOptionalNumber(req.body.maxDailyHours),
    maxConsecutiveDays: parseOptionalNumber(req.body.maxConsecutiveDays, { integer: true }),
    weeklyRestDays: parseOptionalNumber(req.body.weeklyRestDays, { integer: true }),
  };
  if (Object.values(numeric).some((f) => f.error)) {
    return res.status(400).json({ error: 'I valori numerici del contratto devono essere numeri non negativi' });
  }

  // custom_config: solo oggetti (non array/stringhe), altrimenti si riparte da vuoto. Serializzato
  // esplicitamente per la colonna JSONB.
  const customConfig =
    req.body.customConfig && typeof req.body.customConfig === 'object' && !Array.isArray(req.body.customConfig)
      ? req.body.customConfig
      : {};

  const normalizedType = contractType != null && String(contractType).trim() !== '' ? String(contractType).trim() : null;
  const normalizedNote = note != null && String(note).trim() !== '' ? String(note) : null;

  const { rows } = await pool.query(
    `INSERT INTO user_contracts
       (user_id, contract_type, max_weekly_hours, max_monthly_hours, min_weekly_hours,
        max_daily_hours, max_consecutive_days, weekly_rest_days, note, custom_config,
        created_by, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11)
     ON CONFLICT (user_id) DO UPDATE SET
        contract_type        = EXCLUDED.contract_type,
        max_weekly_hours     = EXCLUDED.max_weekly_hours,
        max_monthly_hours    = EXCLUDED.max_monthly_hours,
        min_weekly_hours     = EXCLUDED.min_weekly_hours,
        max_daily_hours      = EXCLUDED.max_daily_hours,
        max_consecutive_days = EXCLUDED.max_consecutive_days,
        weekly_rest_days     = EXCLUDED.weekly_rest_days,
        note                 = EXCLUDED.note,
        custom_config        = EXCLUDED.custom_config,
        updated_by           = EXCLUDED.updated_by,
        updated_at           = NOW()
     RETURNING *`,
    [
      target.id,
      normalizedType,
      numeric.maxWeeklyHours.value,
      numeric.maxMonthlyHours.value,
      numeric.minWeeklyHours.value,
      numeric.maxDailyHours.value,
      numeric.maxConsecutiveDays.value,
      numeric.weeklyRestDays.value,
      normalizedNote,
      JSON.stringify(customConfig),
      req.user.id,
    ]
  );

  return res.json({ contract: toSafeContract(rows[0]) });
}

module.exports = { getUserContract, upsertUserContract };
