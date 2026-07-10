// Motore di caricamento degli scenari demo. È GENERICO: consuma un dataset a sezioni (vedi
// contratto sotto) senza sapere nulla del settore simulato — tutta la conoscenza specifica
// (ristorante, hotel, ...) vive nel modulo dello scenario. Punti fermi:
//   * TRANSAZIONE UNICA (BEGIN/COMMIT su un client dedicato): o l'ambiente demo è completo e
//     coerente, o non esiste — mai stati parziali visibili agli utenti demo. È il primo uso di
//     transazioni nel progetto, deliberatamente confinato a questo modulo (i controller esistenti
//     restano invariati).
//   * ADVISORY LOCK per scenario (pg_advisory_xact_lock): due caricamenti concorrenti dello stesso
//     scenario (es. due demo-login simultanei su ambiente stantio) si serializzano, il secondo
//     rilegge lo stato dentro il lock e trova l'ambiente già fresco.
//   * GUARDIA assertDemoCompany prima di ogni scrittura su una società esistente (chokepoint
//     anti-dati-reali, vedi guard.js).
//
// ── CONTRATTO DELLO SCENARIO ─────────────────────────────────────────────────────────────────
// module.exports = {
//   id, name, version,                       // version: bump ⇒ re-seed lazy al prossimo demo-login
//   personas: [{ key, role, userRef, label, description }],
//   logoPlaceholder: { initials, color },    // solo metadato per il frontend (nessuna colonna DB)
//   tours: ['commerciale', ...],
//   build({ anchorDate, rng, helpers }) => dataset   // funzione PURA: nessun accesso al DB
// }
// Il dataset è un oggetto a sezioni; ogni entità ha un `ref` simbolico e riferimenti `*Ref`;
// TUTTE le date sono offset interi dal giorno-ancora (negativi = passato). Sezioni (in ordine di
// inserimento; tutte opzionali tranne `company`):
//   company                { name, email, phone, address, escalationHours? }
//   sedi                   [{ ref, name, calendarStartTime?, calendarEndTime?, displayOrder? }]
//   aree                   [{ ref, sedeRef, name, calendarMode, displayOrder? }]
//   utenti                 [{ ref, username('demo-…'), email, phone?, role, areaRefs? }]
//   contratti              [{ userRef, contractType?, maxWeeklyHours?, maxMonthlyHours?,
//                             minWeeklyHours?, maxDailyHours?, maxConsecutiveDays?,
//                             weeklyRestDays?, note?, customConfig?, createdByRef? }]
//   disponibilita          [{ userRef, weekday, startTime, endTime }]
//   optouts                [{ userRef, startOffset, endOffset?, note? }]
//   fabbisogni             [{ ref?, areaRef, reqType('fixed'|'single'), weekday?, dateOffset?,
//                             startTime, endTime, requiredCount, effectiveFromOffset?,
//                             effectiveUntilOffset?, note?, createdByRef }]
//   eccezioniFabbisogno    [{ requirementRef, dateOffset, isDeleted?, overrideCount? }]
//   turni                  [{ ref?, type('fixed'|'mobile'|'volante'), userRef?, areaRef,
//                             dateOffset?, recurrenceRule?, startTime, endTime, note?, status?,
//                             originShiftRef?, requirementRef?, createdByRef, createdAtOffset?,
//                             createdAtTime? }]
//   eccezioniTurni         [{ shiftRef, dateOffset }]
//   corsi                  [{ ref?, name, type, instructorRef?, areaRef, dateOffset?,
//                             recurrenceRule?, startTime, endTime, note?, createdByRef,
//                             createdAtOffset?, createdAtTime? }]
//   richiesteCancellazione [{ ref?, shiftRef, requestedByRef, dateOffset, startTime, endTime,
//                             note?, status('pending'|'approved'|'rejected'), decidedByRef?,
//                             decidedAtOffset?, createdAtOffset?, createdAtTime? }]
//   proposte               [{ shiftRef, userRef, proposedByRef, status, score?, reasons?,
//                             respondedAtOffset?, createdAtOffset?, createdAtTime? }]
//   notifiche              [{ userRef, type, message, payload?, isRead?, createdAtOffset?,
//                             createdAtTime? }]   // nel payload le chiavi *Ref vengono risolte
//   auditLogs              [{ actorRef?, action, entityType?, entity?{section,ref}, metadata?,
//                             createdAtOffset?, createdAtTime? }]
//   tourContext            { chiave: { section, ref } }  // risolto in id reali in demo_state
// ─────────────────────────────────────────────────────────────────────────────────────────────
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const pool = require('../../config/db');
const { bcryptRounds } = require('../../config/security');
const { getScenario } = require('./registry');
const { assertDemoCompany } = require('./guard');
const { createRng } = require('./rng');
const { todayLocalDate, offsetToDate, offsetToTimestamp, weekdayCode, weekdayOfOffset } = require('./anchor');
const { reseedAfterDays, personaPassword } = require('./config');
const { resetScenarioCompany } = require('./reset');

// ── Stato ───────────────────────────────────────────────────────────────────────────────────

async function getDemoState(scenarioId, db = pool) {
  const { rows } = await db.query('SELECT * FROM demo_state WHERE scenario_id = $1', [scenarioId]);
  return rows[0] || null;
}

// Un ambiente è "stantio" se l'ancora è più vecchia della soglia configurata (la finestra di
// pianificazione futura del dataset si sta esaurendo) o se il dataset nel codice è stato
// aggiornato (version bump dello scenario).
function isStateStale(state, scenario) {
  if (Number(state.dataset_version) < Number(scenario.version)) return true;
  const anchorStr = formatDbDate(state.anchor_date);
  const ageDays = Math.floor(
    (new Date(`${todayLocalDate()}T00:00:00`) - new Date(`${anchorStr}T00:00:00`)) / 86400000
  );
  return ageDays >= reseedAfterDays();
}

// pg restituisce le colonne DATE come oggetti Date: normalizzazione TZ-safe a 'YYYY-MM-DD'.
function formatDbDate(value) {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

// ── API pubblica ────────────────────────────────────────────────────────────────────────────

// Garantisce un ambiente fresco per lo scenario: se assente, stantio o forzato lo (ri)genera,
// altrimenti restituisce lo stato esistente. È l'entry point sia del demo-login (lazy) sia del
// CLI locale. Ritorna { state, reloaded }.
async function loadScenario(scenarioId, { force = false } = {}) {
  const scenario = getScenario(scenarioId);
  return loadScenarioModule(scenario, { force });
}

// Variante che accetta direttamente il modulo scenario (usata anche dai test del framework).
async function loadScenarioModule(scenario, { force = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Serializza i load concorrenti dello stesso scenario (lock rilasciato a fine transazione).
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`demo:${scenario.id}`]);

    // Lo stato va riletto DENTRO il lock: un load concorrente potrebbe aver appena rigenerato.
    const existing = await getDemoState(scenario.id, client);
    if (existing && !force && !isStateStale(existing, scenario)) {
      await client.query('COMMIT');
      return { state: existing, reloaded: false };
    }
    if (existing) {
      await resetScenarioCompany(client, existing.company_id);
    }

    const anchorDate = todayLocalDate();
    // Seed deterministico: stesso scenario+versione ⇒ stesso mondo, traslato sulla nuova ancora.
    const rng = createRng(`demo:${scenario.id}:v${scenario.version}`);
    const helpers = {
      offsetToDate: (n) => offsetToDate(anchorDate, n),
      weekdayOfOffset: (n) => weekdayOfOffset(anchorDate, n),
      weekdayCode,
    };
    const dataset = scenario.build({ anchorDate, rng, helpers });
    const state = await insertDataset(client, scenario, dataset, anchorDate);

    await client.query('COMMIT');
    return { state, reloaded: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Inserimento generico del dataset ────────────────────────────────────────────────────────

async function insertDataset(client, scenario, dataset, anchorDate) {
  if (!dataset || !dataset.company || !dataset.company.name) {
    throw new Error('[demo] Dataset non valido: sezione company mancante');
  }
  const date = (offset) => offsetToDate(anchorDate, offset);
  const ts = (offset, time) => offsetToTimestamp(anchorDate, offset, time);

  // Mappe ref simbolico -> id reale, popolate man mano che le sezioni vengono inserite.
  const refs = {
    sedi: new Map(),
    aree: new Map(), // ref -> { id, sedeId }
    utenti: new Map(),
    fabbisogni: new Map(),
    turni: new Map(),
    corsi: new Map(),
    richiesteCancellazione: new Map(),
  };
  const resolve = (section, ref, context) => {
    const value = refs[section] && refs[section].get(ref);
    if (value === undefined) {
      throw new Error(`[demo] Riferimento non risolto: ${section}/${ref} (${context})`);
    }
    return value;
  };
  const resolveUser = (ref, ctx) => resolve('utenti', ref, ctx);

  // 1. Società (nasce già con is_demo=TRUE; la guardia conferma subito dopo — chokepoint).
  const companyRes = await client.query(
    `INSERT INTO companies (name, email, phone, address, is_demo, substitution_escalation_hours)
     VALUES ($1, $2, $3, $4, TRUE, $5) RETURNING id`,
    [dataset.company.name, dataset.company.email || null, dataset.company.phone || null,
      dataset.company.address || null, dataset.company.escalationHours || null]
  );
  const companyId = companyRes.rows[0].id;
  await assertDemoCompany(companyId, client);

  // 2. Sedi
  for (const sede of dataset.sedi || []) {
    const res = await client.query(
      `INSERT INTO sedi (company_id, name, display_order, calendar_start_time, calendar_end_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [companyId, sede.name, sede.displayOrder || 0,
        sede.calendarStartTime || '07:30', sede.calendarEndTime || '23:00']
    );
    refs.sedi.set(sede.ref, res.rows[0].id);
  }

  // 3. Aree operative
  for (const area of dataset.aree || []) {
    const sedeId = resolve('sedi', area.sedeRef, `area ${area.ref}`);
    const res = await client.query(
      `INSERT INTO operational_areas (company_id, sede_id, name, calendar_mode, display_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [companyId, sedeId, area.name, area.calendarMode || 'shifts', area.displayOrder || 0]
    );
    refs.aree.set(area.ref, { id: res.rows[0].id, sedeId });
  }

  // 4. Utenti + assegnazioni alle aree. Password: UNA sola (hash bcrypt calcolato una volta,
  // riusato per tutti — 35 hash sequenziali costerebbero secondi). In produzione è una stringa
  // casuale mai comunicata: si entra solo via POST /api/demo/login. DEMO_PERSONA_PASSWORD
  // permette in locale il login manuale di ispezione.
  const rawPassword = personaPassword() || crypto.randomBytes(18).toString('base64url');
  const passwordHash = await bcrypt.hash(rawPassword, bcryptRounds);
  const userAreaRows = [];
  for (const utente of dataset.utenti || []) {
    if (!utente.username || !utente.username.startsWith('demo-')) {
      // Prefisso obbligatorio: username/email sono UNIQUE a livello di piattaforma, il namespace
      // riservato evita ogni collisione/ambiguità con account reali.
      throw new Error(`[demo] Username demo non valido (deve iniziare con "demo-"): ${utente.username}`);
    }
    if (!['dirigente', 'admin', 'user'].includes(utente.role)) {
      throw new Error(`[demo] Ruolo non ammesso per un utente demo: ${utente.role}`);
    }
    const res = await client.query(
      `INSERT INTO users (username, email, phone, password_hash, role, company_id, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, FALSE) RETURNING id`,
      [utente.username, utente.email, utente.phone || null, passwordHash, utente.role, companyId]
    );
    const userId = res.rows[0].id;
    refs.utenti.set(utente.ref, userId);
    for (const areaRef of utente.areaRefs || []) {
      userAreaRows.push([userId, resolve('aree', areaRef, `utente ${utente.ref}`).id]);
    }
  }
  await bulkInsert(client, 'INSERT INTO user_areas (user_id, area_id) VALUES', userAreaRows);

  // 5. Contratti
  for (const c of dataset.contratti || []) {
    const userId = resolveUser(c.userRef, 'contratto');
    const createdBy = c.createdByRef ? resolveUser(c.createdByRef, 'contratto.createdBy') : null;
    await client.query(
      `INSERT INTO user_contracts (user_id, contract_type, max_weekly_hours, max_monthly_hours,
         min_weekly_hours, max_daily_hours, max_consecutive_days, weekly_rest_days, note,
         custom_config, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $11)`,
      [userId, c.contractType || null, c.maxWeeklyHours ?? null, c.maxMonthlyHours ?? null,
        c.minWeeklyHours ?? null, c.maxDailyHours ?? null, c.maxConsecutiveDays ?? null,
        c.weeklyRestDays ?? null, c.note || null, JSON.stringify(c.customConfig || {}), createdBy]
    );
  }

  // 6. Disponibilità dichiarate
  await bulkInsert(client,
    'INSERT INTO user_availability (user_id, weekday, start_time, end_time) VALUES',
    (dataset.disponibilita || []).map((d) => [
      resolveUser(d.userRef, 'disponibilita'), d.weekday, d.startTime, d.endTime,
    ]));

  // 7. Opt-out
  await bulkInsert(client,
    'INSERT INTO substitution_optouts (user_id, start_date, end_date, note) VALUES',
    (dataset.optouts || []).map((o) => [
      resolveUser(o.userRef, 'optout'), date(o.startOffset),
      o.endOffset == null ? null : date(o.endOffset), o.note || null,
    ]));

  // 8. Fabbisogni di personale
  for (const f of dataset.fabbisogni || []) {
    const area = resolve('aree', f.areaRef, `fabbisogno ${f.ref || ''}`);
    const isSingle = f.reqType === 'single';
    const singleDate = isSingle ? date(f.dateOffset) : null;
    const res = await client.query(
      `INSERT INTO staffing_requirements (company_id, area_id, req_type, weekday, date, start_time,
         end_time, required_count, effective_from, effective_until, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
      [companyId, area.id, f.reqType, isSingle ? null : f.weekday, singleDate,
        f.startTime, f.endTime, f.requiredCount,
        isSingle ? singleDate : date(f.effectiveFromOffset ?? -90),
        !isSingle && f.effectiveUntilOffset != null ? date(f.effectiveUntilOffset) : null,
        f.note || null, resolveUser(f.createdByRef, 'fabbisogno.createdBy')]
    );
    if (f.ref) refs.fabbisogni.set(f.ref, res.rows[0].id);
  }
  await bulkInsert(client,
    `INSERT INTO staffing_requirement_exceptions (requirement_id, exception_date, is_deleted,
       override_count) VALUES`,
    (dataset.eccezioniFabbisogno || []).map((e) => [
      resolve('fabbisogni', e.requirementRef, 'eccezioneFabbisogno'), date(e.dateOffset),
      e.isDeleted === true, e.isDeleted === true ? null : e.overrideCount,
    ]));

  // 9. Turni. Quelli con `ref` (agganci per eccezioni/richieste/proposte/tour) sono inseriti
  // singolarmente per ottenere l'id; il grosso dello storico va a blocchi multi-riga.
  const shiftColumns = `(user_id, company_id, start_time, end_time, date, type, note, created_by,
     recurrence_rule, status, origin_shift_id, requirement_id, area_id, sede_id, created_at)`;
  const shiftRow = (t) => {
    const area = resolve('aree', t.areaRef, `turno ${t.ref || t.note || t.type}`);
    return [
      t.userRef ? resolveUser(t.userRef, 'turno.user') : null,
      companyId, t.startTime, t.endTime,
      t.dateOffset == null ? null : date(t.dateOffset),
      t.type, t.note || null,
      resolveUser(t.createdByRef, 'turno.createdBy'),
      t.recurrenceRule || null, t.status || 'active',
      t.originShiftRef ? resolve('turni', t.originShiftRef, 'turno.origin') : null,
      t.requirementRef ? resolve('fabbisogni', t.requirementRef, 'turno.requirement') : null,
      area.id, area.sedeId,
      t.createdAtOffset == null ? null : ts(t.createdAtOffset, t.createdAtTime || '09:00'),
    ];
  };
  const bulkShifts = [];
  for (const t of dataset.turni || []) {
    if (t.ref || t.originShiftRef) {
      // NB: un turno con originShiftRef dipende da uno già inserito ⇒ l'ordine del dataset conta.
      const res = await client.query(
        `INSERT INTO shifts ${shiftColumns}
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,COALESCE($15::timestamptz, NOW()))
         RETURNING id`,
        shiftRow(t)
      );
      if (t.ref) refs.turni.set(t.ref, res.rows[0].id);
    } else {
      bulkShifts.push(shiftRow(t));
    }
  }
  await bulkInsert(client, `INSERT INTO shifts ${shiftColumns} VALUES`, bulkShifts,
    { coalesceNowIndex: 14 });

  await bulkInsert(client,
    'INSERT INTO shift_exceptions (shift_id, excluded_date) VALUES',
    (dataset.eccezioniTurni || []).map((e) => [
      resolve('turni', e.shiftRef, 'eccezioneTurno'), date(e.dateOffset),
    ]));

  // 10. Corsi
  for (const corso of dataset.corsi || []) {
    const area = resolve('aree', corso.areaRef, `corso ${corso.name}`);
    const res = await client.query(
      `INSERT INTO courses (name, instructor_id, company_id, start_time, end_time, date, type,
         note, created_by, recurrence_rule, area_id, sede_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,COALESCE($13::timestamptz, NOW()))
       RETURNING id`,
      [corso.name,
        corso.instructorRef ? resolveUser(corso.instructorRef, 'corso.instructor') : null,
        companyId, corso.startTime, corso.endTime,
        corso.dateOffset == null ? null : date(corso.dateOffset),
        corso.type, corso.note || null,
        resolveUser(corso.createdByRef, 'corso.createdBy'),
        corso.recurrenceRule || null, area.id, area.sedeId,
        corso.createdAtOffset == null ? null : ts(corso.createdAtOffset, corso.createdAtTime || '09:00')]
    );
    if (corso.ref) refs.corsi.set(corso.ref, res.rows[0].id);
  }

  // 11. Richieste di cancellazione
  for (const r of dataset.richiesteCancellazione || []) {
    const res = await client.query(
      `INSERT INTO cancellation_requests (shift_id, company_id, requested_by, shift_date,
         shift_start_time, shift_end_time, shift_note, status, decided_by, decided_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11::timestamptz, NOW())) RETURNING id`,
      [resolve('turni', r.shiftRef, 'richiestaCancellazione'), companyId,
        resolveUser(r.requestedByRef, 'richiesta.requestedBy'), date(r.dateOffset),
        r.startTime, r.endTime, r.note || null, r.status,
        r.decidedByRef ? resolveUser(r.decidedByRef, 'richiesta.decidedBy') : null,
        r.decidedAtOffset == null ? null : ts(r.decidedAtOffset, '12:00'),
        r.createdAtOffset == null ? null : ts(r.createdAtOffset, r.createdAtTime || '10:00')]
    );
    if (r.ref) refs.richiesteCancellazione.set(r.ref, res.rows[0].id);
  }

  // 12. Proposte mirate (snapshot score/reasons come nel flusso reale)
  for (const p of dataset.proposte || []) {
    await client.query(
      `INSERT INTO substitution_proposals (shift_id, user_id, proposed_by, status, score, reasons,
         responded_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,COALESCE($8::timestamptz, NOW()))`,
      [resolve('turni', p.shiftRef, 'proposta'), resolveUser(p.userRef, 'proposta.user'),
        resolveUser(p.proposedByRef, 'proposta.proposedBy'), p.status, p.score ?? null,
        JSON.stringify(p.reasons || []),
        p.respondedAtOffset == null ? null : ts(p.respondedAtOffset, '12:30'),
        p.createdAtOffset == null ? null : ts(p.createdAtOffset, p.createdAtTime || '11:00')]
    );
  }

  // 13. Notifiche (le chiavi *Ref nel payload sono risolte in id reali, come nei flussi veri)
  await bulkInsert(client,
    `INSERT INTO notifications (company_id, user_id, type, message, payload, is_read, created_at)
     VALUES`,
    (dataset.notifiche || []).map((n) => [
      companyId, resolveUser(n.userRef, 'notifica'), n.type, n.message,
      JSON.stringify(resolvePayload(n.payload || {}, refs, resolve, date)),
      n.isRead === true,
      n.createdAtOffset == null ? null : ts(n.createdAtOffset, n.createdAtTime || '09:30'),
    ]), { coalesceNowIndex: 6, casts: { 4: '::jsonb' } });

  // 14. Audit trail fittizio (storico "chi ha fatto cosa" della società demo)
  await bulkInsert(client,
    `INSERT INTO audit_logs (company_id, actor_user_id, action, entity_type, entity_id, metadata,
       created_at) VALUES`,
    (dataset.auditLogs || []).map((a) => [
      companyId, a.actorRef ? resolveUser(a.actorRef, 'audit') : null, a.action,
      a.entityType || (a.entity ? a.entity.section : null),
      a.entity ? refValueToId(resolve(a.entity.section, a.entity.ref, 'audit.entity')) : null,
      a.metadata ? JSON.stringify(a.metadata) : null,
      a.createdAtOffset == null ? null : ts(a.createdAtOffset, a.createdAtTime || '09:00'),
    ]), { coalesceNowIndex: 6, casts: { 5: '::jsonb' } });

  // 15. Stato dello scenario: ganci del tour + mappa personas (persona.key -> user_id reale),
  // entrambi risolti in id reali per gli endpoint demo (login/tour).
  const tourContext = {};
  for (const [key, refSpec] of Object.entries(dataset.tourContext || {})) {
    tourContext[key] = refValueToId(resolve(refSpec.section, refSpec.ref, `tourContext.${key}`));
  }
  const personas = {};
  for (const persona of scenario.personas || []) {
    personas[persona.key] = resolveUser(persona.userRef, `persona ${persona.key}`);
  }
  const stateRes = await client.query(
    `INSERT INTO demo_state (company_id, scenario_id, dataset_version, anchor_date, tour_context, personas)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb) RETURNING *`,
    [companyId, scenario.id, scenario.version, anchorDate,
      JSON.stringify(tourContext), JSON.stringify(personas)]
  );
  return stateRes.rows[0];
}

// Le mappe ref contengono id numerici oppure oggetti { id, ... } (aree): normalizza a id.
function refValueToId(value) {
  return typeof value === 'object' && value !== null ? value.id : value;
}

// Risolve le chiavi convenzionali *Ref di un payload di notifica negli id reali, replicando la
// forma dei payload prodotti da notificationService (shiftId/areaId/sedeId/...).
const PAYLOAD_REF_KEYS = {
  shiftRef: ['turni', 'shiftId'],
  courseRef: ['corsi', 'courseId'],
  areaRef: ['aree', 'areaId'],
  sedeRef: ['sedi', 'sedeId'],
  userRef: ['utenti', 'userId'],
  requirementRef: ['fabbisogni', 'requirementId'],
  requestRef: ['richiesteCancellazione', 'requestId'],
};
function resolvePayload(payload, refs, resolve, date) {
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    const mapping = PAYLOAD_REF_KEYS[key];
    if (mapping) {
      out[mapping[1]] = refValueToId(resolve(mapping[0], value, `payload.${key}`));
    } else if (key === 'dateOffset') {
      out.date = date(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

// INSERT multi-riga parametrizzato a blocchi (per lo storico: centinaia di righe senza centinaia
// di round-trip). `coalesceNowIndex`: indice 0-based della colonna created_at da avvolgere in
// COALESCE($n::timestamptz, NOW()); `casts`: cast espliciti per colonna (es. ::jsonb).
async function bulkInsert(client, insertPrefix, rows, { coalesceNowIndex, casts = {} } = {}) {
  if (!rows.length) return;
  const CHUNK = 200;
  const width = rows[0].length;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const params = [];
    const tuples = chunk.map((row, r) => {
      const placeholders = row.map((value, c) => {
        params.push(value);
        const idx = `$${r * width + c + 1}`;
        if (c === coalesceNowIndex) return `COALESCE(${idx}::timestamptz, NOW())`;
        return `${idx}${casts[c] || ''}`;
      });
      return `(${placeholders.join(',')})`;
    });
    await client.query(`${insertPrefix} ${tuples.join(',')}`, params);
  }
}

module.exports = { loadScenario, loadScenarioModule, getDemoState, isStateStale };
