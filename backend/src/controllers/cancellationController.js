const pool = require('../config/db');
const { toDateOnly } = require('../services/shiftExpansion');

function toSafeRequest(row) {
  return {
    id: row.id,
    shiftId: row.shift_id,
    requestedBy: row.requested_by,
    requestedByUsername: row.requested_by_username,
    shiftDate: toDateOnly(row.shift_date),
    shiftStartTime: row.shift_start_time.slice(0, 5),
    shiftEndTime: row.shift_end_time.slice(0, 5),
    shiftNote: row.shift_note,
    status: row.status,
    decidedBy: row.decided_by,
    decidedByUsername: row.decided_by_username,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
  };
}

// GET /api/cancellation-requests?status=pending (responsabile o dirigente, propria società)
async function listRequests(req, res) {
  const { status } = req.query;
  const params = [req.user.companyId];
  let statusFilter = '';
  if (status) {
    params.push(status);
    statusFilter = ` AND cr.status = $${params.length}`;
  }

  const { rows } = await pool.query(
    `SELECT cr.*, requester.username AS requested_by_username, decider.username AS decided_by_username
       FROM cancellation_requests cr
       JOIN users requester ON requester.id = cr.requested_by
       LEFT JOIN users decider ON decider.id = cr.decided_by
      WHERE cr.company_id = $1${statusFilter}
      ORDER BY cr.created_at DESC`,
    params
  );

  return res.json({ requests: rows.map(toSafeRequest) });
}

// GET /api/cancellation-requests/mine (utente autenticato) - stato delle proprie richieste
async function listMyRequests(req, res) {
  const { rows } = await pool.query(
    `SELECT cr.*, requester.username AS requested_by_username, decider.username AS decided_by_username
       FROM cancellation_requests cr
       JOIN users requester ON requester.id = cr.requested_by
       LEFT JOIN users decider ON decider.id = cr.decided_by
      WHERE cr.requested_by = $1
      ORDER BY cr.created_at DESC`,
    [req.user.id]
  );

  return res.json({ requests: rows.map(toSafeRequest) });
}

async function fetchPendingRequestOr404(id, companyId, res) {
  const { rows } = await pool.query('SELECT * FROM cancellation_requests WHERE id = $1', [id]);
  const request = rows[0];
  if (!request || request.company_id !== companyId) {
    res.status(404).json({ error: 'Richiesta non trovata' });
    return null;
  }
  if (request.status !== 'pending') {
    res.status(400).json({ error: 'Questa richiesta è già stata gestita' });
    return null;
  }
  return request;
}

// POST /api/cancellation-requests/:id/approve (responsabile o dirigente)
// Turni singolo/volante: l'unica occorrenza esistente viene eliminata.
// Turni fissi ricorrenti: la serie non viene toccata, si esclude solo la data richiesta
// (altrimenti si cancellerebbero tutte le occorrenze passate e future del turno).
async function approveRequest(req, res) {
  const { id } = req.params;
  const request = await fetchPendingRequestOr404(id, req.user.companyId, res);
  if (!request) return;

  const { rows } = await pool.query(
    `UPDATE cancellation_requests
        SET status = 'approved', decided_by = $1, decided_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [req.user.id, id]
  );

  if (request.shift_id) {
    const { rows: shiftRows } = await pool.query('SELECT type FROM shifts WHERE id = $1', [request.shift_id]);
    const shift = shiftRows[0];

    if (shift && shift.type === 'fixed') {
      await pool.query(
        `INSERT INTO shift_exceptions (shift_id, excluded_date) VALUES ($1, $2)
         ON CONFLICT (shift_id, excluded_date) DO NOTHING`,
        [request.shift_id, request.shift_date]
      );
    } else {
      await pool.query('DELETE FROM shifts WHERE id = $1', [request.shift_id]);
    }
  }

  return res.json({ request: toSafeRequest(rows[0]) });
}

// POST /api/cancellation-requests/:id/reject (responsabile o dirigente)
async function rejectRequest(req, res) {
  const { id } = req.params;
  const request = await fetchPendingRequestOr404(id, req.user.companyId, res);
  if (!request) return;

  const { rows } = await pool.query(
    `UPDATE cancellation_requests
        SET status = 'rejected', decided_by = $1, decided_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [req.user.id, id]
  );

  return res.json({ request: toSafeRequest(rows[0]) });
}

module.exports = { listRequests, listMyRequests, approveRequest, rejectRequest };
