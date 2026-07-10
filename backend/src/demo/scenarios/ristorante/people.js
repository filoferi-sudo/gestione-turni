// Scenario RISTORANTE — organico (dati puri, scritti a mano, NON casuali).
// ~35 persone coerenti: 1 dirigente (titolare), 2 responsabili, 32 dipendenti su 4 aree operative
// a turni (Sala, Cucina, Bar, Accoglienza) + alcuni istruttori multi-area per l'area Corsi
// (Eventi & Formazione). Ogni persona porta con sé: contratto, disponibilità dichiarate e il
// proprio pattern settimanale di turni fissi (backbone che, ancorato a -90 giorni, dà al sistema
// l'aspetto di essere operativo "da mesi"). Il ristorante è CHIUSO IL LUNEDÌ: nessun pattern usa MON.
//
// Preset di contratto (i massimali alimentano il motore di compatibilità e le statistiche).
const C = {
  FULL:  { contractType: 'Tempo pieno', maxWeeklyHours: 40, maxMonthlyHours: 173, maxDailyHours: 9, maxConsecutiveDays: 6, weeklyRestDays: 1 },
  PT30:  { contractType: 'Part-time 30h', maxWeeklyHours: 30, maxDailyHours: 8, maxConsecutiveDays: 6, weeklyRestDays: 1 },
  PT24:  { contractType: 'Part-time 24h', maxWeeklyHours: 24, maxDailyHours: 8, maxConsecutiveDays: 5, weeklyRestDays: 2 },
  PT20:  { contractType: 'Part-time 20h', maxWeeklyHours: 20, maxDailyHours: 6, maxConsecutiveDays: 5, weeklyRestDays: 2 },
  APPR:  { contractType: 'Apprendistato', maxWeeklyHours: 40, maxMonthlyHours: 173, maxDailyHours: 8, maxConsecutiveDays: 6, weeklyRestDays: 1, note: 'Contratto di apprendistato: affiancamento previsto nei primi mesi.' },
  EXTRA: { contractType: 'Extra / a chiamata', maxWeeklyHours: 16, maxDailyHours: 8, note: 'Chiamata per eventi, weekend e picchi stagionali.' },
};

// Preset di disponibilità dichiarate (assenza = "ignota", non incompatibile: la lasciano vuota i
// full-timer con pattern fisso già chiaro, per esercitare quel ramo del motore in Fase 4).
const lunch = (d) => d.map((w) => ({ weekday: w, startTime: '11:00', endTime: '15:30' }));
const dinner = (d) => d.map((w) => ({ weekday: w, startTime: '17:30', endTime: '23:30' }));
const A = {
  SERE_WEEKEND: [...dinner(['TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']), ...lunch(['SAT', 'SUN'])],
  PRANZI:       lunch(['TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']),
  WEEKEND_ONLY: [...lunch(['SAT', 'SUN']), ...dinner(['FRI', 'SAT', 'SUN'])],
  AMPIA:        [...lunch(['TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']), ...dinner(['TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'])],
  NONE:         [],
};

// Pattern settimanale di turni fissi. { l: [giorni a pranzo], d: [giorni a cena] }. Gli orari
// concreti dipendono dall'area (vedi planning.js SLOT_TIMES). Tenuti sotto i massimali settimanali.
const P = (l = [], d = []) => ({ l, d });

// Elenco persone. ref = identificatore simbolico usato ovunque nel dataset.
// Il primo elemento di `areas` è l'area PRIMARIA (determina gli orari dei turni fissi).
const people = [
  // ── Dirigente (titolare) ──────────────────────────────────────────────────────────────────
  { ref: 'dirigente', first: 'Mario', last: 'Bianchi', role: 'dirigente', areas: [], avail: A.NONE, pattern: null },

  // ── Responsabili ──────────────────────────────────────────────────────────────────────────
  { ref: 'resp_sala', first: 'Laura', last: 'Verdi', role: 'admin', areas: ['sala', 'accoglienza', 'eventi'], contract: C.FULL, avail: A.NONE, pattern: P(['TUE', 'WED', 'THU', 'FRI'], ['FRI', 'SAT', 'SUN']) },
  { ref: 'resp_cucina', first: 'Antonio', last: 'Russo', role: 'admin', areas: ['cucina', 'eventi'], contract: C.FULL, avail: A.NONE, pattern: P(['TUE', 'WED', 'THU', 'SAT'], ['FRI', 'SAT', 'SUN']) },

  // ── Sala (camerieri, runner, chef de rang) ──────────────────────────────────────────────────
  { ref: 'cam_giulia', first: 'Giulia', last: 'Conti', role: 'user', areas: ['sala'], contract: C.PT20, avail: A.SERE_WEEKEND, pattern: P([], ['THU', 'FRI', 'SAT', 'SUN']) },
  { ref: 'cam_marco', first: 'Marco', last: 'Ferrari', role: 'user', areas: ['sala'], contract: C.FULL, avail: A.NONE, pattern: P(['TUE', 'WED', 'THU', 'FRI'], ['TUE', 'WED', 'SAT']) },
  { ref: 'cam_sara', first: 'Sara', last: 'Greco', role: 'user', areas: ['sala'], contract: C.PT30, avail: A.AMPIA, pattern: P(['WED', 'THU', 'FRI'], ['FRI', 'SAT', 'SUN']) },
  { ref: 'cam_luca', first: 'Luca', last: 'Marino', role: 'user', areas: ['sala'], contract: C.FULL, avail: A.NONE, pattern: P(['TUE', 'WED', 'THU', 'SUN'], ['THU', 'FRI', 'SAT']) },
  { ref: 'cam_elena', first: 'Elena', last: 'Costa', role: 'user', areas: ['sala', 'accoglienza'], contract: C.PT24, avail: A.PRANZI, pattern: P(['TUE', 'WED', 'THU', 'FRI', 'SAT'], []) },
  { ref: 'cam_davide', first: 'Davide', last: 'Bruno', role: 'user', areas: ['sala'], contract: C.PT20, avail: A.SERE_WEEKEND, pattern: P([], ['WED', 'THU', 'FRI', 'SAT']) },
  { ref: 'cam_chiara', first: 'Chiara', last: 'Gallo', role: 'user', areas: ['sala'], contract: C.APPR, avail: A.AMPIA, pattern: P(['TUE', 'WED', 'THU', 'FRI'], ['FRI', 'SAT']) },
  { ref: 'cam_simone', first: 'Simone', last: 'Rizzo', role: 'user', areas: ['sala'], contract: C.PT24, avail: A.SERE_WEEKEND, pattern: P([], ['WED', 'FRI', 'SAT', 'SUN']) },
  { ref: 'cam_martina', first: 'Martina', last: 'De Luca', role: 'user', areas: ['sala'], contract: C.PT30, avail: A.AMPIA, pattern: P(['THU', 'FRI', 'SAT'], ['THU', 'FRI', 'SUN']) },
  { ref: 'cam_francesco', first: 'Francesco', last: 'Moretti', role: 'user', areas: ['sala'], contract: C.FULL, avail: A.NONE, pattern: P(['TUE', 'WED', 'SAT', 'SUN'], ['TUE', 'FRI', 'SAT']) },
  { ref: 'cam_alessia', first: 'Alessia', last: 'Barbieri', role: 'user', areas: ['sala'], contract: C.EXTRA, avail: A.WEEKEND_ONLY, pattern: P(['SAT', 'SUN'], ['SAT']) },
  { ref: 'cam_matteo', first: 'Matteo', last: 'Fontana', role: 'user', areas: ['sala'], contract: C.PT20, avail: A.SERE_WEEKEND, pattern: P([], ['WED', 'THU', 'SUN']) },

  // ── Cucina (capo partita, cuochi, aiuto cuochi, lavapiatti) ─────────────────────────────────
  { ref: 'cuo_giuseppe', first: 'Giuseppe', last: 'Esposito', role: 'user', areas: ['cucina', 'eventi'], contract: C.FULL, avail: A.NONE, pattern: P(['TUE', 'WED', 'THU', 'FRI', 'SAT'], ['SAT', 'SUN']) },
  { ref: 'cuo_roberto', first: 'Roberto', last: 'Romano', role: 'user', areas: ['cucina'], contract: C.FULL, avail: A.NONE, pattern: P(['TUE', 'WED', 'THU'], ['FRI', 'SAT', 'SUN']) },
  { ref: 'cuo_andrea', first: 'Andrea', last: 'Colombo', role: 'user', areas: ['cucina'], contract: C.PT30, avail: A.AMPIA, pattern: P(['WED', 'THU', 'FRI'], ['FRI', 'SAT']) },
  { ref: 'cuo_valentina', first: 'Valentina', last: 'Ricci', role: 'user', areas: ['cucina'], contract: C.FULL, avail: A.NONE, pattern: P(['TUE', 'WED', 'FRI', 'SAT'], ['THU', 'SAT']) },
  { ref: 'cuo_paolo', first: 'Paolo', last: 'Marchetti', role: 'user', areas: ['cucina'], contract: C.PT24, avail: A.PRANZI, pattern: P(['TUE', 'WED', 'THU', 'SAT'], []) },
  { ref: 'cuo_stefano', first: 'Stefano', last: 'Gatti', role: 'user', areas: ['cucina'], contract: C.APPR, avail: A.AMPIA, pattern: P(['WED', 'THU', 'FRI', 'SAT'], ['SAT', 'SUN']) },
  { ref: 'cuo_federica', first: 'Federica', last: 'Testa', role: 'user', areas: ['cucina'], contract: C.PT20, avail: A.SERE_WEEKEND, pattern: P([], ['FRI', 'SAT', 'SUN']) },
  { ref: 'cuo_nicola', first: 'Nicola', last: 'Longo', role: 'user', areas: ['cucina'], contract: C.PT30, avail: A.AMPIA, pattern: P(['TUE', 'FRI', 'SAT'], ['WED', 'SUN']) },
  { ref: 'cuo_cristina', first: 'Cristina', last: 'Serra', role: 'user', areas: ['cucina'], contract: C.EXTRA, avail: A.WEEKEND_ONLY, pattern: P(['SAT', 'SUN'], ['SAT']) },
  { ref: 'cuo_alberto', first: 'Alberto', last: 'Villa', role: 'user', areas: ['cucina'], contract: C.PT24, avail: A.PRANZI, pattern: P(['WED', 'THU', 'FRI', 'SUN'], []) },

  // ── Bar (baristi; qualcuno anche in sala) ────────────────────────────────────────────────────
  { ref: 'bar_giorgio', first: 'Giorgio', last: 'Fabbri', role: 'user', areas: ['bar'], contract: C.FULL, avail: A.NONE, pattern: P(['TUE', 'WED', 'THU', 'FRI'], ['FRI', 'SAT']) },
  { ref: 'bar_silvia', first: 'Silvia', last: 'Pellegrini', role: 'user', areas: ['bar', 'sala'], contract: C.PT30, avail: A.AMPIA, pattern: P(['WED', 'THU', 'FRI'], ['SAT', 'SUN']) },
  { ref: 'bar_emanuele', first: 'Emanuele', last: 'Sala', role: 'user', areas: ['bar'], contract: C.PT24, avail: A.SERE_WEEKEND, pattern: P([], ['TUE', 'WED', 'FRI', 'SAT']) },
  { ref: 'bar_beatrice', first: 'Beatrice', last: 'Neri', role: 'user', areas: ['bar'], contract: C.PT20, avail: A.SERE_WEEKEND, pattern: P([], ['THU', 'FRI', 'SAT']) },
  { ref: 'bar_riccardo', first: 'Riccardo', last: 'Monti', role: 'user', areas: ['bar'], contract: C.EXTRA, avail: A.WEEKEND_ONLY, pattern: P(['SUN'], ['FRI', 'SAT']) },
  { ref: 'bar_camilla', first: 'Camilla', last: 'Rinaldi', role: 'user', areas: ['bar'], contract: C.APPR, avail: A.AMPIA, pattern: P(['TUE', 'WED', 'THU'], ['FRI', 'SAT']) },

  // ── Accoglienza (hostess, maître, guardaroba) ────────────────────────────────────────────────
  { ref: 'acc_ilaria', first: 'Ilaria', last: 'Ferrari', role: 'user', areas: ['accoglienza'], contract: C.PT24, avail: A.SERE_WEEKEND, pattern: P([], ['WED', 'THU', 'FRI', 'SAT']) },
  { ref: 'acc_tommaso', first: 'Tommaso', last: 'Grassi', role: 'user', areas: ['accoglienza', 'sala'], contract: C.PT20, avail: A.WEEKEND_ONLY, pattern: P([], ['FRI', 'SAT', 'SUN']) },
  { ref: 'acc_veronica', first: 'Veronica', last: 'Caruso', role: 'user', areas: ['accoglienza'], contract: C.PT30, avail: A.AMPIA, pattern: P(['THU', 'FRI', 'SAT', 'SUN'], ['SAT', 'SUN']) },
  { ref: 'acc_greta', first: 'Greta', last: 'Fiore', role: 'user', areas: ['accoglienza'], contract: C.EXTRA, avail: A.WEEKEND_ONLY, pattern: P(['SAT', 'SUN'], []) },
];

module.exports = { people };
