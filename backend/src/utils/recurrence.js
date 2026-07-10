const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// Da non sostituire con toISOString(): quel metodo converte in UTC e farebbe
// slittare indietro la data nei fusi orari UTC+ (es. CEST).
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Formati supportati: "DAILY" oppure "WEEKLY:MON,WED,FRI"
function parseRecurrenceRule(rule) {
  if (rule === 'DAILY') return { freq: 'daily' };

  if (rule && rule.startsWith('WEEKLY:')) {
    const days = rule
      .slice('WEEKLY:'.length)
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);

    if (days.length === 0 || !days.every((d) => DAY_CODES.includes(d))) {
      throw new Error(`Regola di ricorrenza non valida: ${rule}`);
    }
    return { freq: 'weekly', days };
  }

  throw new Error(`Regola di ricorrenza non valida: ${rule}`);
}

// L'eventuale "date" salvata sulla regola è l'ancora: la ricorrenza si applica solo da quella data in poi
function occursOn(rule, dateStr, anchorDateStr) {
  if (anchorDateStr && dateStr < anchorDateStr) return false;

  const parsed = parseRecurrenceRule(rule);
  if (parsed.freq === 'daily') return true;

  const dayCode = DAY_CODES[new Date(`${dateStr}T00:00:00`).getDay()];
  return parsed.days.includes(dayCode);
}

// Espande una regola di ricorrenza in tutte le date (incluse) nell'intervallo [rangeStart, rangeEnd]
function expandRecurrenceDates(rule, anchorDateStr, rangeStart, rangeEnd) {
  const dates = [];
  const cursor = new Date(`${rangeStart}T00:00:00`);
  const end = new Date(`${rangeEnd}T00:00:00`);

  while (cursor <= end) {
    const dateStr = formatLocalDate(cursor);
    if (occursOn(rule, dateStr, anchorDateStr)) dates.push(dateStr);
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

module.exports = { DAY_CODES, formatLocalDate, parseRecurrenceRule, occursOn, expandRecurrenceDates };
