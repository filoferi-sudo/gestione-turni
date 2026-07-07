// Valori storici di default, usati solo come fallback quando non è disponibile l'orario
// configurato per la sede (es. contesti senza area/sede, se mai dovessero esistere).
const DAY_START = '07:30';
const DAY_END = '23:00';

function isValidTimeString(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// I turni/corsi devono stare interamente dentro la fascia configurata per la sede a cui
// appartiene l'area (dayStart/dayEnd, es. "07:30"/"23:00" o "05:00"/"00:00"), e avere durata
// positiva. Un dayEnd di "00:00" indica mezzanotte come fine giornata (trattato come 24:00, non
// come inizio giornata), coerente con l'esempio "05:00 -> 00:00" richiesto lato configurazione
// sede. dayStart/dayEnd sono opzionali per compatibilità, con fallback ai valori storici.
function isWithinDailyWindow(startTime, endTime, dayStart = DAY_START, dayEnd = DAY_END) {
  if (!isValidTimeString(startTime) || !isValidTimeString(endTime)) return false;
  const startMin = toMinutes(startTime);
  const endMin = toMinutes(endTime);
  const dayStartMin = toMinutes(dayStart);
  const dayEndMin = dayEnd === '00:00' ? 24 * 60 : toMinutes(dayEnd);
  return startMin >= dayStartMin && endMin <= dayEndMin && startMin < endMin;
}

module.exports = { DAY_START, DAY_END, isValidTimeString, isWithinDailyWindow };
