const { buildOverview, buildDetail, isValidDateString } = require('../services/reportService');

// Periodo di default se non specificato: mese corrente (dal primo giorno del mese a oggi... no:
// all'ultimo giorno del mese, così le ore pianificate future rientrano nel confronto col contratto).
function defaultPeriod() {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const y = today.getFullYear();
  const m = today.getMonth();
  const start = `${y}-${pad(m + 1)}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const end = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
  return { start, end };
}

// Legge e valida start/end dalla query string; ricade sul mese corrente se assenti. Se presenti
// devono essere date valide (YYYY-MM-DD) e coerenti (start <= end), altrimenti 400.
function resolvePeriod(req, res) {
  const def = defaultPeriod();
  const start = req.query.start || def.start;
  const end = req.query.end || def.end;
  if (!isValidDateString(start) || !isValidDateString(end)) {
    res.status(400).json({ error: 'Periodo non valido (formato atteso YYYY-MM-DD)' });
    return null;
  }
  if (start > end) {
    res.status(400).json({ error: 'La data di inizio non può essere successiva alla data di fine' });
    return null;
  }
  return { start, end };
}

// GET /api/reports/employees (responsabile o dirigente)
// Vista generale: elenco dei dipendenti con scheda riepilogativa nel periodo selezionato.
// Filtri opzionali: start, end, areaId, sedeId, userId.
async function getEmployeesOverview(req, res) {
  const period = resolvePeriod(req, res);
  if (!period) return;

  const areaId = req.query.areaId ? Number(req.query.areaId) : null;
  const sedeId = req.query.sedeId ? Number(req.query.sedeId) : null;
  const userId = req.query.userId ? Number(req.query.userId) : null;

  const report = await buildOverview({
    companyId: req.user.companyId,
    start: period.start,
    end: period.end,
    areaId,
    sedeId,
    userId,
  });

  return res.json(report);
}

// GET /api/reports/employees/:id (responsabile/dirigente, oppure il dipendente stesso sui propri dati)
// Scheda dettaglio di un dipendente + confronto col periodo precedente.
async function getEmployeeDetail(req, res) {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId)) {
    return res.status(400).json({ error: 'Identificativo dipendente non valido' });
  }

  // Un dipendente può vedere solo i propri dati; responsabile/dirigente vedono chiunque della società
  // (l'isolamento per società è già garantito da buildDetail, che filtra per companyId → 404 fuori società).
  if (req.user.role === 'user' && req.user.id !== targetId) {
    return res.status(403).json({ error: 'Non autorizzato a visualizzare questo report' });
  }

  const period = resolvePeriod(req, res);
  if (!period) return;

  const detail = await buildDetail({
    companyId: req.user.companyId,
    userId: targetId,
    start: period.start,
    end: period.end,
  });

  if (!detail) return res.status(404).json({ error: 'Dipendente non trovato' });

  return res.json(detail);
}

module.exports = { getEmployeesOverview, getEmployeeDetail };
