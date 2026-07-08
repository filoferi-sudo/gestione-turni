const pool = require('../config/db');

const LIST_LIMIT = 50;

function toSafeNotification(row) {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    payload: row.payload || {},
    isRead: row.is_read,
    createdAt: row.created_at,
  };
}

// GET /api/notifications - le proprie notifiche più recenti + conteggio non lette.
// Ogni utente autenticato ha le proprie notifiche (dipendente, responsabile o dirigente).
async function listNotifications(req, res) {
  const { rows } = await pool.query(
    `SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [req.user.id, LIST_LIMIT]
  );
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = FALSE`,
    [req.user.id]
  );

  return res.json({
    notifications: rows.map(toSafeNotification),
    unreadCount: countRows[0].count,
  });
}

// POST /api/notifications/:id/read - segna come letta una propria notifica.
async function markRead(req, res) {
  const { rowCount } = await pool.query(
    `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2`,
    [req.params.id, req.user.id]
  );
  if (rowCount === 0) {
    return res.status(404).json({ error: 'Notifica non trovata' });
  }
  return res.status(204).send();
}

// POST /api/notifications/read-all - segna come lette tutte le proprie notifiche.
async function markAllRead(req, res) {
  await pool.query(`UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE`, [req.user.id]);
  return res.status(204).send();
}

module.exports = { listNotifications, markRead, markAllRead };
