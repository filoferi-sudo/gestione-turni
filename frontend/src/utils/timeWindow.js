// Densità verticale della griglia (px per minuto): scelta di stile, non dipende dalla sede.
export const PX_PER_MIN = 1;

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Costruisce la finestra oraria del calendario a partire dagli orari configurati per la sede
// (calendarStartTime/calendarEndTime, es. "07:30"/"23:00" o "05:00"/"00:00" -> gestito come
// giornata "corta" 05:00-24:00, i turni oltre mezzanotte non sono supportati). Se non indicati
// ricade sui valori storici di default (07:30-23:00): nessuna regressione per chi non ha ancora
// configurato una sede o per contesti in cui la sede non è disponibile.
export function createTimeWindow(startTime, endTime) {
  const dayStartMin = timeToMinutes(startTime || '07:30');
  const dayEndMin = timeToMinutes(endTime === '00:00' ? '24:00' : endTime || '23:00');
  const gridHeight = (dayEndMin - dayStartMin) * PX_PER_MIN;

  function windowMinutesToTop(minutes) {
    return (minutes - dayStartMin) * PX_PER_MIN;
  }

  // Etichette ogni ora, dall'inizio alla fine della finestra configurata
  function getHourMarks() {
    const marks = [];
    for (let m = dayStartMin; m <= dayEndMin; m += 60) {
      const h = Math.floor(m / 60) % 24;
      const min = m % 60;
      marks.push({ minutes: m, label: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` });
    }
    return marks;
  }

  return {
    DAY_START_MIN: dayStartMin,
    DAY_END_MIN: dayEndMin,
    GRID_HEIGHT: gridHeight,
    minutesToTop: windowMinutesToTop,
    getHourMarks,
  };
}

export const DEFAULT_TIME_WINDOW = createTimeWindow('07:30', '23:00');
