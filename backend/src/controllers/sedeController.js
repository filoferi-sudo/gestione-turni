const pool = require('../config/db');

function toSafeSede(row) {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    displayOrder: row.display_order,
    calendarStartTime: row.calendar_start_time.slice(0, 5),
    calendarEndTime: row.calendar_end_time.slice(0, 5),
    areasCount: row.areas_count !== undefined ? Number(row.areas_count) : undefined,
    createdAt: row.created_at,
  };
}

// GET /api/sedi - elenco sedi della propria società (letto anche dai responsabili, per navigare)
async function listSedi(req, res) {
  const { rows } = await pool.query(
    `SELECT s.*, COUNT(oa.id) AS areas_count
       FROM sedi s
       LEFT JOIN operational_areas oa ON oa.sede_id = s.id
      WHERE s.company_id = $1
      GROUP BY s.id
      ORDER BY s.display_order, s.id`,
    [req.user.companyId]
  );
  return res.json({ sedi: rows.map(toSafeSede) });
}

function validateTimes(startTime, endTime) {
  if (!startTime || !endTime) return { error: 'Ora di inizio e fine sono obbligatorie' };
  if (startTime >= endTime) return { error: "L'ora di fine deve essere successiva a quella di inizio" };
  return {};
}

// POST /api/sedi (solo dirigente)
async function createSede(req, res) {
  const { name, calendarStartTime, calendarEndTime } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Il nome della sede è obbligatorio' });
  }

  const startTime = calendarStartTime || '07:30';
  const endTime = calendarEndTime || '23:00';
  const timesResult = validateTimes(startTime, endTime);
  if (timesResult.error) return res.status(400).json({ error: timesResult.error });

  const { rows } = await pool.query(
    `INSERT INTO sedi (company_id, name, calendar_start_time, calendar_end_time)
     VALUES ($1, $2, $3, $4)
     RETURNING *, 0 AS areas_count`,
    [req.user.companyId, name.trim(), startTime, endTime]
  );

  return res.status(201).json({ sede: toSafeSede(rows[0]) });
}

async function fetchSedeOr404(id, companyId, res) {
  const { rows } = await pool.query('SELECT * FROM sedi WHERE id = $1', [id]);
  const sede = rows[0];
  if (!sede || sede.company_id !== companyId) {
    res.status(404).json({ error: 'Sede non trovata' });
    return null;
  }
  return sede;
}

// PUT /api/sedi/:id (solo dirigente) - nome, orari calendario, attiva/disattiva, ordine
async function updateSede(req, res) {
  const { id } = req.params;
  const { name, calendarStartTime, calendarEndTime, isActive, displayOrder } = req.body;

  const existing = await fetchSedeOr404(id, req.user.companyId, res);
  if (!existing) return;

  const finalName = name !== undefined ? name : existing.name;
  if (!finalName || !finalName.trim()) {
    return res.status(400).json({ error: 'Il nome della sede è obbligatorio' });
  }

  const finalStartTime = calendarStartTime || existing.calendar_start_time.slice(0, 5);
  const finalEndTime = calendarEndTime || existing.calendar_end_time.slice(0, 5);
  const timesResult = validateTimes(finalStartTime, finalEndTime);
  if (timesResult.error) return res.status(400).json({ error: timesResult.error });

  const { rows } = await pool.query(
    `UPDATE sedi
        SET name = $1, calendar_start_time = $2, calendar_end_time = $3, is_active = $4, display_order = $5
      WHERE id = $6
      RETURNING *, (SELECT COUNT(*) FROM operational_areas oa WHERE oa.sede_id = sedi.id) AS areas_count`,
    [
      finalName.trim(),
      finalStartTime,
      finalEndTime,
      isActive !== undefined ? Boolean(isActive) : existing.is_active,
      displayOrder !== undefined ? Number(displayOrder) : existing.display_order,
      id,
    ]
  );

  return res.json({ sede: toSafeSede(rows[0]) });
}

// DELETE /api/sedi/:id (solo dirigente) - permessa solo se la sede non ha aree operative
// associate (che a loro volta potrebbero avere turni/corsi/dipendenti): per "rimuovere" una sede
// con dati si usa isActive=false, coerente con l'assenza di hard-delete distruttivi altrove nel
// sistema (companies, cancellation_requests, ecc.).
async function deleteSede(req, res) {
  const { id } = req.params;

  const existing = await fetchSedeOr404(id, req.user.companyId, res);
  if (!existing) return;

  const { rows: areaRows } = await pool.query('SELECT COUNT(*)::int AS count FROM operational_areas WHERE sede_id = $1', [
    id,
  ]);
  if (areaRows[0].count > 0) {
    return res.status(409).json({
      error: 'Questa sede ha aree operative associate: eliminale prima, oppure disattiva la sede invece di eliminarla',
    });
  }

  await pool.query('DELETE FROM sedi WHERE id = $1', [id]);
  return res.status(204).send();
}

module.exports = { listSedi, createSede, updateSede, deleteSede };
