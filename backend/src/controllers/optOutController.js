const pool = require('../config/db');
const { MANAGER_ROLES } = require('../middleware/auth');
const { toDateOnly } = require('../services/shiftExpansion');

// ============================================================================
// Opt-out "Non partecipare" (Fase 6)
// ============================================================================
// Periodi in cui il dipendente dichiara di non voler essere considerato per le sostituzioni. Il
// dipendente possiede i propri opt-out (li crea/elimina solo lui, self-service come le
// disponibilità); il responsabile/dirigente li legge in sola lettura. Isolamento per società nel
// controller (la tabella non ha company_id: user_id è sempre valorizzato).

function toSafeOptOut(row) {
  // toDateOnly formatta le colonne DATE con i componenti locali (TZ-safe): usare toISOString()
  // slitterebbe il giorno indietro nei fusi UTC+ (bug già noto e risolto per le date dei turni).
  return {
    id: row.id,
    startDate: toDateOnly(row.start_date),
    endDate: row.end_date ? toDateOnly(row.end_date) : null,
    note: row.note,
  };
}

// YYYY-MM-DD valido (formato + data reale, es. rifiuta 2026-02-30). Controllo su componenti UTC:
// indipendente dal fuso orario del server.
function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

async function loadOptOuts(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM substitution_optouts WHERE user_id = $1 ORDER BY start_date',
    [userId]
  );
  return rows.map(toSafeOptOut);
}

// GET /api/users/:id/optouts - leggibile dal dipendente stesso OPPURE da un responsabile/dirigente
// della stessa società (sola lettura). Un dipendente non vede gli opt-out di un altro.
async function getUserOptOuts(req, res) {
  const targetId = Number(req.params.id);
  const isSelf = req.user.id === targetId;
  const isManager = MANAGER_ROLES.includes(req.user.role);

  if (!isSelf && !isManager) {
    return res.status(403).json({ error: 'Non autorizzato a vedere questi opt-out' });
  }
  if (!isSelf) {
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [
      targetId,
      req.user.companyId,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
  }

  return res.json({ optOuts: await loadOptOuts(targetId) });
}

// POST /api/users/:id/optouts - il dipendente aggiunge un proprio periodo di opt-out.
// Body: { startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' | null (a tempo indeterminato), note? }.
async function addUserOptOut(req, res) {
  const targetId = Number(req.params.id);
  if (req.user.id !== targetId || req.user.role !== 'user') {
    return res.status(403).json({ error: 'Puoi gestire solo i tuoi opt-out' });
  }

  const { startDate, endDate, note } = req.body;
  if (!isValidDate(startDate)) {
    return res.status(400).json({ error: 'startDate non valida (formato YYYY-MM-DD)' });
  }
  if (endDate != null && !isValidDate(endDate)) {
    return res.status(400).json({ error: 'endDate non valida (formato YYYY-MM-DD o vuota per "a tempo indeterminato")' });
  }
  if (endDate != null && endDate < startDate) {
    return res.status(400).json({ error: 'La data di fine deve essere successiva o uguale a quella di inizio' });
  }

  await pool.query(
    'INSERT INTO substitution_optouts (user_id, start_date, end_date, note) VALUES ($1, $2, $3, $4)',
    [targetId, startDate, endDate || null, note ? String(note) : null]
  );

  return res.status(201).json({ optOuts: await loadOptOuts(targetId) });
}

// DELETE /api/users/:id/optouts/:optoutId - il dipendente rimuove un proprio opt-out.
async function deleteUserOptOut(req, res) {
  const targetId = Number(req.params.id);
  if (req.user.id !== targetId || req.user.role !== 'user') {
    return res.status(403).json({ error: 'Puoi gestire solo i tuoi opt-out' });
  }

  const { rowCount } = await pool.query(
    'DELETE FROM substitution_optouts WHERE id = $1 AND user_id = $2',
    [Number(req.params.optoutId), targetId]
  );
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Opt-out non trovato' });
  }
  return res.json({ optOuts: await loadOptOuts(targetId) });
}

module.exports = { getUserOptOuts, addUserOptOut, deleteUserOptOut };
