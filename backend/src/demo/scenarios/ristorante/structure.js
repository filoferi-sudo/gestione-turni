// Scenario RISTORANTE — struttura aziendale (dati puri, nessuna logica).
// Sede unica in centro storico; il ristorante è CHIUSO IL LUNEDÌ (nessun fabbisogno/turno MON,
// convenzione rispettata da planning.js e timeline.js). La finestra del calendario 09:00-23:30
// rispetta il CHECK a DB calendar_end_time > calendar_start_time.
module.exports = {
  company: {
    name: 'Ristorante Da Mario S.r.l.',
    email: 'info@demo-damario.example',
    phone: '051 234 5678',
    address: 'Via delle Vigne 12, Bologna',
    // Escalation sostituzioni attiva (24h): mostra anche questa funzionalità nella demo.
    escalationHours: 24,
  },
  sedi: [
    {
      ref: 'centro',
      name: 'Da Mario — Centro Storico',
      calendarStartTime: '09:00',
      calendarEndTime: '23:30',
    },
  ],
  aree: [
    { ref: 'sala', sedeRef: 'centro', name: 'Sala', calendarMode: 'shifts', displayOrder: 0 },
    { ref: 'cucina', sedeRef: 'centro', name: 'Cucina', calendarMode: 'shifts', displayOrder: 1 },
    { ref: 'bar', sedeRef: 'centro', name: 'Bar', calendarMode: 'shifts', displayOrder: 2 },
    { ref: 'accoglienza', sedeRef: 'centro', name: 'Accoglienza', calendarMode: 'shifts', displayOrder: 3 },
    { ref: 'eventi', sedeRef: 'centro', name: 'Eventi & Formazione', calendarMode: 'courses', displayOrder: 4 },
  ],
};
