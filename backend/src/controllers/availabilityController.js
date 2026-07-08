const pool = require('../config/db');
const { MANAGER_ROLES } = require('../middleware/auth');

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
// Ordinamento stabile per giorno (lun→dom) indipendente dall'ordine di inserimento.
const WEEKDAY_ORDER = Object.fromEntries(WEEKDAYS.map((code, i) => [code, i]));

function toSafeSlot(row) {
  return {
    id: row.id,
    weekday: row.weekday,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
  };
}

// HH:MM valido (00:00–23:59)
function isValidTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Carica le fasce di un utente, ordinate per giorno e poi per orario di inizio.
async function loadSlots(userId) {
  const { rows } = await pool.query(
    'SELECT * FROM user_availability WHERE user_id = $1 ORDER BY start_time',
    [userId]
  );
  return rows
    .map(toSafeSlot)
    .sort((a, b) => WEEKDAY_ORDER[a.weekday] - WEEKDAY_ORDER[b.weekday] || a.startTime.localeCompare(b.startTime));
}

// GET /api/users/:id/availability
// Leggibile dal dipendente stesso OPPURE da un responsabile/dirigente della stessa società (vista
// di sola lettura). Un dipendente non può leggere le disponibilità di un altro dipendente.
async function getUserAvailability(req, res) {
  const targetId = Number(req.params.id);
  const isSelf = req.user.id === targetId;
  const isManager = MANAGER_ROLES.includes(req.user.role);

  if (!isSelf && !isManager) {
    return res.status(403).json({ error: 'Non autorizzato a vedere queste disponibilità' });
  }

  // Per un responsabile/dirigente: l'utente deve esistere ed essere della sua stessa società
  // (404 altrimenti, non si rivela l'esistenza di utenti di altre società). Per l'utente stesso
  // non serve la verifica: sta leggendo i propri dati.
  if (!isSelf) {
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1 AND company_id = $2', [
      targetId,
      req.user.companyId,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Utente non trovato' });
    }
  }

  return res.json({ availability: await loadSlots(targetId) });
}

// PUT /api/users/:id/availability
// Solo il dipendente stesso modifica le PROPRIE disponibilità (il responsabile è in sola lettura).
// Sostituzione in blocco dell'intero insieme (stesso pattern di userController.setUserAreas):
// valida prima tutte le fasce, poi DELETE + INSERT multi-riga.
async function replaceUserAvailability(req, res) {
  const targetId = Number(req.params.id);

  if (req.user.id !== targetId || req.user.role !== 'user') {
    return res.status(403).json({ error: 'Puoi modificare solo le tue disponibilità' });
  }

  const { slots } = req.body;
  if (!Array.isArray(slots)) {
    return res.status(400).json({ error: 'slots deve essere un array' });
  }

  const normalized = [];
  for (const slot of slots) {
    const weekday = slot && slot.weekday;
    const startTime = slot && slot.startTime;
    const endTime = slot && slot.endTime;
    if (!WEEKDAYS.includes(weekday)) {
      return res.status(400).json({ error: `Giorno non valido: ${weekday}` });
    }
    if (!isValidTime(startTime) || !isValidTime(endTime)) {
      return res.status(400).json({ error: 'Orari non validi (formato HH:MM)' });
    }
    if (startTime >= endTime) {
      return res.status(400).json({ error: "L'orario di fine deve essere successivo a quello di inizio" });
    }
    normalized.push({ weekday, startTime, endTime });
  }

  await pool.query('DELETE FROM user_availability WHERE user_id = $1', [targetId]);
  if (normalized.length > 0) {
    const values = normalized.map((_, i) => `($1, $${i * 3 + 2}, $${i * 3 + 3}, $${i * 3 + 4})`).join(', ');
    const params = [targetId];
    for (const s of normalized) params.push(s.weekday, s.startTime, s.endTime);
    await pool.query(
      `INSERT INTO user_availability (user_id, weekday, start_time, end_time) VALUES ${values}`,
      params
    );
  }

  return res.json({ availability: await loadSlots(targetId) });
}

module.exports = { getUserAvailability, replaceUserAvailability };
