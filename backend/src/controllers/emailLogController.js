const pool = require('../config/db');

// Storico comunicazioni email (Fase E7): elenco degli invii della propria società, per la pagina
// Comunicazioni (responsabile/dirigente). Sola lettura, scoped per company_id. In demo mostra le
// righe `suppressed` (la pipeline gira ma non invia), coerente con il comportamento del canale.
async function listEmailLog(req, res) {
  const limit = Math.min(Number(req.query.limit) || 100, 200);
  const { rows } = await pool.query(
    `SELECT el.id, el.to_email, el.event_type, el.subject, el.status, el.error,
            el.created_at, el.sent_at, u.username AS recipient_username
       FROM email_log el
       LEFT JOIN users u ON u.id = el.user_id
      WHERE el.company_id = $1
      ORDER BY el.created_at DESC
      LIMIT $2`,
    [req.user.companyId, limit]
  );

  return res.json({
    emails: rows.map((r) => ({
      id: r.id,
      toEmail: r.to_email,
      recipientUsername: r.recipient_username,
      eventType: r.event_type,
      subject: r.subject,
      status: r.status,
      error: r.error,
      createdAt: r.created_at,
      sentAt: r.sent_at,
    })),
  });
}

module.exports = { listEmailLog };
