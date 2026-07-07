const { DAY_CODES } = require('./recurrence');

// Da non sostituire con toISOString(): stesso motivo già documentato in utils/recurrence.js
// (slitterebbe indietro di un giorno nei fusi orari UTC+).
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function weekdayOf(dateStr) {
  return DAY_CODES[new Date(`${dateStr}T00:00:00`).getDay()];
}

function addDays(dateStr, delta) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return formatLocalDate(d);
}

// Espande le regole di fabbisogno ('fixed' ricorrenti per giorno della settimana, 'single' per
// una data) in occorrenze concrete nell'intervallo [start, end], applicando le eccezioni delle
// regole fisse (skip se is_deleted, altrimenti override_count al posto di required_count).
// Tenuta separata da utils/recurrence.js (formato/ricorrenza diversi: qui il conteggio persone
// varia per singolo giorno della settimana, non un'unica regola condivisa) — stessa convenzione
// del progetto di non fondere logiche parallele per poterle far divergere senza intaccarsi a
// vicenda (vedi PROJECT_CONTEXT.md, Decisioni architetturali).
//
// requirements: righe normalizzate { id, reqType, weekday, date, startTime, endTime,
//   requiredCount, effectiveFrom, effectiveUntil, note }
// exceptionsByRequirementId: Map<requirementId, Map<dateStr, { isDeleted, overrideCount }>>
function expandRequirementOccurrences(requirements, exceptionsByRequirementId, start, end) {
  const occurrences = [];

  for (const req of requirements) {
    if (req.reqType === 'single') {
      if (req.date >= start && req.date <= end) {
        occurrences.push({
          requirementId: req.id,
          reqType: 'single',
          date: req.date,
          startTime: req.startTime,
          endTime: req.endTime,
          requiredCount: req.requiredCount,
          note: req.note,
        });
      }
      continue;
    }

    const rangeStart = req.effectiveFrom > start ? req.effectiveFrom : start;
    const rangeEnd = req.effectiveUntil && req.effectiveUntil < end ? req.effectiveUntil : end;
    if (rangeStart > rangeEnd) continue;

    const exceptions = exceptionsByRequirementId.get(req.id);
    const cursor = new Date(`${rangeStart}T00:00:00`);
    const cursorEnd = new Date(`${rangeEnd}T00:00:00`);

    while (cursor <= cursorEnd) {
      const dateStr = formatLocalDate(cursor);
      if (weekdayOf(dateStr) === req.weekday) {
        const exception = exceptions ? exceptions.get(dateStr) : undefined;
        if (!exception || !exception.isDeleted) {
          occurrences.push({
            requirementId: req.id,
            reqType: 'fixed',
            date: dateStr,
            startTime: req.startTime,
            endTime: req.endTime,
            requiredCount: exception ? exception.overrideCount : req.requiredCount,
            note: req.note,
          });
        }
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return occurrences.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

module.exports = { expandRequirementOccurrences, weekdayOf, addDays };
