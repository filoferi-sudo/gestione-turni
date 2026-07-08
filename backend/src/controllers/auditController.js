const pool = require('../config/db');

// Lettura dell'audit trail (Fase S3). Endpoint di sola lettura, predisposto per una futura UI di
// consultazione. Accesso riservato a Dirigente (propria società) e Super Admin (tutte le società,
// con filtro opzionale ?companyId). Il Responsabile è escluso: l'audit è una funzione di governance.
//
// Isolamento multi-tenant: il Dirigente vede SOLO gli eventi della propria società; il super admin
// (companyId NULL nel token) può filtrare per companyId o vedere tutto.
async function listAuditLogs(req, res) {
  const role = req.user.role;
  if (role !== 'dirigente' && role !== 'superadmin') {
    return res.status(403).json({ error: 'Accesso riservato a dirigente e super admin' });
  }

  // Paginazione difensiva: limite massimo per non restituire dataset enormi.
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 500);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const filters = [];
  const params = [];

  // I filtri sono qualificati con l'alias `a` (audit_logs): la JOIN con users porta anch'essa una
  // colonna company_id, quindi un riferimento non qualificato sarebbe ambiguo.
  if (role === 'dirigente') {
    // Sempre e solo la propria società.
    params.push(req.user.companyId);
    filters.push(`a.company_id = $${params.length}`);
  } else if (req.query.companyId) {
    // Super admin con filtro esplicito su una società.
    params.push(Number(req.query.companyId));
    filters.push(`a.company_id = $${params.length}`);
  }

  if (req.query.action) {
    params.push(req.query.action);
    filters.push(`a.action = $${params.length}`);
  }
  if (req.query.entityType) {
    params.push(req.query.entityType);
    filters.push(`a.entity_type = $${params.length}`);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
  params.push(limit);
  params.push(offset);

  const { rows } = await pool.query(
    `SELECT a.id, a.company_id, a.actor_user_id, u.username AS actor_username,
            a.action, a.entity_type, a.entity_id, a.metadata, a.ip, a.created_at
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ${where}
      ORDER BY a.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return res.json({
    logs: rows.map((r) => ({
      id: r.id,
      companyId: r.company_id,
      actorUserId: r.actor_user_id,
      actorUsername: r.actor_username,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      metadata: r.metadata,
      ip: r.ip,
      createdAt: r.created_at,
    })),
  });
}

module.exports = { listAuditLogs };
