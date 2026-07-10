// Scenario RISTORANTE — punto di ingresso: implementa il CONTRATTO dello scenario (vedi
// backend/src/demo/framework/loader.js). Assembla i moduli dati (struttura, persone,
// pianificazione, timeline) in un unico dataset a sezioni generiche. NON accede al database:
// è una funzione pura, il framework si occupa dell'inserimento.
const metadata = require('./metadata');
const structure = require('./structure');
const { people } = require('./people');
const planning = require('./planning');
const timeline = require('./timeline');

// Username/email demo: namespace riservato "demo-ristorante-…" (il loader impone il prefisso
// "demo-" per non collidere con account reali, dato l'UNIQUE globale su username/email).
function slug(person) {
  return `${person.first}.${person.last}`
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z.]/g, '');
}

function build({ rng, helpers }) {
  // — Utenti / contratti / disponibilità dalle persone hand-authored —
  const utenti = people.map((p) => ({
    ref: p.ref,
    username: `demo-ristorante-${slug(p)}`,
    email: `${slug(p)}@demo-damario.example`,
    phone: null,
    role: p.role,
    areaRefs: p.areas,
  }));

  const contratti = people
    .filter((p) => p.contract)
    .map((p) => ({ userRef: p.ref, createdByRef: 'dirigente', ...p.contract }));

  const disponibilita = people.flatMap((p) =>
    (p.avail || []).map((slot) => ({ userRef: p.ref, ...slot }))
  );

  // — Pianificazione: turni fissi (backbone -90gg), fabbisogni, corsi —
  const turniFissi = planning.buildFixedShifts(people, helpers);
  const fabbisogni = planning.buildStaffingRequirements();
  const corsi = planning.buildCourses(helpers);

  // — Presente + storico —
  const tl = timeline.build({ people, rng, helpers });

  // Invariante di coerenza (fail-fast PRIMA di toccare il DB): nessun dipendente supera il proprio
  // monte ore settimanale contrattuale con i soli turni fissi (il backbone deve restare plausibile).
  assertWeeklyHours(people, turniFissi, planning);

  return {
    company: structure.company,
    sedi: structure.sedi,
    aree: structure.aree,
    utenti,
    contratti,
    disponibilita,
    optouts: tl.optouts,
    fabbisogni,
    turni: [...turniFissi, ...tl.turni],
    corsi,
    richiesteCancellazione: tl.richiesteCancellazione,
    proposte: tl.proposte,
    notifiche: tl.notifiche,
    auditLogs: tl.auditLogs,
    tourContext: tl.tourContext,
  };
}

// Somma le ore dei turni fissi settimanali per persona e verifica il massimale contrattuale.
function assertWeeklyHours(people, turniFissi, planning) {
  const byRef = new Map(people.map((p) => [p.ref, p]));
  const weekly = new Map();
  for (const t of turniFissi) {
    const person = byRef.get(t.userRef);
    const slot = t.startTime < '16:00' ? 'lunch' : 'dinner';
    const hours = planning.slotHours(person.areas[0], slot);
    const days = t.recurrenceRule.replace('WEEKLY:', '').split(',').length;
    weekly.set(t.userRef, (weekly.get(t.userRef) || 0) + hours * days);
  }
  const problems = [];
  for (const [ref, hours] of weekly) {
    const max = byRef.get(ref).contract && byRef.get(ref).contract.maxWeeklyHours;
    if (max != null && hours > max + 0.001) {
      problems.push(`${ref}: ${hours}h > ${max}h`);
    }
  }
  if (problems.length) {
    throw new Error(`[demo:ristorante] Monte ore settimanale superato: ${problems.join('; ')}`);
  }
}

module.exports = { ...metadata, build };
