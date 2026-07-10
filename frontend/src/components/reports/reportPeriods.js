import { formatDateISO, addDays, startOfWeek } from '../../utils/dates';

// Preset di periodo per la sezione Report. Ogni preset restituisce { start, end } in formato
// ISO (YYYY-MM-DD). Il backend confronta sempre con il periodo immediatamente precedente della
// stessa durata, quindi qui non serve calcolare il periodo di confronto.
function monthRange(year, monthIndex) {
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return { start: formatDateISO(start), end: formatDateISO(end) };
}

export function getPeriodPresets(reference = new Date()) {
  const y = reference.getFullYear();
  const m = reference.getMonth();
  const monday = startOfWeek(reference);

  return [
    { id: 'this-month', label: 'Questo mese', ...monthRange(y, m) },
    { id: 'last-month', label: 'Mese scorso', ...monthRange(y, m - 1) },
    {
      id: 'last-30',
      label: 'Ultimi 30 giorni',
      start: formatDateISO(addDays(reference, -29)),
      end: formatDateISO(reference),
    },
    {
      id: 'this-week',
      label: 'Questa settimana',
      start: formatDateISO(monday),
      end: formatDateISO(addDays(monday, 6)),
    },
  ];
}

export const DEFAULT_PERIOD_ID = 'this-month';

// Etichetta leggibile di un intervallo, es. "1 giu 2026 – 30 giu 2026".
export function formatPeriodLabel(start, end) {
  if (!start || !end) return '';
  const fmt = (iso) => {
    const [yy, mm, dd] = iso.split('-').map(Number);
    return new Date(yy, mm - 1, dd).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };
  return `${fmt(start)} – ${fmt(end)}`;
}
