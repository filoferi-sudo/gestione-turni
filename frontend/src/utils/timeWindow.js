export const DAY_START_MIN = 7 * 60 + 30; // 07:30
export const DAY_END_MIN = 23 * 60; // 23:00
export const PX_PER_MIN = 1;
export const GRID_HEIGHT = (DAY_END_MIN - DAY_START_MIN) * PX_PER_MIN;

export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTop(minutes) {
  return (minutes - DAY_START_MIN) * PX_PER_MIN;
}

// Etichette ogni ora, dalle 07:30 alle 23:00
export function getHourMarks() {
  const marks = [];
  for (let m = DAY_START_MIN; m <= DAY_END_MIN; m += 60) {
    const h = Math.floor(m / 60);
    const min = m % 60;
    marks.push({ minutes: m, label: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` });
  }
  return marks;
}
