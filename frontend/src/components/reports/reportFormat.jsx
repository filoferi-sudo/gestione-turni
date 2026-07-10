// Helper di presentazione condivisi dalla sezione Report. Le etichette di "stato operativo" sono
// descrizioni oggettive delle ore pianificate rispetto al contratto — NON giudizi sul dipendente.

const STATUS_META = {
  no_contract: { label: 'Nessun contratto', cls: 'report-status-neutral' },
  on_track: { label: 'In linea col contratto', cls: 'report-status-ok' },
  over: { label: 'Sopra il monte ore', cls: 'report-status-over' },
  under: { label: 'Sotto il monte ore', cls: 'report-status-under' },
};

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || STATUS_META.no_contract;
  return <span className={`report-status ${meta.cls}`}>{meta.label}</span>;
}

// Formatta un numero di ore (una cifra decimale, senza decimali inutili).
export function fmtHours(value) {
  if (value == null) return '—';
  return `${Number(value).toFixed(1).replace(/\.0$/, '')} h`;
}

// Formatta una differenza con segno esplicito (+/−). null = non calcolabile (nessun contratto).
export function fmtDiff(value) {
  if (value == null) return '—';
  const n = Number(value);
  const sign = n > 0 ? '+' : n < 0 ? '−' : '';
  return `${sign}${Math.abs(n).toFixed(1).replace(/\.0$/, '')} h`;
}

export function diffClass(value) {
  if (value == null) return '';
  if (value > 0) return 'report-diff-pos';
  if (value < 0) return 'report-diff-neg';
  return '';
}

// Variazione tra due valori numerici (periodo attuale vs precedente), con segno.
export function fmtDelta(current, previous, unit = '') {
  const delta = (current || 0) - (previous || 0);
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  const abs = Math.abs(delta);
  const shown = Number.isInteger(abs) ? abs : abs.toFixed(1).replace(/\.0$/, '');
  return `${sign}${shown}${unit}`;
}

export function deltaClass(current, previous) {
  const delta = (current || 0) - (previous || 0);
  if (delta > 0) return 'report-diff-pos';
  if (delta < 0) return 'report-diff-neg';
  return '';
}
