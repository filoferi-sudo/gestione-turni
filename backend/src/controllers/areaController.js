const pool = require('../config/db');

const CALENDAR_MODES = ['shifts', 'courses'];

function toSafeArea(row) {
  return {
    id: row.id,
    sedeId: row.sede_id,
    name: row.name,
    calendarMode: row.calendar_mode,
    displayOrder: row.display_order,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

async function fetchSedeOr404(sedeId, companyId, res) {
  const { rows } = await pool.query('SELECT * FROM sedi WHERE id = $1', [sedeId]);
  const sede = rows[0];
  if (!sede || sede.company_id !== companyId) {
    res.status(404).json({ error: 'Sede non trovata' });
    return null;
  }
  return sede;
}

async function fetchAreaOr404(id, companyId, res) {
  const { rows } = await pool.query('SELECT * FROM operational_areas WHERE id = $1', [id]);
  const area = rows[0];
  if (!area || area.company_id !== companyId) {
    res.status(404).json({ error: 'Area operativa non trovata' });
    return null;
  }
  return area;
}

// GET /api/sedi/:sedeId/areas
async function listAreas(req, res) {
  const { sedeId } = req.params;
  const sede = await fetchSedeOr404(sedeId, req.user.companyId, res);
  if (!sede) return;

  const { rows } = await pool.query(
    'SELECT * FROM operational_areas WHERE sede_id = $1 ORDER BY display_order, id',
    [sedeId]
  );
  return res.json({ areas: rows.map(toSafeArea) });
}

// POST /api/sedi/:sedeId/areas (solo dirigente)
async function createArea(req, res) {
  const { sedeId } = req.params;
  const { name, calendarMode } = req.body;

  const sede = await fetchSedeOr404(sedeId, req.user.companyId, res);
  if (!sede) return;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Il nome dell'area operativa è obbligatorio" });
  }
  const finalMode = calendarMode || 'shifts';
  if (!CALENDAR_MODES.includes(finalMode)) {
    return res.status(400).json({ error: `calendarMode deve essere uno tra ${CALENDAR_MODES.join(', ')}` });
  }

  const { rows: orderRows } = await pool.query(
    'SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order FROM operational_areas WHERE sede_id = $1',
    [sedeId]
  );

  const { rows } = await pool.query(
    `INSERT INTO operational_areas (company_id, sede_id, name, calendar_mode, display_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [req.user.companyId, sedeId, name.trim(), finalMode, orderRows[0].next_order]
  );

  return res.status(201).json({ area: toSafeArea(rows[0]) });
}

// PUT /api/areas/:id (solo dirigente) - nome, is_active sempre modificabili; calendarMode solo se
// l'area non ha ancora turni/corsi (cambiarlo con dati esistenti li renderebbe incoerenti: un
// turno creato in modalità 'shifts' non ha senso letto come 'corso' e viceversa).
async function updateArea(req, res) {
  const { id } = req.params;
  const { name, calendarMode, isActive } = req.body;

  const existing = await fetchAreaOr404(id, req.user.companyId, res);
  if (!existing) return;

  const finalName = name !== undefined ? name : existing.name;
  if (!finalName || !finalName.trim()) {
    return res.status(400).json({ error: "Il nome dell'area operativa è obbligatorio" });
  }

  let finalMode = existing.calendar_mode;
  if (calendarMode !== undefined && calendarMode !== existing.calendar_mode) {
    if (!CALENDAR_MODES.includes(calendarMode)) {
      return res.status(400).json({ error: `calendarMode deve essere uno tra ${CALENDAR_MODES.join(', ')}` });
    }
    const { rows: shiftRows } = await pool.query('SELECT COUNT(*)::int AS count FROM shifts WHERE area_id = $1', [id]);
    const { rows: courseRows } = await pool.query('SELECT COUNT(*)::int AS count FROM courses WHERE area_id = $1', [
      id,
    ]);
    if (shiftRows[0].count > 0 || courseRows[0].count > 0) {
      return res.status(409).json({
        error: "Non è possibile cambiare la modalità di calendario di un'area che ha già turni o corsi",
      });
    }
    finalMode = calendarMode;
  }

  const { rows } = await pool.query(
    `UPDATE operational_areas SET name = $1, calendar_mode = $2, is_active = $3 WHERE id = $4 RETURNING *`,
    [finalName.trim(), finalMode, isActive !== undefined ? Boolean(isActive) : existing.is_active, id]
  );

  return res.json({ area: toSafeArea(rows[0]) });
}

// DELETE /api/areas/:id (solo dirigente) - permessa solo se l'area non ha turni/corsi/dipendenti
// associati (stesso principio di deleteSede: no hard-delete distruttivo, usare isActive=false).
async function deleteArea(req, res) {
  const { id } = req.params;

  const existing = await fetchAreaOr404(id, req.user.companyId, res);
  if (!existing) return;

  const { rows: shiftRows } = await pool.query('SELECT COUNT(*)::int AS count FROM shifts WHERE area_id = $1', [id]);
  const { rows: courseRows } = await pool.query('SELECT COUNT(*)::int AS count FROM courses WHERE area_id = $1', [id]);
  const { rows: userRows } = await pool.query('SELECT COUNT(*)::int AS count FROM user_areas WHERE area_id = $1', [
    id,
  ]);
  if (shiftRows[0].count > 0 || courseRows[0].count > 0 || userRows[0].count > 0) {
    return res.status(409).json({
      error: "Quest'area ha turni, corsi o dipendenti assegnati: rimuovili prima, oppure disattiva l'area",
    });
  }

  await pool.query('DELETE FROM operational_areas WHERE id = $1', [id]);
  return res.status(204).send();
}

// PUT /api/sedi/:sedeId/areas/reorder (solo dirigente) - body: { areaIds: [id, id, ...] } nel
// nuovo ordine desiderato; aggiorna display_order in batch.
async function reorderAreas(req, res) {
  const { sedeId } = req.params;
  const { areaIds } = req.body;

  const sede = await fetchSedeOr404(sedeId, req.user.companyId, res);
  if (!sede) return;

  if (!Array.isArray(areaIds) || areaIds.length === 0) {
    return res.status(400).json({ error: 'areaIds deve essere un array non vuoto' });
  }

  const { rows: existingRows } = await pool.query('SELECT id FROM operational_areas WHERE sede_id = $1', [sedeId]);
  const existingIds = new Set(existingRows.map((r) => r.id));
  if (areaIds.length !== existingIds.size || !areaIds.every((id) => existingIds.has(Number(id)))) {
    return res.status(400).json({ error: "areaIds deve contenere esattamente tutte le aree di questa sede" });
  }

  await Promise.all(
    areaIds.map((areaId, index) => pool.query('UPDATE operational_areas SET display_order = $1 WHERE id = $2', [index, areaId]))
  );

  const { rows } = await pool.query(
    'SELECT * FROM operational_areas WHERE sede_id = $1 ORDER BY display_order, id',
    [sedeId]
  );
  return res.json({ areas: rows.map(toSafeArea) });
}

module.exports = { listAreas, createArea, updateArea, deleteArea, reorderAreas };
