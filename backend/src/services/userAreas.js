const pool = require('../config/db');

// Aree operative assegnate a un utente (id, name, sedeId, sedeName, calendarMode, più gli orari
// calendario configurati per la sede: un dipendente non ha accesso a GET /api/sedi, quindi deve
// ricevere qui tutto il necessario per costruire il proprio calendario). Ordinate per sede poi
// per posizione. Unica fonte di verità per questa proiezione: usata sia da authController
// (login/me) sia da userController (list/create/riassegnazione), per evitare la stessa
// duplicazione che in passato ha già causato un bug (campo mancante in un flusso ma non
// nell'altro, vedi PROJECT_CONTEXT.md).
function mapAreaRow(r) {
  return {
    id: r.id,
    name: r.name,
    sedeId: r.sede_id,
    sedeName: r.sede_name,
    calendarMode: r.calendar_mode,
    calendarStartTime: r.calendar_start_time.slice(0, 5),
    calendarEndTime: r.calendar_end_time.slice(0, 5),
  };
}

async function fetchUserAreas(userId) {
  const { rows } = await pool.query(
    `SELECT oa.id, oa.name, oa.sede_id, oa.calendar_mode, s.name AS sede_name,
            s.calendar_start_time, s.calendar_end_time
       FROM user_areas ua
       JOIN operational_areas oa ON oa.id = ua.area_id
       JOIN sedi s ON s.id = oa.sede_id
      WHERE ua.user_id = $1
      ORDER BY oa.sede_id, oa.display_order, oa.id`,
    [userId]
  );
  return rows.map(mapAreaRow);
}

// Versione batch per liste di utenti, evita N+1 query. Ritorna { [userId]: Area[] }.
async function fetchUserAreasBatch(userIds) {
  if (userIds.length === 0) return {};
  const { rows } = await pool.query(
    `SELECT ua.user_id, oa.id, oa.name, oa.sede_id, oa.calendar_mode, s.name AS sede_name,
            s.calendar_start_time, s.calendar_end_time
       FROM user_areas ua
       JOIN operational_areas oa ON oa.id = ua.area_id
       JOIN sedi s ON s.id = oa.sede_id
      WHERE ua.user_id = ANY($1::int[])
      ORDER BY oa.sede_id, oa.display_order, oa.id`,
    [userIds]
  );
  const byUser = {};
  for (const row of rows) {
    (byUser[row.user_id] = byUser[row.user_id] || []).push(mapAreaRow(row));
  }
  return byUser;
}

module.exports = { fetchUserAreas, fetchUserAreasBatch };
