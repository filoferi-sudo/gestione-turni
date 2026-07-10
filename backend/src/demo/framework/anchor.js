// Ancoraggio temporale dei dataset demo: gli scenari non contengono MAI date assolute, solo
// offset interi rispetto al "giorno 0" (anchor_date = il giorno in cui lo scenario viene
// caricato). Qui vivono le conversioni offset -> data concreta, riusando gli stessi helper
// TZ-safe del resto dell'app (mai toISOString: slitterebbe il giorno nei fusi UTC+).
const { formatLocalDate, DAY_CODES } = require('../../utils/recurrence');

function parseLocalDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`);
}

// 'YYYY-MM-DD' di oggi, nel fuso locale del server.
function todayLocalDate() {
  return formatLocalDate(new Date());
}

// Data (stringa 'YYYY-MM-DD') a `offset` giorni dall'ancora: offset negativi = passato (storico),
// 0 = oggi, positivi = futuro (pianificazione).
function offsetToDate(anchorDateStr, offset) {
  const d = parseLocalDate(anchorDateStr);
  d.setDate(d.getDate() + offset);
  return formatLocalDate(d);
}

// Timestamp testuale 'YYYY-MM-DD HH:MM:00' per valorizzare esplicitamente i created_at storici
// (le colonne TIMESTAMPTZ hanno DEFAULT NOW() ma accettano valori espliciti).
function offsetToTimestamp(anchorDateStr, offset, time = '09:00') {
  return `${offsetToDate(anchorDateStr, offset)} ${time}:00`;
}

// Codice giorno della settimana ('MON'..'SUN') di una data, stessa convenzione di
// staffing_requirements/user_availability/recurrence.js.
function weekdayCode(dateStr) {
  return DAY_CODES[parseLocalDate(dateStr).getDay()];
}

// Codice giorno della settimana della data a `offset` giorni dall'ancora: utile ai generatori di
// scenario (es. "il ristorante è chiuso il lunedì").
function weekdayOfOffset(anchorDateStr, offset) {
  return weekdayCode(offsetToDate(anchorDateStr, offset));
}

module.exports = { todayLocalDate, offsetToDate, offsetToTimestamp, weekdayCode, weekdayOfOffset };
