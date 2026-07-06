const pool = require('../config/db');
const { getExpandedShifts, shiftDurationHours } = require('../services/shiftExpansion');

function pad(n) {
  return String(n).padStart(2, '0');
}
function fmt(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfWeek(date) {
  const day = date.getDay(); // 0 = domenica
  const diff = day === 0 ? -6 : 1 - day;
  const d = new Date(date);
  d.setDate(d.getDate() + diff);
  return d;
}
function endOfWeek(date) {
  const s = startOfWeek(date);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return e;
}
function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}
function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

// GET /api/stats/hours?userId=<opzionale> (responsabile o dirigente)
// Ore settimana/mese calcolate sull'intero periodo corrente (turni passati e programmati).
// Totale e elenco turni "effettuati" sono calcolati da inizio anno a oggi (solo turni già trascorsi):
// i turni fissi ricorrenti non hanno una fine definita, quindi un "totale complessivo" senza
// limiti temporali non sarebbe calcolabile in modo significativo.
async function getHoursStats(req, res) {
  const today = new Date();
  const weekStart = fmt(startOfWeek(today));
  const weekEnd = fmt(endOfWeek(today));
  const monthStart = fmt(startOfMonth(today));
  const monthEnd = fmt(endOfMonth(today));
  const yearStart = `${today.getFullYear()}-01-01`;
  const todayStr = fmt(today);

  const fetchStart = yearStart;
  const fetchEnd = monthEnd >= weekEnd ? monthEnd : weekEnd;

  const filterUserId = req.query.userId ? Number(req.query.userId) : null;

  const allShifts = await getExpandedShifts({ start: fetchStart, end: fetchEnd, targetUserId: filterUserId });
  const assignedShifts = allShifts.filter((s) => s.userId);

  const { rows: users } = await pool.query(
    `SELECT id, username FROM users WHERE role = 'user'${filterUserId ? ' AND id = $1' : ''} ORDER BY username`,
    filterUserId ? [filterUserId] : []
  );

  const shiftsByUser = new Map();
  for (const shift of assignedShifts) {
    if (!shiftsByUser.has(shift.userId)) shiftsByUser.set(shift.userId, []);
    shiftsByUser.get(shift.userId).push(shift);
  }

  const stats = users.map((user) => {
    const userShifts = shiftsByUser.get(user.id) || [];

    const weekHours = userShifts
      .filter((s) => s.date >= weekStart && s.date <= weekEnd)
      .reduce((sum, s) => sum + shiftDurationHours(s), 0);

    const monthHours = userShifts
      .filter((s) => s.date >= monthStart && s.date <= monthEnd)
      .reduce((sum, s) => sum + shiftDurationHours(s), 0);

    const performedShifts = userShifts
      .filter((s) => s.date >= yearStart && s.date <= todayStr)
      .sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));

    const totalHours = performedShifts.reduce((sum, s) => sum + shiftDurationHours(s), 0);

    return {
      userId: user.id,
      username: user.username,
      weekHours,
      monthHours,
      totalHours,
      shifts: performedShifts,
    };
  });

  return res.json({ stats, period: { weekStart, weekEnd, monthStart, monthEnd, yearStart, today: todayStr } });
}

module.exports = { getHoursStats };
