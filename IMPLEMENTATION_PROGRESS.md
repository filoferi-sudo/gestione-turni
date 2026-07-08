# IMPLEMENTATION_PROGRESS.md — Sistema avanzato di sostituzioni

> **Scopo di questo file**: tracciare, fase per fase, l'avanzamento dell'implementazione del
> *sistema avanzato di sostituzioni*. È un registro operativo (cosa è fatto, cosa manca, decisioni
> prese, verifiche eseguite), complementare a `PROJECT_CONTEXT.md` — che resta la fonte di verità
> architetturale del progetto nel suo insieme.
>
> **Regola di manutenzione**: al termine di **ogni fase** aggiornare questo file **insieme** a
> `PROJECT_CONTEXT.md` (changelog + sezioni pertinenti). Segnare la fase come completata, elencare i
> file toccati, le decisioni prese e la verifica svolta, poi indicare la fase successiva.

---

## Panoramica

Sistema di copertura dei turni scoperti in **due modalità integrate** (non alternative):
1. **Autonomia dei dipendenti** sulle Sostituzioni disponibili (già esistente prima di questo
   lavoro — vedi `PROJECT_CONTEXT.md` → "Logica delle Sostituzioni").
2. **Supporto intelligente al responsabile**: classifica dei migliori candidati interni, proposte
   mirate, notifiche in-app, escalation.

**Ambito esclusivamente interno**: il pool candidati è sempre e solo `users` della società (mai
candidati esterni). Costruito come livello **additivo** sopra i turni, senza modificare la logica di
`claimShift`/`listAvailableShifts`/`approveRequest`.

---

## Piano tecnico di riferimento (per una nuova sessione)

### Obiettivo generale
Coprire i turni scoperti combinando **due modalità che si integrano, non si sostituiscono**:
1. il dipendente accetta autonomamente una Sostituzione disponibile (meccanismo preesistente);
2. il responsabile riceve supporto intelligente — classifica dei migliori candidati **interni**,
   proposte mirate, notifiche in-app, escalation — per intervenire quando serve.
Il processo è un **escalation** a livelli: pubblicazione → autonomia dei dipendenti → suggerimento
dei candidati → proposta mirata ai più compatibili → (futuro) escalation automatica se nessuno
accetta entro un tempo configurabile.

### Architettura scelta
- **Backend**: Node/Express + PostgreSQL (`pg`, niente ORM), stessa struttura del resto del
  progetto. Ogni dominio nuovo ha il proprio modulo isolato: `contractController`,
  `availabilityController`, `notificationController` + `notificationService`, `substitutionMatcher`.
  Il **motore di compatibilità** è un service di **sola lettura** con i pesi in un oggetto `CONFIG`
  (punto di aggancio per futuri algoritmi AI senza riscrivere la struttura). Le **notifiche** sono
  un service chiamato **in coda** ai flussi esistenti, **best-effort** (non bloccante).
- **Frontend**: React + Vite, nessuna libreria UI. Nuovi componenti isolati (modali contratto/
  disponibilità/candidati, editor disponibilità, campanella notifiche); riuso di `usePolling`,
  `client.js`, classi CSS esistenti.
- **Nessuna nuova infrastruttura**: niente WebSocket, niente cron, niente servizi terzi (vincolo
  hosting Vercel serverless). Aggiornamenti quasi real-time via il `usePolling` già esistente;
  l'escalation (Fase 7) sarà rilevata *lazy* al polling delle notifiche.
- **Riuso massimo**: `user_areas` come "ruolo compatibile" (pool candidati), `getExpandedShifts`/
  `hasOverlappingShift`/`shiftDurationHours` per ore e sovrapposizioni, il claim atomico di
  `claimShift` (che la Fase 5 riuserà per l'accettazione delle proposte).

### Vincoli da rispettare
- **Solo dipendenti interni** alla società (mai candidati esterni).
- **Additività assoluta**: non modificare la logica di
  `claimShift`/`listAvailableShifts`/`approveRequest`/`createShift` (solo aggiunte in coda o nuovi
  endpoint). Nessuna funzionalità esistente va rimossa o resa inutilizzabile.
- **Nessuna assegnazione automatica** e **nessuna esclusione silenziosa** dei candidati: il motore
  suggerisce, il responsabile decide (le violazioni contrattuali retrocedono, non escludono).
- **Migrazioni idempotenti** in `schema.sql` (ordine colonna→backfill→vincoli→indici); **produzione
  solo dopo conferma esplicita dell'utente**.
- **Notifiche best-effort**: un errore d'invio non deve mai far fallire l'azione che le innesca.
- **Isolamento per società** su ogni nuovo endpoint (verifica `company_id`/appartenenza a DB).
- Vedi anche, in `PROJECT_CONTEXT.md`, la sezione *"Sistema avanzato di sostituzioni (Fasi 1–4) —
  invarianti da non modificare senza motivo"*.

### Assunzioni fatte durante lo sviluppo
- **Legame area↔responsabile non ancora modellato**: oggi nessun responsabile è collegato a
  un'area (`user_areas` è di fatto solo per i dipendenti). Perciò le notifiche ai responsabili
  ricadono su *tutti* gli `admin`/`dirigente` della società; la query "per area" è già pronta per
  quando quel legame verrà introdotto.
- **Storico del motore limitato al disponibile**: per ora "storico" = Sostituzioni già accettate
  (turni `volante` con `user_id`); rifiuti/opt-out entreranno con le Fasi 5–6.
- **Deep-link delle notifiche non naviga alla tab specifica**: il `payload` porta i riferimenti, ma
  il click marca solo come letta (le aree sono tab, non rotte). Affinamento previsto, non un bug.
- **Contratti**: tipologie a testo libero (preset solo come suggerimento UI); i massimali vuoti
  significano "nessun vincolo".

---

## Stato attuale — snapshot per ripresa rapida

- **Ultima fase completata**: **Fase 7 — Escalation lazy (senza cron)** (2026-07-08).
- **Fase in corso**: nessuna. **Piano a 7 fasi COMPLETATO** (tutto verificato in locale).
- **Prossimo passo consigliato**: migrazione + deploy in produzione su conferma dell'utente; poi
  eventuali affinamenti (deep-link notifiche, legame area↔responsabile, livelli di escalation successivi).

**Funzionalità già utilizzabili (Fasi 1–7):**
- Contratto per dipendente (tipo + massimali ore/giorni), gestito dal responsabile.
- Disponibilità dichiarate dal dipendente (self-service) e consultabili dal responsabile.
- Notifiche in-app (campanella + contatore non lette + elenco) per dipendenti e responsabili, su
  tutti gli eventi di Sostituzione/cancellazione/proposta/escalation.
- "Trova sostituzione": classifica 0–100 dei candidati interni con motivazioni (solo suggerimento),
  che ora usa anche opt-out e storico rifiuti.
- **Proposte mirate**: dalla classifica il responsabile invia una proposta ai candidati scelti; il
  dipendente la vede in "Le mie proposte" e Accetta (riusa il claim atomico) o Rifiuta.
- **Opt-out "Non partecipare"**: il dipendente dichiara periodi in cui non vuole sostituzioni (niente
  proposte né notifiche broadcast, retrocesso nel motore); resta libero di reclamare autonomamente.
- **Escalation lazy**: se una Sostituzione resta scoperta oltre le ore configurate dal Dirigente
  (`substitution_escalation_hours`), i responsabili ricevono una segnalazione (rilevata al polling
  delle notifiche, senza cron; idempotente).

**Modifiche al database (tutte applicate SOLO in locale, mai in produzione):**
- Fase 1: tabella `user_contracts`.
- Fase 2: tabella `user_availability`.
- Fase 3: tabella `notifications` (+ 3 indici, incluso l'unico parziale per `dedupe_key`).
- Fase 4: **nessuna** (motore sola lettura).
- Fase 5: tabella `substitution_proposals` (+ 2 indici; `UNIQUE (shift_id, user_id)`).
- Fase 6: tabella `substitution_optouts` (+ 1 indice). Il motore usa opt-out/rifiuti in sola lettura.
- Fase 7: colonna `companies.substitution_escalation_hours` (nessuna nuova tabella).
- Tutte le migrazioni sono idempotenti in `backend/src/db/schema.sql` (verificate 2× di fila).
  ⚠️ **Migrazione produzione (5 tabelle + 1 colonna) ancora DA ESEGUIRE**, dopo conferma esplicita
  dell'utente (`cd backend && DATABASE_URL=... DATABASE_SSL=true npm run migrate`).

**Test eseguiti e risultato:** tutto verificato **in locale** (il progetto non ha suite di test
automatici, la verifica è manuale via curl + browser, come da `PROJECT_CONTEXT.md`). Ogni fase:
migrazione idempotente 2×, endpoint via curl (happy path + errori 400/401/403/404 + isolamento),
flusso UI end-to-end nel browser. **Esito: tutto superato**; dati di test rimossi al termine di ogni
fase; DB locale attualmente pulito. Build di produzione frontend e `node --check` dei file backend:
OK (verificati a fine sessione).

**Problemi aperti / punti da verificare:**
- **Migrazioni produzione pendenti** per `user_contracts`/`user_availability`/`notifications`/
  `substitution_proposals`/`substitution_optouts` + colonna `companies.substitution_escalation_hours`
  (vedi sopra) — bloccanti per il deploy delle Fasi 1–7, da fare su conferma dell'utente.
- **Deep-link notifiche**: il click non porta ancora alla tab/funzione specifica (limite v1 noto).
- **Legame area↔responsabile** non implementato: notifiche ai manager oggi a tutta la società.
- **Crash transitorio** visto in Fase 4 solo cancellando i dati di test via SQL con il modale aperto
  e polling attivo: **non riproducibile** in uso normale; non è emerso un bug di codice, ma se in
  futuro ricomparisse valutare un error boundary attorno ai modali.
- Problema **preesistente** a questo lavoro (documentato in `PROJECT_CONTEXT.md` → "Problemi
  aperti"): la Sostituzione generata da una cancellazione approvata non è collegata a `requirement_id`
  (può sovrastimare `missingSlots` di 1 in uno scenario specifico). Non introdotto dalle Fasi 1–4.

---

## Stato delle fasi

| # | Fase | Stato |
|---|---|---|
| 1 | Contratti dei dipendenti | ✅ Completata (2026-07-08) |
| 2 | Disponibilità dichiarate | ✅ Completata (2026-07-08) |
| 3 | Notifiche in-app (campanella, contatore, elenco) | ✅ Completata (2026-07-08) |
| 4 | Motore di compatibilità + "Trova sostituzione" | ✅ Completata (2026-07-08) |
| 5 | Proposte mirate ai candidati più compatibili | ✅ Completata (2026-07-08) |
| 6 | Opt-out "Non partecipare" + storico per il motore | ✅ Completata (2026-07-08) |
| 7 | Escalation lazy (via polling notifiche, senza cron) | ✅ Completata (2026-07-08) |

## Decisioni trasversali (valide per tutte le fasi)

- **Notifiche ai responsabili**: struttura predisposta per collegare in futuro responsabili
  specifici alle aree operative; in v1, in mancanza di quel legame, si notificano prioritariamente i
  responsabili dell'area coinvolta se individuabili, altrimenti tutti gli `admin`/`dirigente` della
  società.
- **Contratti**: testo libero + preset suggeriti, struttura estendibile (`custom_config` JSONB +
  campi di audit) per future evoluzioni (storico modifiche, configurazioni personalizzate).
- **Escalation**: rilevamento *lazy* al polling delle notifiche, **nessun cron/infrastruttura
  aggiuntiva** (vincolo hosting Vercel serverless).
- **Migrazioni**: sempre idempotenti in `schema.sql`; produzione eseguita solo dopo conferma
  esplicita dell'utente.
- **Additività**: nessuna rimozione/alterazione di funzionalità esistenti; riuso di ciò che c'è
  (`user_areas`, `getExpandedShifts`/`hasOverlappingShift`, claim atomico, `usePolling`).

---

## Fase 1 — Contratti dei dipendenti ✅

**Completata**: 2026-07-08. Configurazione contrattuale per dipendente, interamente additiva.

### File toccati
- `backend/src/db/schema.sql` — **+** tabella `user_contracts` (1:1 con `users`, `UNIQUE user_id`;
  massimali nullable, `contract_type` testo libero, `custom_config` JSONB, audit
  `created_by`/`updated_by`/`created_at`/`updated_at`). Migrazione idempotente in coda al file.
- `backend/src/controllers/contractController.js` — **nuovo**: `getUserContract` +
  `upsertUserContract` (INSERT … ON CONFLICT `(user_id)`), isolamento società (404 fuori società),
  restrizione al ruolo `user` (400 altrimenti), validazione massimali (numeri ≥ 0, opzionali,
  vuoto → `null`).
- `backend/src/routes/users.js` — **+** `GET`/`PUT /api/users/:id/contract` (`requireManager`).
- `frontend/src/api/client.js` — **+** `getUserContract`, `saveUserContract`.
- `frontend/src/components/management/ContractModal.jsx` — **nuovo**: form (tipo con `<datalist>`
  di preset, 6 massimali in griglia a due colonne, note/vincoli); carica il contratto esistente e
  fa upsert.
- `frontend/src/components/management/UserManagementSection.jsx` — **+** bottone "Contratto" per
  riga dipendente + montaggio del modale.
- `frontend/src/styles.css` — **+** `.modal-card-wide`, `.contract-grid`.
- `PROJECT_CONTEXT.md` — nuova sezione "Sistema avanzato di sostituzioni" + `user_contracts` nelle
  tabelle principali + voce di changelog + stato in "Funzionalità in sviluppo".

### Decisioni specifiche della fase
- `contract_type` **testo libero** con preset solo come suggerimenti UI (nuove tipologie senza
  toccare lo schema).
- **Nessun `company_id`** duplicato su `user_contracts`: `user_id` è sempre valorizzato (a
  differenza di `shifts`/`courses`), la società si ricava per JOIN e l'isolamento è verificato nel
  controller.
- Contratto ristretto al ruolo `user` (i massimali hanno senso solo per chi lavora i turni), stessa
  restrizione già applicata alle aree operative.

### Verifica svolta (locale)
- Migrazione idempotente (eseguita 2×, seconda no-op); struttura tabella confermata (UNIQUE, CHECK
  ≥ 0, FK).
- Endpoint via curl: creazione/lettura/upsert (numerici come `Number`, campi vuoti → `null`,
  `customConfig` persistito, `createdAt` preservato); errori **400** (negativi/non-numerici, ruolo
  non-`user`), **404** (utente inesistente/altra società), **401** (senza token).
- Flusso UI nel browser (sessione dirigente): bottone "Contratto" → modale che precarica il
  contratto salvato → modifica → salvataggio persistito con `updated_by` corretto.
- Dati di test rimossi al termine.

### In sospeso
- **Migrazione produzione** di `user_contracts`: da eseguire solo dopo conferma esplicita
  dell'utente.

---

## Fase 2 — Disponibilità dichiarate ✅

**Completata**: 2026-07-08. Disponibilità ricorrenti per giorno della settimana, dichiarate dal
dipendente e lette dal responsabile. **Assenza di dichiarazioni = disponibilità "ignota"** (non
incompatibile): servirà al motore di compatibilità (Fase 4). Additivo puro.

### File toccati
- `backend/src/db/schema.sql` — **+** tabella `user_availability` (righe multiple per utente,
  `weekday` MON..SUN, `start_time`/`end_time`, `CHECK end_time > start_time`; niente `company_id`,
  isolamento nel controller). Migrazione idempotente.
- `backend/src/controllers/availabilityController.js` — **nuovo**: `getUserAvailability`
  (leggibile dal dipendente stesso **o** da un responsabile/dirigente della stessa società — 403
  per un altro dipendente, 404 per utente di altra società), `replaceUserAvailability` (solo il
  dipendente stesso, ruolo `user`; valida tutte le fasce poi DELETE + INSERT multi-riga come
  `setUserAreas`).
- `backend/src/routes/users.js` — **+** `GET`/`PUT /api/users/:id/availability` con solo
  `authenticate` (deviazione commentata dal resto del file, tutto `requireManager`, perché anche il
  dipendente accede ai propri dati; autorizzazione fine nel controller).
- `frontend/src/api/client.js` — **+** `getUserAvailability`, `saveUserAvailability`.
- `frontend/src/components/profile/AvailabilityEditor.jsx` — **nuovo**: editor self-service (righe
  giorno+inizio+fine, aggiungi/rimuovi, salva); esporta `WEEKDAYS` (etichette lun→dom) riusato
  dalla vista manager.
- `frontend/src/components/profile/MyProfile.jsx` — monta `<AvailabilityEditor />` sotto il profilo.
- `frontend/src/components/management/AvailabilityModal.jsx` — **nuovo**: vista **sola lettura**
  per il responsabile (fasce raggruppate per giorno).
- `frontend/src/components/management/UserManagementSection.jsx` — **+** bottone "Disponibilità"
  per riga dipendente + montaggio del modale.
- `frontend/src/styles.css` — **+** `.availability-list`/`.availability-row`/`.availability-sep`/
  `.availability-view-row`.

### Decisioni specifiche della fase
- **Il dipendente possiede le proprie disponibilità**: le modifica solo lui (dal profilo); il
  responsabile è in sola lettura (le usa per valutare le sostituzioni, non le impone).
- **`weekday` MON..SUN**, stessa convenzione di `staffing_requirements`/`recurrence.js`, per
  confronti omogenei col giorno di un turno in Fase 4.
- **Più fasce anche lo stesso giorno** ammesse (es. lun 08-14 e lun 15-18); nessun controllo di
  sovrapposizione (ridondante ma non errato, semplice; la Fase 4 valuterà l'inclusione oraria).
- Rotte con `authenticate` + autorizzazione nel controller (unica eccezione al pattern
  "tutto requireManager" di `users.js`, necessaria per l'accesso self del dipendente).

### Verifica svolta (locale)
- Migrazione idempotente (2×); struttura tabella confermata (CHECK orari, CHECK weekday, FK, indice).
- Endpoint via curl: lettura self (vuoto → popolato), replace con 3 fasce (ordinamento lun→dom +
  orario), lettura manager (stessa società), replace vuoto azzera tutto. Errori: **400**
  (giorno non valido, fine≤inizio, orario malformato, `slots` non-array), **403** (manager tenta
  PUT; dipendente legge un altro utente), **404** (manager legge utente di altra società), **401**
  (senza token); CHECK a DB rifiuta `end<start` su INSERT diretto.
- Flusso UI nel browser: **vista manager** (modale "Disponibilità" read-only, fasce raggruppate per
  giorno, nessun controllo di modifica); **vista dipendente** (editor in MyProfile che precarica le
  fasce, aggiunta di una nuova fascia Sabato 09:00–13:00, salvataggio persistito nel DB, conferma a
  schermo).
- Dati di test rimossi al termine.

### In sospeso
- **Migrazione produzione** di `user_availability`: da eseguire con quella di `user_contracts` dopo
  conferma esplicita dell'utente.

---

## Fase 3 — Notifiche in-app ✅

**Completata**: 2026-07-08. Notifiche per utente in campanella (header), generate in coda ai flussi
esistenti in modo best-effort. Additivo puro.

### File toccati
- `backend/src/db/schema.sql` — **+** tabella `notifications` (`user_id` destinatario, `type`,
  `message`, `payload` JSONB per il deep-link, `is_read`, `dedupe_key` per l'escalation idempotente
  futura; `company_id` diretto qui perché tabella trasversale) + 3 indici (recenti, non-lette
  parziale, dedupe parziale unico). Migrazione idempotente.
- `backend/src/services/notificationService.js` — **nuovo**: `resolveManagerRecipients`
  (responsabili collegati all'area → fallback admin/dirigente della società; **struttura pronta**
  per il futuro legame area↔responsabile via `user_areas`/tabella dedicata), `resolveAreaEmployees`,
  `createNotifications` (INSERT multi-riga, **best-effort**: cattura/logga, non lancia mai; dedupe
  via ON CONFLICT), e le funzioni `notify*` per evento.
- `backend/src/controllers/notificationController.js` — **nuovo**: `listNotifications` (ultime 50 +
  `unreadCount`), `markRead` (404 se non è propria), `markAllRead`.
- `backend/src/routes/notifications.js` — **nuovo** (`authenticate`); montato in `app.js` su
  `/api/notifications`.
- Agganci **best-effort in coda** (nessuna modifica alla logica esistente):
  `shiftController.createShift` (volante → disponibile), `.claimShift` (→ accettata),
  `.deleteShiftSelf` (→ richiesta cancellazione ai responsabili); `cancellationController`
  `.approveRequest` (→ richiedente approvata + nuova Sostituzione disponibile), `.rejectRequest`
  (→ richiedente rifiutata); `staffingController.generateGapShifts` (→ disponibili, con conteggio).
- `frontend/src/components/notifications/NotificationsBell.jsx` — **nuovo**: campanella + badge
  non lette + pannello (elenco, tempo relativo, evidenza non lette, "segna tutte come lette",
  segna-letta ottimistico, chiusura al click esterno); polling 10s con `usePolling` (aggiorna in
  place, nessuno stato di caricamento che nasconda contenuto → nessuno sfarfallio).
- `AdminDashboard.jsx`/`DirigenteDashboard.jsx`/`employee/EmployeeDashboard.jsx` — montano la
  campanella in un contenitore `.topbar-actions` nell'header. `api.listNotifications`/
  `markNotificationRead`/`markAllNotificationsRead` in `client.js`; stili `.notif-*`/`.topbar-actions`
  in `styles.css`.

### Decisioni specifiche della fase
- **Best-effort**: le notifiche non devono mai far fallire l'azione che le innesca — ogni `notify*`
  cattura i propri errori. Verificato che tutte le azioni restino 2xx anche con notifiche attive.
- **Destinatari responsabili**: query "responsabili dell'area" già pronta (oggi vuota → fallback su
  tutti i manager di società), predisposta per il futuro legame area↔responsabile senza cambiare i
  call site. L'**autore** dell'azione è escluso dalle proprie notifiche (`excludeUserId`).
- **`company_id` diretto** sulle notifiche (a differenza di `user_contracts`/`user_availability`):
  tabella trasversale ad alto volume, valore sempre dal contesto dell'evento, utile per scoping.
- **Deep-link**: `payload` con `shiftId/areaId/sedeId/date` salvato per navigazione ricca futura; in
  v1 il click marca come letta (le tab non sono rotte, la navigazione diretta alla tab è un
  affinamento successivo). Limite dichiarato, non un bug.

### Verifica svolta (locale)
- Migrazione idempotente (2×); tabella + 3 indici confermati.
- Flusso end-to-end via curl: manager crea Sostituzione → dipendente riceve "disponibile" (autore
  manager escluso); dipendente accetta → manager riceve "accettata"; dipendente richiede
  cancellazione → manager riceve "richiesta"; manager approva → dipendente riceve "approvata" +
  nuova "disponibile". Mark-read (204) e mark-all (unreadCount→0); 404 se si marca una notifica non
  propria; 401 senza token.
- Flusso UI nel browser: campanella con badge (3 lato dipendente, 1 lato dirigente), pannello con
  elenco ordinato/tempo relativo/evidenza non lette, "segna tutte" azzera badge e DB, chiusura al
  click esterno, riapertura al click. Nessun errore residuo (i 500 iniziali erano poll avvenuti
  prima che la migrazione creasse la tabella).
- Dati di test rimossi al termine.

### In sospeso
- **Migrazione produzione** di `notifications`: da eseguire con `user_contracts`/`user_availability`
  dopo conferma esplicita dell'utente.

---

## Fase 4 — Motore di compatibilità + "Trova sostituzione" ✅

**Completata**: 2026-07-08. Motore di suggerimento **sola lettura** (nessuna migrazione DB): per una
Sostituzione scoperta produce una classifica 0–100 con motivazioni dei dipendenti interni dell'area.

### File toccati
- `backend/src/services/substitutionMatcher.js` — **nuovo** (motore isolato, sola lettura):
  `rankCandidates({ shift, companyId })`. Pool = dipendenti dell'area (`user_areas`, ruolo `user`).
  Batch: disponibilità/contratti/storico + **una** `getExpandedShifts` sulla finestra che copre
  settimana e mese della data (raggruppata per dipendente in memoria). Punteggio su 4 dimensioni con
  **pesi in `CONFIG`** (aggancio futuro AI): disponibilità 35, contratto 35, carico 20, storico 10.
  **Esclusione rigida** solo per sovrapposizione oraria; **violazioni contrattuali retrocedono** (0
  alla dimensione + motivazione rossa), non escludono; disponibilità non dichiarata = neutra.
  Motivazioni tipizzate `{ text, kind: positive|neutral|negative }`.
- `backend/src/controllers/shiftController.js` — **+** `getShiftCandidates` (valida Sostituzione
  aperta della società: 404 altrimenti; chiama il motore).
- `backend/src/routes/shifts.js` — **+** `GET /api/shifts/:id/candidates` (`requireManager`).
- `frontend/src/api/client.js` — **+** `getShiftCandidates`.
- `frontend/src/components/shifts/FindReplacementModal.jsx` — **nuovo**: classifica (rank, nome,
  % con colore alto/medio/basso, chip motivazioni colorate) + stati loading/vuoto/errore.
- `frontend/src/components/shifts/SubstitutionsPanel.jsx` — **+** bottone "Trova sostituzione" (solo
  vista `manage`) che apre il modale.
- `frontend/src/styles.css` — **+** `.candidate-*`, `.reason-*`, `.shift-item-actions`.

### Decisioni specifiche della fase
- **Solo suggerimento, mai assegnazione automatica**: l'endpoint è di sola lettura. L'invio di una
  proposta mirata ai candidati arriva in Fase 5.
- **Una sola esclusione rigida** (sovrapposizione oraria, stesso vincolo di `claimShift`): tutto il
  resto è punteggio. In particolare le violazioni contrattuali **si vedono** (rosso) e retrocedono.
- **Pesi centralizzati in `CONFIG`**: punto di estensione per algoritmi futuri senza toccare la
  struttura.
- **Carico bilanciato relativo al pool** (min/max ore settimanali dei candidati): chi ha meno ore
  sale, chi ne ha di più scende, con motivazione dedicata.

### Verifica svolta (locale)
- Endpoint via curl con 4 dipendenti di prova ad attributi diversi + 1 Sostituzione scoperta:
  classifica corretta (disponibile in fascia 85% in cima; disponibilità ignota 76%; fuori fascia
  55%; violazione contrattuale retrocessa a 26% con motivo rosso "supererebbe le ore settimanali
  15h>10h"); candidato con **sovrapposizione oraria escluso** del tutto. Punteggi coerenti con i pesi.
  Errori: **404** (shift inesistente / non-volante / assegnato), **403** (dipendente su endpoint
  `requireManager`), **401** (senza token).
- Flusso UI nel browser: bottone "Trova sostituzione" nel pannello Sostituzioni (vista manager),
  modale con classifica, percentuali colorate e chip motivazioni verde/grigio/rosso; riaperto anche
  su una Sostituzione reale. Un crash transitorio osservato durante la cancellazione via SQL dei dati
  di test con modale aperto e polling attivo (race dato-eliminato/render) **non riproducibile** in
  operatività normale (verificato dopo reload).
- Dati di test rimossi al termine.

### In sospeso
- Nessuna migrazione DB (fase sola lettura). Le migrazioni produzione pendenti restano quelle delle
  Fasi 1–3 (`user_contracts`/`user_availability`/`notifications`).

---

## Fase 5 — Proposte mirate ✅

**Completata**: 2026-07-08. Il responsabile, dalla classifica di "Trova sostituzione", invia una
**proposta mirata** solo ai candidati che sceglie; il dipendente la vede in "Le mie proposte" e
decide (Accetta/Rifiuta). Additivo puro: l'accettazione riusa il **claim atomico condiviso** di
`shiftController`, identico a `claimShift`.

### File toccati
- `backend/src/db/schema.sql` — **+** tabella `substitution_proposals` (`shift_id` FK→shifts
  `ON DELETE CASCADE`, `user_id` destinatario, `proposed_by`, `status`
  `pending|accepted|declined|expired`, snapshot `score` INT + `reasons` JSONB, `responded_at`;
  `UNIQUE (shift_id, user_id)` + 2 indici). **Niente `company_id`**: `shift_id`/`user_id` sempre
  valorizzati, società per JOIN, isolamento nel controller (come `user_contracts`/`user_availability`).
  Migrazione idempotente in coda.
- `backend/src/controllers/shiftController.js` — **refactor a comportamento invariato**: estratto il
  claim atomico in **`assignVolanteToUser({ shiftRow, user })`** (doppi controlli area+sovrapposizione
  + UPDATE condizionale), riusato sia da `claimShift` sia dall'accettazione delle proposte. `claimShift`
  ora è un wrapper che chiama l'helper e mappa l'esito su HTTP (verificato: 403/200/409 identici a
  prima). Export aggiuntivi: `assignVolanteToUser`, `isUserAssignedToArea`.
- `backend/src/controllers/substitutionProposalController.js` — **nuovo**: `createProposals`
  (manager: snapshot da `rankCandidates`, propone solo a candidati validi — chi ha sovrapposizione
  finisce in `skipped` —, UPSERT su `(shift_id,user_id)` per ri-proporre dopo un rifiuto),
  `listShiftProposals` (manager: annota "Trova sostituzione"), `listMyProposals` (dipendente: solo
  proposte `pending` su turni **ancora aperti** — così una proposta superata sparisce senza toccare
  `claimShift`), `acceptProposal` (riusa `assignVolanteToUser`; segna `accepted`, porta le gemelle a
  `expired`, notifica i responsabili con `notifySubstitutionClaimed`; se il turno è già coperto →
  `expired` + 409), `declineProposal` (segna `declined`, notifica i responsabili).
- `backend/src/routes/shifts.js` — **+** `POST`/`GET /api/shifts/:id/proposals` (`requireManager`).
- `backend/src/routes/substitutionProposals.js` — **nuovo** (`authenticate`, autorizzazione fine nel
  controller): `GET /api/proposals/mine`, `POST /api/proposals/:id/accept`, `.../decline`; montato in
  `app.js` su `/api/proposals`.
- `backend/src/services/notificationService.js` — **+** `notifySubstitutionProposal` (al singolo
  dipendente, `type='substitution_proposed'`), `notifyProposalDeclined` (ai responsabili,
  `type='substitution_proposal_declined'`). Riuso di `notifySubstitutionClaimed` sull'accept.
- `frontend/src/api/client.js` — **+** `createProposals`, `listShiftProposals`, `listMyProposals`,
  `acceptProposal`, `declineProposal`.
- `frontend/src/components/shifts/FindReplacementModal.jsx` — checkbox per candidato + "Invia
  proposta (N)"; carica in parallelo le proposte già inviate e le mostra come badge di stato.
- `frontend/src/components/shifts/MyProposalsPanel.jsx` — **nuovo**: card dipendente con Accetta/
  Rifiuta + polling 5s; nascosta quando non ci sono proposte.
- `frontend/src/pages/employee/EmployeeDashboard.jsx` — monta `<MyProposalsPanel />` sopra le
  Sostituzioni disponibili. `styles.css` — **+** `.candidate-check`, `.proposal-badge*`,
  `.proposal-item`, `.proposal-info`.

### Decisioni specifiche della fase
- **Riuso via helper condiviso** (scelta dell'utente): un'unica fonte di verità per il claim atomico,
  così i due percorsi (claim autonomo / accettazione proposta) non possono divergere. Refactor di
  `claimShift` a comportamento osservabile invariato = la "necessità documentata" che il vincolo
  ammette.
- **Convivenza con l'autonomia**: la proposta è un canale aggiuntivo; la stessa Sostituzione resta
  accettabile dal pannello "Sostituzioni disponibili". Nessuna esclusiva, nessuna assegnazione
  automatica. Un dipendente proposto la vede in entrambi i posti; entrambi portano allo stesso claim.
- **Snapshot `score`/`reasons`**: fotografia della compatibilità al momento dell'invio, stabile anche
  se turni/disponibilità cambiano dopo. `reasons` è la stessa forma tipizzata del motore.
- **`listMyProposals` filtra sui turni ancora aperti**: evita di dover "scadere" le proposte dentro
  `claimShift` (che resta intatto); l'accept ricontrolla comunque atomicamente.
- **Solo candidati validi ricevono la proposta**: chi è escluso dal motore (sovrapposizione) finisce
  in `skipped` — non gli si propone un turno che non potrebbe comunque accettare.

### Verifica svolta (locale)
- Migrazione idempotente (2×); tabella + `UNIQUE` + 2 indici confermati.
- Script e2e via HTTP (server locale, JWT firmati), **30/30 asserzioni superate**: creazione turno →
  candidati (empC sovrapposto escluso) → invio proposta a 2 (+1 in `skipped`) → viste manager/
  dipendente → accept (turno assegnato, gemella `expired`, empB non vede più nulla) → accept scaduta
  409 → notifiche (`substitution_proposed`, `substitution_claimed`, `substitution_proposal_declined`)
  → rifiuto → ri-proposta UPSERT→pending. Errori: **400** (`userIds` vuoto), **403** (dipendente su
  POST proposals), **404** (accept proposta altrui / turno inesistente / manager altra società),
  **401** (senza token). Isolamento società verificato.
- **Regressione `claimShift`**: test dedicato del claim autonomo → 403 (non assegnato) / 200
  (assegnato) / 409 (già preso), identico a prima del refactor.
- `node -e "require('./src/app.js')"`: nessun ciclo di require. Build frontend Vite: OK.
- Dati di test rimossi al termine (CASCADE); DB locale pulito (0 righe residue).

### In sospeso
- **Migrazione produzione** di `substitution_proposals`: da eseguire con quelle delle Fasi 1–3 dopo
  conferma esplicita dell'utente.

---

## Fase 6 — Opt-out "Non partecipare" + storico per il motore ✅

**Completata**: 2026-07-08. Due parti additive: (A) il dipendente dichiara periodi di opt-out; (B) il
motore usa opt-out e storico rifiuti per ordinare i candidati. Decisione dell'utente: l'opt-out
**blocca l'invio di una proposta** in quel periodo e retrocede in classifica (resta visibile).

### File toccati
- `backend/src/db/schema.sql` — **+** tabella `substitution_optouts` (`user_id`, `start_date`,
  `end_date` *nullable* = a tempo indeterminato, `note`; `CHECK end_date IS NULL OR >= start_date`) +
  indice. Niente `company_id` (isolamento nel controller, come `user_availability`). Migrazione idempotente.
- `backend/src/controllers/optOutController.js` — **nuovo**: `getUserOptOuts` (self **o** manager in
  sola lettura), `addUserOptOut` (self-only, ruolo `user`), `deleteUserOptOut` (self-only). Date
  validate/formattate TZ-safe (riusa `toDateOnly` di `shiftExpansion`; validazione su componenti UTC).
- `backend/src/routes/users.js` — **+** `GET/POST /api/users/:id/optouts`,
  `DELETE /api/users/:id/optouts/:optoutId` (stesso schema di autorizzazione delle disponibilità:
  `authenticate` + autorizzazione fine nel controller).
- `backend/src/services/substitutionMatcher.js` — batch aggiuntivi (opt-out attivi sul giorno,
  rifiuti da `substitution_proposals`); **opt-out** → penalità `CONFIG.optOutPenalty` (floor a 0) +
  motivo rosso + flag `optedOut`, ordinati in fondo; **storico** → la dimensione considera anche i
  rifiuti (`CONFIG.declinePenaltyRatio`, motivo neutro "Ha rifiutato N proposte in precedenza"). Le
  proposte accettate NON si ricontano (già presenti tra i turni `volante` con `user_id`). Sola lettura.
- `backend/src/controllers/substitutionProposalController.js` — `createProposals` esclude dai
  candidati validi chi è in opt-out sulla data (finisce in `skipped`).
- `backend/src/services/notificationService.js` — **+** `excludeOptedOut`: la notifica broadcast
  "nuova sostituzione disponibile" salta i dipendenti in opt-out per quella data (best-effort).
- `frontend/src/api/client.js` — **+** `getUserOptOuts`, `addUserOptOut`, `deleteUserOptOut`.
- `frontend/src/components/profile/OptOutEditor.jsx` — **nuovo**: editor self-service (aggiungi
  periodo con data inizio + fine opzionale + nota, elenco, rimuovi); esporta `formatOptOutPeriod`.
- `frontend/src/components/profile/MyProfile.jsx` — monta `<OptOutEditor />` sotto le disponibilità.
- `frontend/src/components/management/AvailabilityModal.jsx` — **+** sezione read-only "Periodi 'non
  partecipa'" (il manager li vede insieme alle disponibilità).
- `frontend/src/styles.css` — **+** `.optout-form`/`.optout-list`/`.optout-item`/`.optout-heading`.

### Decisioni specifiche della fase
- **Opt-out "blocca + retrocede"** (scelta dell'utente): non si invia la proposta a chi ha detto no
  (in `skipped`, visibile), e il motore lo mostra retrocesso in fondo con motivo rosso. **Non** tocca
  `listAvailableShifts`: resta libero di reclamare autonomamente se cambia idea ("non sollecitarmi",
  non "non posso"). Nessuna esclusione silenziosa: resta sempre visibile in classifica.
- **`end_date` nullable** = opt-out a tempo indeterminato ("da oggi finché non revoco").
- **Storico senza doppi conteggi**: le proposte accettate diventano turni `volante` con `user_id`, già
  contati; dalle proposte si prende solo il numero di **rifiuti** (segnale che i turni non hanno).
- **Bug fuso orario evitato**: date DATE formattate/validate TZ-safe (no `toISOString()`, che nei fusi
  UTC+ slitta il giorno indietro — stesso accorgimento già adottato per le date dei turni).

### Verifica svolta (locale)
- Migrazione idempotente (2×); tabella + indice + `CHECK` confermati.
- Script e2e via HTTP (JWT firmati), **24/24**: CRUD opt-out (self/manager/errori 400/401/403/404,
  periodo con/senza fine), motore (opt-out → `optedOut`/score 0/ultimo/motivo rosso), `createProposals`
  (blocco+`skipped`), storico rifiuti (motivo "Ha rifiutato 1 proposta"), soppressione notifica
  broadcast (empA in opt-out NON notificato, empB sì).
- **Regressione**: Fase 5 e2e **30/30** e claim autonomo **4/4** ancora verdi dopo le modifiche al motore.
- **Smoke test browser**: editor dipendente (aggiungi periodo con date corrette senza slittamento,
  rimuovi, opt-out a tempo indeterminato) + vista manager read-only nel modale "Disponibilità".
  Nessun errore console imputabile alla fase (i 404 su `/auth/me` erano un token residuo del test Fase 5).
- Build frontend OK; app backend carica senza cicli. Dati di test rimossi (DB pulito).

### In sospeso
- **Migrazione produzione** di `substitution_optouts`: da eseguire con le pendenti delle Fasi 1–3/5
  dopo conferma esplicita dell'utente.

---

## Fase 7 — Escalation lazy (senza cron) ✅

**Completata**: 2026-07-08. Se una Sostituzione resta scoperta oltre le ore configurate dal Dirigente,
i responsabili vengono avvisati. Rilevamento **lazy** al polling delle notifiche (nessun cron, vincolo
hosting serverless), idempotente via `notifications.dedupe_key`. Additivo puro.

### File toccati
- `backend/src/db/schema.sql` — **+** colonna `companies.substitution_escalation_hours INTEGER`
  (nullable; `NULL`/≤0 = escalation disattivata, opt-in per società). `ALTER ... ADD COLUMN IF NOT
  EXISTS` idempotente.
- `backend/src/services/escalationService.js` — **nuovo**: `escalateOverdueSubstitutions(companyId)`
  — legge la soglia (se assente/≤0 esce), trova le Sostituzioni ancora scoperte, con data futura,
  aperte da più ore del tempo configurato (misurato da `created_at`), e le segnala ai responsabili.
  Best-effort (cattura/logga, non lancia); `LIMIT 50` per sicurezza.
- `backend/src/services/notificationService.js` — **+** `notifySubstitutionEscalated` (tipo
  `substitution_escalated`, ai responsabili, `dedupe_key='escalation:<shiftId>'` → una volta per turno).
- `backend/src/controllers/notificationController.js` — in `listNotifications`, **se chi chiama è
  manager**, chiama la passata (best-effort) prima di leggere le proprie notifiche (così l'escalation
  appena creata compare già nella stessa risposta). Gating ai manager per limitare il costo del poll.
- `backend/src/controllers/companySettingsController.js` — **nuovo**: `getCompanySettings` /
  `updateCompanySettings` (scoped a `req.user.companyId`; validazione: intero ≥ 0, vuoto/0 → NULL).
- `backend/src/routes/company.js` — **nuovo**: `GET/PUT /api/company/settings` (`requireDirigente`);
  montato in `app.js` su `/api/company`.
- `frontend/src/api/client.js` — **+** `getCompanySettings`, `saveCompanySettings`.
- `frontend/src/components/management/SubstitutionSettingsCard.jsx` — **nuovo**: card "Impostazioni
  sostituzioni" (campo ore + salva; vuoto = disattivata).
- `frontend/src/pages/DirigenteDashboard.jsx` — monta la card in fondo. `styles.css` — **+** `.settings-row`.

### Decisioni specifiche della fase
- **Configurazione riservata al Dirigente** (scelta dell'utente): endpoint scoped `requireDirigente`
  (il Responsabile gestisce l'operatività ma non modifica le regole; il Super Admin resta fuori
  dall'operativo). Risposta `settings` come oggetto estendibile: comportamento/livelli successivi si
  aggiungeranno senza cambiare la struttura. v1 = ore di attesa (livello singolo).
- **Escalation solo ai responsabili** (scelta dell'utente): è l'ultimo livello (autonomia + proposte
  non hanno coperto il turno), tocca al responsabile intervenire. Nessun ri-broadcast ai dipendenti.
- **Nessun cron** (vincolo serverless): rilevamento al polling delle notifiche, **gated ai manager** e
  idempotente. Limite noto: l'escalation è generata solo quando un responsabile è attivo — cioè quando
  può agire; se nessuno è online, compare al primo accesso successivo.
- **Nessuna assegnazione automatica**: l'escalation *avvisa*, non riassegna. Additivo (nessuna modifica
  a `claimShift`/`listAvailableShifts`/`approveRequest`).

### Verifica svolta (locale)
- Migrazione idempotente (2×); colonna `substitution_escalation_hours` confermata.
- Script e2e via HTTP (JWT firmati), **19/19**: impostazioni (GET/PUT, 0→NULL, errori 400 su
  negativi/non-numerici/non-interi, **403** per responsabile/dipendente, **401** senza token); gating
  (poll dipendente non innesca nulla); poll responsabile → escalation **solo** per il turno scaduto
  (no recenti/assegnati/passati), a **tutti** i manager, mai ai dipendenti; **idempotenza** (poll
  ripetuti → nessun duplicato); disattivazione → non scatta più.
- **Regressione**: Fasi 5/6/claim ancora verdi (**30/30 + 24/24 + 4/4**) dopo l'aggancio in
  `listNotifications`.
- **Smoke test browser**: card Dirigente (imposta 12h, salva, notice); la campanella del dirigente
  mostra l'escalation reale ("Sostituzione ancora scoperta in Bagnino da oltre 12h: ..."). Nessun
  errore console. Artefatti e impostazione di test ripristinati (DB pulito).
- Build frontend OK; app backend carica senza cicli.

### In sospeso
- **Migrazione produzione** della colonna `substitution_escalation_hours`: con le tabelle pendenti
  delle Fasi 1–3/5/6, dopo conferma esplicita dell'utente.

---

## Piano completato

Le 7 fasi del **sistema avanzato di sostituzioni** sono implementate e verificate in locale.
Possibili evoluzioni future (non pianificate): deep-link delle notifiche alla tab/funzione specifica,
legame esplicito area↔responsabile (oggi le notifiche manager ricadono su tutta la società), livelli
di escalation successivi + comportamenti configurabili, error boundary attorno ai modali. Prima del
deploy: **migrazione produzione** di tutto (5 tabelle + 1 colonna) su conferma dell'utente.
