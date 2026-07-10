const pool = require('../config/db');
const { toDateOnly } = require('../services/shiftExpansion');
const { notifySubstitutionAvailable, notifyCancellationDecision } = require('../services/notificationService');
const audit = require('../services/auditService');

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
// Turni fissi ricorrenti: la serie non viene toccata, si esclude solo la data richiesta
// (altrimenti si cancellerebbero tutte le occorrenze passate e future del turno).
// Turni singolo/volante assegnati: la riga non viene più eliminata, resta come storico con
// status='cancelled_approved' (sparisce dal calendario attivo, che filtra status='active').
// In entrambi i casi viene generata automaticamente una nuova Sostituzione (type='volante',
// non assegnata) con lo stesso orario/area operativa, collegata al turno originale via
// origin_shift_id.
// Cuore dell'approvazione, ESTRATTO (Fase E5) per essere riusato dall'handler HTTP e dalle Email
// Actions (approvazione da bottone nell'email). Riceve la richiesta (già verificata pendente e della
// società) e l'id dell'attore; esegue update + storico turno + nuova Sostituzione + notifiche.
// Ritorna la riga aggiornata. Comportamento invariato rispetto all'inline precedente.
async function approveRequestCore({ request, actorUserId }) {
  const { rows } = await pool.query(
    `UPDATE cancellation_requests
        SET status = 'approved', decided_by = $1, decided_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [actorUserId, request.id]
  );

  if (request.shift_id) {
    const { rows: shiftRows } = await pool.query('SELECT * FROM shifts WHERE id = $1', [request.shift_id]);
    const shift = shiftRows[0];

    if (shift) {
      if (shift.type === 'fixed') {
        await pool.query(
          `INSERT INTO shift_exceptions (shift_id, excluded_date) VALUES ($1, $2)
           ON CONFLICT (shift_id, excluded_date) DO NOTHING`,
          [request.shift_id, request.shift_date]
        );
      } else {
        await pool.query(`UPDATE shifts SET status = 'cancelled_approved' WHERE id = $1`, [request.shift_id]);
      }

      // L'area (e la sede) si ereditano direttamente dal turno originale: da quando ogni turno
      // appartiene sempre a un'area operativa, l'area stessa è già il "ruolo richiesto" della
      // nuova Sostituzione (vedi PROJECT_CONTEXT.md, sezione Sedi/Aree). Non serve più risalire
      // alla categoria del dipendente titolare.
      const { rows: newShiftRows } = await pool.query(
        `INSERT INTO shifts
           (user_id, company_id, start_time, end_time, date, type, note, created_by, status, area_id, sede_id, origin_shift_id)
         VALUES (NULL, $1, $2, $3, $4, 'volante', $5, $6, 'active', $7, $8, $9)
         RETURNING *`,
        [
          request.company_id,
          request.shift_start_time,
          request.shift_end_time,
          request.shift_date,
          request.shift_note,
          actorUserId,
          shift.area_id,
          shift.sede_id,
          shift.id,
        ]
      );

      // La nuova Sostituzione è disponibile: avvisa dipendenti dell'area + responsabili (best-effort).
      const newShift = newShiftRows[0];
      await notifySubstitutionAvailable({
        companyId: request.company_id,
        areaId: newShift.area_id,
        sedeId: newShift.sede_id,
        shiftId: newShift.id,
        date: toDateOnly(newShift.date),
        startTime: newShift.start_time.slice(0, 5),
        endTime: newShift.end_time.slice(0, 5),
        actorUserId,
      });
    }
  }

  // Avvisa il dipendente richiedente che la sua cancellazione è stata approvata (best-effort).
  await notifyCancellationDecision({
    companyId: request.company_id,
    requesterUserId: request.requested_by,
    requestId: request.id,
    date: toDateOnly(request.shift_date),
    startTime: request.shift_start_time.slice(0, 5),
    endTime: request.shift_end_time.slice(0, 5),
    approved: true,
  });

  return rows[0];
}

async function approveRequest(req, res) {
  const { id } = req.params;
  const request = await fetchPendingRequestOr404(id, req.user.companyId, res);
  if (!request) return;

  const updated = await approveRequestCore({ request, actorUserId: req.user.id });

  await audit.logFromReq(req, { action: 'cancellation.approve', entityType: 'cancellation_request', entityId: request.id, metadata: { shiftId: request.shift_id } });

  return res.json({ request: toSafeRequest(updated) });
}

// Cuore del rifiuto, ESTRATTO (Fase E5) per il riuso HTTP + Email Actions.
async function rejectRequestCore({ request, actorUserId }) {
  const { rows } = await pool.query(
    `UPDATE cancellation_requests
        SET status = 'rejected', decided_by = $1, decided_at = NOW()
      WHERE id = $2
      RETURNING *`,
    [actorUserId, request.id]
  );

  // Avvisa il dipendente richiedente che la sua cancellazione è stata rifiutata (best-effort).
  await notifyCancellationDecision({
    companyId: request.company_id,
    requesterUserId: request.requested_by,
    requestId: request.id,
    date: toDateOnly(request.shift_date),
    startTime: request.shift_start_time.slice(0, 5),
    endTime: request.shift_end_time.slice(0, 5),
    approved: false,
  });

  return rows[0];
}

// POST /api/cancellation-requests/:id/reject (responsabile o dirigente)
async function rejectRequest(req, res) {
  const { id } = req.params;
  const request = await fetchPendingRequestOr404(id, req.user.companyId, res);
  if (!request) return;

  const updated = await rejectRequestCore({ request, actorUserId: req.user.id });

  await audit.logFromReq(req, { action: 'cancellation.reject', entityType: 'cancellation_request', entityId: request.id, metadata: { shiftId: request.shift_id } });

  return res.json({ request: toSafeRequest(updated) });
}

// Carica una richiesta ANCORA PENDENTE della società indicata (senza scrivere su res): usato dalle
// Email Actions (Fase E5).
async function loadPendingRequest(id, companyId) {
  const { rows } = await pool.query(
    "SELECT * FROM cancellation_requests WHERE id = $1 AND company_id = $2 AND status = 'pending'",
    [id, companyId]
  );
  return rows[0] || null;
}

module.exports = {
  listRequests,
  listMyRequests,
  approveRequest,
  rejectRequest,
  approveRequestCore,
  rejectRequestCore,
  loadPendingRequest,
};
