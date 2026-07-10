// Scenario RISTORANTE — pianificazione: orari per area, fabbisogni di personale, corsi, e la
// conversione dei pattern settimanali delle persone in turni fissi ricorrenti (il "backbone" che,
// ancorato a -90 giorni, fa risultare il ristorante operativo da mesi). Dati puri, nessuna logica.

// Orari concreti di pranzo/cena per area (la cucina entra prima, il bar copre l'aperitivo serale).
const SLOT_TIMES = {
  sala:        { lunch: ['11:30', '15:00'], dinner: ['18:30', '23:30'] },
  cucina:      { lunch: ['10:30', '15:00'], dinner: ['17:30', '23:30'] },
  bar:         { lunch: ['11:00', '15:00'], dinner: ['17:30', '23:30'] },
  accoglienza: { lunch: ['11:30', '15:00'], dinner: ['18:30', '23:30'] },
};

// Giorni di apertura (chiuso il lunedì). Ordine coerente con la settimana lavorativa del locale.
const OPEN_DAYS = ['TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

// Durata in ore di una fascia (per gli assert di coerenza e le statistiche).
function slotHours(area, slot) {
  const [s, e] = SLOT_TIMES[area][slot];
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return (toMin(e) - toMin(s)) / 60;
}

// Trasforma i pattern settimanali delle persone in turni fissi ricorrenti (WEEKLY per giorno),
// ancorati a -90 giorni. Una riga per (persona, fascia) con i giorni raggruppati: compatto e
// coerente con expandRecurrenceDates. `helpers.offsetToDate` fornisce l'ancora.
function buildFixedShifts(people, helpers) {
  const turni = [];
  const anchorOffset = -90;
  const anchorDate = helpers.offsetToDate(anchorOffset);
  const anchorWeekday = helpers.weekdayCode(anchorDate);

  for (const p of people) {
    if (!p.pattern) continue;
    const area = p.areas[0]; // area primaria = orari dei turni fissi
    const times = SLOT_TIMES[area];
    for (const slot of ['l', 'd']) {
      const days = p.pattern[slot];
      if (!days || !days.length) continue;
      const [startTime, endTime] = slot === 'l' ? times.lunch : times.dinner;
      // L'ancora di un turno fisso deve cadere su un giorno della ricorrenza, altrimenti la prima
      // occorrenza slitterebbe: se l'ancora -90 non è tra i giorni, si arretra al giorno giusto.
      let anchorForRule = anchorOffset;
      if (!days.includes(anchorWeekday)) {
        // trova il primo offset <= -90 il cui weekday è nel set (entro 7 giorni)
        for (let back = 1; back <= 7; back += 1) {
          if (days.includes(helpers.weekdayCode(helpers.offsetToDate(anchorOffset - back)))) {
            anchorForRule = anchorOffset - back;
            break;
          }
        }
      }
      turni.push({
        type: 'fixed',
        userRef: p.ref,
        areaRef: area,
        startTime,
        endTime,
        recurrenceRule: `WEEKLY:${days.join(',')}`,
        dateOffset: anchorForRule,
        createdByRef: p.role === 'admin' || p.role === 'dirigente' ? 'dirigente' : 'resp_sala',
        createdAtOffset: -92,
        note: null,
      });
    }
  }
  return turni;
}

// Fabbisogno di personale fisso per area/fascia (quante persone servono, per giorno della
// settimana). Numeri realistici: weekend più coperti, lunedì chiuso (nessuna riga MON).
// weekendBoost: +1/+2 su ven/sab/dom. Ogni riga è indipendente (una per giorno).
function buildStaffingRequirements() {
  const req = [];
  const add = (areaRef, slot, weekday, count, times) => {
    req.push({
      areaRef, reqType: 'fixed', weekday,
      startTime: times[0], endTime: times[1], requiredCount: count,
      effectiveFromOffset: -90, createdByRef: 'dirigente',
      note: null,
    });
  };
  // Base per area/fascia + rinforzo weekend.
  const plan = [
    { area: 'sala', lunch: 3, dinner: 4 },
    { area: 'cucina', lunch: 3, dinner: 4 },
    { area: 'bar', lunch: 1, dinner: 2 },
    { area: 'accoglienza', lunch: 1, dinner: 1 },
  ];
  for (const { area, lunch, dinner } of plan) {
    for (const weekday of OPEN_DAYS) {
      const boost = ['FRI', 'SAT', 'SUN'].includes(weekday) ? 1 : 0;
      add(area, 'lunch', weekday, lunch + boost, SLOT_TIMES[area].lunch);
      add(area, 'dinner', weekday, dinner + boost, SLOT_TIMES[area].dinner);
    }
  }
  return req;
}

// Corsi (area Eventi & Formazione, calendar_mode='courses'): un corso fisso ricorrente (HACCP),
// alcune degustazioni singole passate/future e un corso "volante" aperto (senza istruttore).
function buildCourses(helpers) {
  return [
    {
      name: 'Formazione HACCP e sicurezza alimentare',
      type: 'fixed', instructorRef: 'cuo_giuseppe', areaRef: 'eventi',
      startTime: '15:30', endTime: '17:00', recurrenceRule: 'WEEKLY:WED',
      dateOffset: helpers.weekdayCode(helpers.offsetToDate(-88)) === 'WED' ? -88 : -85,
      createdByRef: 'dirigente', createdAtOffset: -90,
      note: 'Modulo obbligatorio per tutto il personale di cucina e sala.',
    },
    {
      name: 'Degustazione nuovo menù autunnale',
      type: 'mobile', instructorRef: 'resp_cucina', areaRef: 'eventi',
      startTime: '16:00', endTime: '17:30', dateOffset: -21,
      createdByRef: 'resp_cucina', createdAtOffset: -30,
      note: 'Presentazione dei nuovi piatti allo staff di sala.',
    },
    {
      name: 'Corso abbinamento vini',
      type: 'mobile', instructorRef: 'resp_sala', areaRef: 'eventi',
      startTime: '16:00', endTime: '18:00', dateOffset: 6,
      createdByRef: 'resp_sala', createdAtOffset: -3,
      note: 'Aperto ai camerieri di sala interessati.',
    },
    {
      // Corso "volante": disponibile, ancora senza istruttore assegnato.
      name: 'Aggiornamento allergeni', type: 'volante', areaRef: 'eventi',
      startTime: '15:30', endTime: '16:30', dateOffset: 9,
      createdByRef: 'dirigente', createdAtOffset: -1,
      note: 'Cerchiamo un formatore interno disponibile.',
    },
  ];
}

module.exports = {
  SLOT_TIMES, OPEN_DAYS, slotHours,
  buildFixedShifts, buildStaffingRequirements, buildCourses,
};
