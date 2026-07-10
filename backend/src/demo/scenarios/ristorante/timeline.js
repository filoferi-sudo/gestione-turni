// Scenario RISTORANTE — "presente" e storico attività. Qui vivono gli stati che fanno sembrare il
// software usato quotidianamente: turni scoperti al giorno 0, la richiesta di assenza che innesca
// il tour commerciale, proposte mirate pendenti, notifiche non lette, ferie, e lo storico
// (cancellazioni decise, turni extra recenti, audit trail). I dati "visibili" sono scritti a mano
// per essere coerenti; lo storico di riempimento usa l'RNG DETERMINISTICO (stabile fra i reload).
const { SLOT_TIMES, OPEN_DAYS } = require('./planning');

// (day,slot) già occupati dal pattern fisso di una persona: per non generare turni sovrapposti.
function patternedSlots(person) {
  const set = new Set();
  if (person.pattern) {
    for (const w of person.pattern.l) set.add(`${w}:l`);
    for (const w of person.pattern.d) set.add(`${w}:d`);
  }
  return set;
}

function build({ people, rng, helpers }) {
  const byRef = new Map(people.map((p) => [p.ref, p]));
  const employees = people.filter((p) => p.role === 'user');
  const turni = [];
  const richiesteCancellazione = [];
  const proposte = [];
  const notifiche = [];
  const auditLogs = [];
  const optouts = [];

  const slotTimes = (area, slot) => SLOT_TIMES[area][slot === 'l' ? 'lunch' : 'dinner'];

  // ── STATI PRESENTI (scritti a mano) ─────────────────────────────────────────────────────────

  // 1) Gancio del TOUR COMMERCIALE: la cameriera Giulia ha un turno serale e ha chiesto di
  //    assentarsi. La richiesta è pendente: nel tour il dirigente la approva → il turno diventa
  //    scoperto → parte la ricerca del sostituto.
  const giuliaArea = 'sala';
  const [gStart, gEnd] = slotTimes(giuliaArea, 'd');
  turni.push({
    ref: 'giulia_shift', type: 'mobile', userRef: 'cam_giulia', areaRef: giuliaArea,
    startTime: gStart, endTime: gEnd, dateOffset: 2, createdByRef: 'resp_sala',
    createdAtOffset: -6, note: 'Servizio serale',
  });
  richiesteCancellazione.push({
    ref: 'giulia_req', shiftRef: 'giulia_shift', requestedByRef: 'cam_giulia',
    dateOffset: 2, startTime: gStart, endTime: gEnd, status: 'pending',
    note: 'Impegno personale, non riesco a coprire il turno.', createdAtOffset: -1,
  });
  notifiche.push({
    userRef: 'resp_sala', type: 'cancellation_requested', isRead: false, createdAtOffset: -1,
    message: 'Giulia Conti ha richiesto la cancellazione del turno del ' + helpers.offsetToDate(2) + ' 18:30-23:30',
    payload: { kind: 'cancellation', requestRef: 'giulia_req', areaRef: giuliaArea, dateOffset: 2 },
  });

  // 2) Una richiesta di FERIE pendente (mappatura ferie → richiesta di cancellazione + opt-out).
  const [sStart, sEnd] = slotTimes('sala', 'd');
  turni.push({
    ref: 'simone_shift', type: 'mobile', userRef: 'cam_simone', areaRef: 'sala',
    startTime: sStart, endTime: sEnd, dateOffset: 5, createdByRef: 'resp_sala',
    createdAtOffset: -4, note: 'Servizio serale',
  });
  richiesteCancellazione.push({
    ref: 'simone_req', shiftRef: 'simone_shift', requestedByRef: 'cam_simone',
    dateOffset: 5, startTime: sStart, endTime: sEnd, status: 'pending',
    note: 'Ferie già programmate.', createdAtOffset: -2,
  });

  // 3) TURNI SCOPERTI / SOSTITUZIONI APERTE al giorno 0 (pannello "Sostituzioni disponibili").
  const [voStart, voEnd] = slotTimes('sala', 'd');
  turni.push({
    ref: 'vol_oggi', type: 'volante', areaRef: 'sala', startTime: voStart, endTime: voEnd,
    dateOffset: 0, createdByRef: 'resp_sala', createdAtOffset: -1, note: 'Rinforzo serale in sala',
  });
  // Volante di domani a pranzo in cucina, generato da una cancellazione (origin_shift_id).
  const [vdStart, vdEnd] = slotTimes('cucina', 'l');
  turni.push({
    ref: 'domani_origin', type: 'mobile', userRef: 'cuo_paolo', areaRef: 'cucina',
    startTime: vdStart, endTime: vdEnd, dateOffset: 1, status: 'cancelled_approved',
    createdByRef: 'resp_cucina', createdAtOffset: -8, note: 'Turno annullato (sostituito)',
  });
  turni.push({
    ref: 'vol_domani', type: 'volante', areaRef: 'cucina', startTime: vdStart, endTime: vdEnd,
    dateOffset: 1, originShiftRef: 'domani_origin', createdByRef: 'resp_cucina',
    createdAtOffset: -1, note: null,
  });

  // 4) PROPOSTE MIRATE pendenti su una sostituzione scoperta (sezione "Le mie proposte").
  const [vpStart, vpEnd] = slotTimes('sala', 'd');
  turni.push({
    ref: 'vol_proposte', type: 'volante', areaRef: 'sala', startTime: vpStart, endTime: vpEnd,
    dateOffset: 3, createdByRef: 'resp_sala', createdAtOffset: -2, note: 'Copertura sabato sera',
  });
  proposte.push({
    shiftRef: 'vol_proposte', userRef: 'cam_sara', proposedByRef: 'resp_sala', status: 'pending',
    score: 88, createdAtOffset: -2,
    reasons: [
      { text: 'Disponibile nella fascia richiesta', kind: 'positive' },
      { text: 'Sotto il monte ore settimanale', kind: 'positive' },
      { text: 'Assegnata all\'area Sala', kind: 'positive' },
    ],
  });
  proposte.push({
    shiftRef: 'vol_proposte', userRef: 'cam_davide', proposedByRef: 'resp_sala', status: 'pending',
    score: 74, createdAtOffset: -2,
    reasons: [
      { text: 'Disponibile la sera nel weekend', kind: 'positive' },
      { text: 'Carico di lavoro nella media', kind: 'neutral' },
    ],
  });
  proposte.push({
    shiftRef: 'vol_proposte', userRef: 'cam_matteo', proposedByRef: 'resp_sala', status: 'declined',
    score: 61, respondedAtOffset: -1, createdAtOffset: -2,
    reasons: [{ text: 'Disponibilità serale dichiarata', kind: 'positive' }],
  });
  notifiche.push({
    userRef: 'cam_sara', type: 'substitution_proposed', isRead: false, createdAtOffset: -2,
    message: 'Ti è stata proposta una sostituzione in Sala: ' + helpers.offsetToDate(3) + ' 18:30-23:30',
    payload: { kind: 'proposal', shiftRef: 'vol_proposte', areaRef: 'sala', dateOffset: 3 },
  });
  notifiche.push({
    userRef: 'cam_davide', type: 'substitution_proposed', isRead: false, createdAtOffset: -2,
    message: 'Ti è stata proposta una sostituzione in Sala: ' + helpers.offsetToDate(3) + ' 18:30-23:30',
    payload: { kind: 'proposal', shiftRef: 'vol_proposte', areaRef: 'sala', dateOffset: 3 },
  });

  // 5) Notifiche ai gestori per i turni scoperti (badge campanella pieno al primo accesso).
  for (const manager of ['dirigente', 'resp_sala']) {
    notifiche.push({
      userRef: manager, type: 'substitution_open_manager', isRead: false, createdAtOffset: -1,
      message: 'Turno scoperto da coprire in Sala: ' + helpers.offsetToDate(0) + ' 18:30-23:30',
      payload: { kind: 'substitution', shiftRef: 'vol_oggi', areaRef: 'sala', dateOffset: 0 },
    });
  }
  notifiche.push({
    userRef: 'resp_cucina', type: 'substitution_open_manager', isRead: false, createdAtOffset: -1,
    message: 'Turno scoperto da coprire in Cucina: ' + helpers.offsetToDate(1) + ' 10:30-15:00',
    payload: { kind: 'substitution', shiftRef: 'vol_domani', areaRef: 'cucina', dateOffset: 1 },
  });

  // 6) FERIE: un opt-out attivo (in ferie la prossima settimana) + uno storico.
  optouts.push({ userRef: 'cam_luca', startOffset: 7, endOffset: 13, note: 'Ferie' });
  optouts.push({ userRef: 'cuo_valentina', startOffset: -40, endOffset: -33, note: 'Ferie estive' });

  // ── STORICO (generato in modo DETERMINISTICO, stabile fra i reload) ─────────────────────────

  // 7) Turni extra recenti (mobile assegnati) su fasce libere dal pattern: densità realistica.
  const salaCucinaBar = employees.filter((p) => ['sala', 'cucina', 'bar'].includes(p.areas[0]));
  let extraCount = 0;
  for (const offset of [-12, -9, -6, -5, -3, -2, 3, 4, 6, 8]) {
    const weekday = helpers.weekdayOfOffset(offset);
    if (!OPEN_DAYS.includes(weekday)) continue;
    const candidates = rng.shuffle(salaCucinaBar).filter((p) => {
      const occupied = patternedSlots(p);
      return !occupied.has(`${weekday}:l`) || !occupied.has(`${weekday}:d`);
    });
    const person = candidates[0];
    if (!person) continue;
    const occupied = patternedSlots(person);
    const slot = occupied.has(`${weekday}:d`) ? 'l' : 'd';
    if (occupied.has(`${weekday}:${slot}`)) continue;
    const [st, et] = slotTimes(person.areas[0], slot);
    turni.push({
      type: 'mobile', userRef: person.ref, areaRef: person.areas[0], startTime: st, endTime: et,
      dateOffset: offset, createdByRef: person.areas[0] === 'cucina' ? 'resp_cucina' : 'resp_sala',
      createdAtOffset: offset - 3, note: 'Rinforzo',
    });
    extraCount += 1;
  }

  // 8) Storico cancellazioni: turni singoli passati con richiesta decisa (approvata/rifiutata).
  //    Le approvate lasciano il turno a 'cancelled_approved' (come fa approveRequest); alcune hanno
  //    generato una sostituzione poi coperta da un collega (origin + volante assegnato).
  const histDefs = [
    { off: -3, ref: 'cam_martina', area: 'sala', slot: 'd', decided: 'approved', replacedBy: 'cam_sara' },
    { off: -8, ref: 'cuo_andrea', area: 'cucina', slot: 'd', decided: 'approved', replacedBy: 'cuo_stefano' },
    { off: -14, ref: 'bar_beatrice', area: 'bar', slot: 'd', decided: 'rejected' },
    { off: -21, ref: 'cam_davide', area: 'sala', slot: 'd', decided: 'approved', replacedBy: null },
    { off: -28, ref: 'cuo_federica', area: 'cucina', slot: 'd', decided: 'approved', replacedBy: 'cuo_nicola' },
    { off: -35, ref: 'cam_chiara', area: 'sala', slot: 'l', decided: 'rejected' },
    { off: -45, ref: 'acc_ilaria', area: 'accoglienza', slot: 'd', decided: 'approved', replacedBy: null },
    { off: -52, ref: 'bar_emanuele', area: 'bar', slot: 'd', decided: 'approved', replacedBy: null },
    { off: -63, ref: 'cam_matteo', area: 'sala', slot: 'd', decided: 'rejected' },
    { off: -70, ref: 'cuo_paolo', area: 'cucina', slot: 'l', decided: 'approved', replacedBy: 'cuo_alberto' },
  ];
  let histIdx = 0;
  for (const h of histDefs) {
    const [st, et] = slotTimes(h.area, h.slot);
    const shiftRef = `hist_${histIdx}`;
    const managerRef = h.area === 'cucina' ? 'resp_cucina' : 'resp_sala';
    turni.push({
      ref: shiftRef, type: 'mobile', userRef: h.ref, areaRef: h.area, startTime: st, endTime: et,
      dateOffset: h.off, status: h.decided === 'approved' ? 'cancelled_approved' : 'active',
      createdByRef: managerRef, createdAtOffset: h.off - 5, note: null,
    });
    richiesteCancellazione.push({
      shiftRef, requestedByRef: h.ref, dateOffset: h.off, startTime: st, endTime: et,
      status: h.decided, decidedByRef: managerRef, decidedAtOffset: h.off - 1,
      createdAtOffset: h.off - 2, note: h.decided === 'rejected' ? 'Non approvata: personale insufficiente.' : 'Assenza comunicata.',
    });
    if (h.decided === 'approved' && h.replacedBy) {
      // La sostituzione generata è stata coperta da un collega (volante assegnato nel passato).
      turni.push({
        type: 'volante', userRef: h.replacedBy, areaRef: h.area, startTime: st, endTime: et,
        dateOffset: h.off, originShiftRef: shiftRef, createdByRef: managerRef,
        createdAtOffset: h.off - 1, note: null,
      });
    }
    histIdx += 1;
  }

  // 9) Notifiche storiche già lette (mix, per non avere solo non-lette).
  for (const off of [-3, -8, -21]) {
    notifiche.push({
      userRef: 'resp_sala', type: 'substitution_claimed', isRead: true, createdAtOffset: off,
      message: 'Una sostituzione del ' + helpers.offsetToDate(off) + ' è stata coperta.',
      payload: { kind: 'substitution', areaRef: 'sala', dateOffset: off },
    });
  }

  // 10) AUDIT TRAIL: storico "chi ha fatto cosa" distribuito nei mesi.
  const pushAudit = (actorRef, action, off, metadata) =>
    auditLogs.push({ actorRef, action, createdAtOffset: off, createdAtTime: '09:15', metadata });
  pushAudit('dirigente', 'auth.login', -1, null);
  pushAudit('resp_sala', 'auth.login', -1, null);
  pushAudit('resp_cucina', 'auth.login', -2, null);
  pushAudit('dirigente', 'user.create', -85, { role: 'user', username: 'demo-ristorante-...' });
  pushAudit('dirigente', 'user.create', -84, { role: 'admin' });
  pushAudit('resp_sala', 'shift.create', -80, { type: 'fixed', area: 'sala' });
  pushAudit('resp_cucina', 'shift.create', -78, { type: 'fixed', area: 'cucina' });
  pushAudit('dirigente', 'course.create', -90, { name: 'Formazione HACCP' });
  pushAudit('resp_sala', 'cancellation.approve', -3, { area: 'sala' });
  pushAudit('resp_cucina', 'cancellation.approve', -8, { area: 'cucina' });
  pushAudit('resp_sala', 'cancellation.reject', -14, { area: 'bar' });
  pushAudit('resp_sala', 'shift.create', -1, { type: 'volante', area: 'sala' });

  const tourContext = {
    assenzaShiftId: { section: 'turni', ref: 'giulia_shift' },
    assenzaRequestId: { section: 'richiesteCancellazione', ref: 'giulia_req' },
    cameriereId: { section: 'utenti', ref: 'cam_giulia' },
    areaSalaId: { section: 'aree', ref: 'sala' },
  };

  return { turni, richiesteCancellazione, proposte, notifiche, auditLogs, optouts, tourContext, _extraCount: extraCount };
}

module.exports = { build };
