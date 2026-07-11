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

---
---

# Iniziativa: Sicurezza e predisposizioni (fasi S1–S7)

> **Scopo**: rafforzare la sicurezza (autenticazione, autorizzazioni, protezione dati, validazione,
> logging) e **predisporre** l'architettura per funzionalità future (verifica email, invio email,
> reset password/2FA, cifratura dati) **senza attivare** servizi esterni né introdurre regressioni.
> Stesso metodo del sistema sostituzioni: fasi additive, migrazioni idempotenti in `schema.sql`,
> ogni fase testata prima della successiva, produzione solo su conferma esplicita.

**Ambito e vincoli**: nessuna modifica alla logica funzionale esistente; ogni requisito di
sicurezza configurabile via **environment variables** (mai valori/chiavi hardcoded); minimizzare le
dipendenze (usare `crypto` di Node e moduli interni). Dipendenze aggiunte: `helmet` (S1). Da
aggiungere solo quando si attiverà l'invio reale: `nodemailer` (non ora).

## Stato fasi

- **S1 — Politica password + hardening base** ✅ *completata (2026-07-08)*
- **S2 — Protezione brute-force (account lockout)** ✅ *completata (2026-07-08)*
- **S3 — Logging e tracciabilità (audit trail)** ✅ *completata (2026-07-08)*
- **S4 — Predisposizione verifica email + token auth avanzata (solo struttura)** ✅ *completata (2026-07-08)*
- **S5 — Predisposizione sistema email (modulare, transport no-op)** ✅ *completata (2026-07-08)*
- **S6 — Modulo cifratura dati sensibili + predisposizione (nessuna applicazione ai dati)** ✅ *completata (2026-07-08)*
- **S7 — Backup/affidabilità + separazione ambienti + documentazione finale** ✅ *completata (2026-07-08)*

**→ Piano sicurezza S1–S7 completato. Riepilogo finale in fondo a questa sezione.**

---

## S1 — Politica password + hardening applicativo base ✅

**Obiettivo**: politica password robusta e configurabile (frontend + backend, single-source),
più hardening applicativo di base senza modifiche allo schema.

### Cosa è stato fatto
- **Config sicurezza centralizzata**: `backend/src/config/security.js` — unico punto di lettura
  delle env di sicurezza (policy password, parametri login futuri S2, `BCRYPT_ROUNDS`), con helper
  `envBool`/`envInt` e default sensati. I requisiti si cambiano **solo** via env.
- **Validazione password backend**: `backend/src/utils/passwordPolicy.js` — `validatePassword()`
  (lunghezza min, maiuscola/minuscola/numero/speciale ognuno disattivabile, blocklist password
  comuni embedded, rifiuto se contiene lo username) + `describePolicy()`. Applicata in
  `authController.firstLoginSetup` e `userController.resetPassword` (prima: solo `length >= 8`).
  Stesso `bcryptRounds` configurabile usato al posto del `10` hardcoded.
- **Endpoint pubblico** `GET /api/auth/password-policy`: espone i requisiti attivi così il frontend
  li riflette senza rebuild (single-source col backend).
- **Frontend**: `frontend/src/utils/passwordPolicy.js` (specchio, con fallback `DEFAULT_POLICY`) +
  `components/auth/PasswordRequirements.jsx` (checklist live ✓/•) integrati in `FirstAccessSetup.jsx`
  (fetch policy all'avvio, validazione client prima dell'invio). Stile `.password-requirements` in
  `styles.css`.
- **Hardening app.js**: boot check `JWT_SECRET` (fail-fast se assente; in produzione anche se è il
  placeholder di esempio); `helmet({ contentSecurityPolicy: false })` (API JSON, niente CSP);
  `app.disable('x-powered-by')`; `express.json({ limit: '100kb' })`; **404 handler** JSON per rotte
  ignote; error handler che gestisce `entity.parse.failed` (400) / `entity.too.large` (413) e
  logga senza il corpo della richiesta (niente password nei log).

### Decisioni prese
- **Helmet** (dipendenza) scelto su richiesta esplicita dell'utente come soluzione standard Express.
  CSP disattivata: il backend serve solo JSON, non HTML.
- Validazione password **dopo** i controlli di ownership/ruolo in `resetPassword`: non si dà
  feedback sulla robustezza prima di aver autorizzato l'operazione.
- I **seed** (`seedDirigente`/`seedSuperAdmin`) NON passano da `validatePassword` (bootstrap dev,
  hash diretto): lasciati invariati per non rompere il flusso locale.
- Le vulnerabilità `npm audit` (`tar`/`@mapbox/node-pre-gyp`) sono **pre-esistenti**, transitive di
  `bcrypt`, solo build-time: non introdotte da S1, segnalate tra i consigli produzione.

### Verifica svolta (locale)
- Boot check: `JWT_SECRET` assente → l'app **rifiuta** di avviarsi con messaggio esplicito; con
  segreto valido carica regolarmente.
- `validatePassword` su 8 casi: rifiuta short/solo-minuscole/solo-maiuscole/no-numero/no-speciale/
  password-comune/contiene-username; accetta `Valid1Pass!`. `describePolicy()` coerente.
- HTTP live (porta 4999): `/api/health` 200 con header Helmet (nosniff, X-Frame-Options, HSTS…);
  `/api/auth/password-policy` restituisce la policy; rotta ignota → `404 {"error":"Risorsa non
  trovata"}`; `x-powered-by` **assente**.
- **Build frontend OK** (82 moduli, nessun errore di import).

### File toccati
`backend/src/config/security.js` (nuovo), `backend/src/utils/passwordPolicy.js` (nuovo),
`backend/src/controllers/authController.js`, `backend/src/controllers/userController.js`,
`backend/src/routes/auth.js`, `backend/src/app.js`, `backend/.env.example`, `backend/package.json`
(+helmet); `frontend/src/utils/passwordPolicy.js` (nuovo),
`frontend/src/components/auth/PasswordRequirements.jsx` (nuovo),
`frontend/src/pages/FirstAccessSetup.jsx`, `frontend/src/api/client.js`, `frontend/src/styles.css`.

---

## S2 — Protezione brute-force (account lockout) ✅

**Obiettivo**: bloccare temporaneamente un account dopo troppi tentativi di login falliti,
in modo compatibile con l'hosting serverless (nessuno stato in memoria condivisa).

### Cosa è stato fatto
- **Schema** (migrazione idempotente in `schema.sql`): `users.failed_login_attempts INTEGER NOT
  NULL DEFAULT 0` e `users.locked_until TIMESTAMPTZ`. Stato del lockout persistito su DB.
- **`authController.login`**: prima di verificare le credenziali, se `locked_until` è nel futuro
  → **429** con messaggio dedicato (senza verificare la password). Ogni tentativo fallito
  (password errata *o* codice di primo accesso errato) chiama `registerFailedAttempt` (incrementa
  il contatore e, raggiunta `LOGIN_MAX_ATTEMPTS`, imposta `locked_until = now + LOGIN_LOCKOUT_MINUTES`).
  Ogni successo (login standard o codice corretto) chiama `resetFailedAttempts` (azzera contatore
  e blocco). Soglia/durata da `config/security.js` (env `LOGIN_MAX_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES`).

### Decisioni prese
- **Stato su DB, non in memoria**: su Vercel le invocazioni serverless non condividono memoria →
  un rate-limiter in-process sarebbe inefficace. Il DB è l'unico stato condiviso affidabile.
- **Nessun job di pulizia**: `locked_until` scaduto è valutato al volo (`isLocked`), non serve un
  cron per "sbloccare" (coerente con l'escalation lazy della Fase 7).
- **Risposta**: sul tentativo fallito la risposta resta "Credenziali non valide" (non rivela nulla);
  solo quando il blocco è *attivo* si risponde 429 con messaggio dedicato — rivelare l'esistenza
  dell'account a blocco attivo è inevitabile con qualunque lockout e accettabile.
- Il lockout copre **anche** il primo accesso (codice iniziale), non solo la password.

### Verifica svolta (locale, DB reale)
- Migrazione idempotente (2×); colonne confermate (`integer` default 0, `timestamptz` null).
- E2E via HTTP con utente usa-e-getta e `LOGIN_MAX_ATTEMPTS=3`: 3 password errate → **401** ciascuna;
  4° tentativo con **password corretta** ma account bloccato → **429** con messaggio dedicato.
- Reset: sbloccato manualmente (simula scadenza), login corretto → **200**, stato DB torna
  `failed_login_attempts=0 / locked_until=null`. Utente di test rimosso (DB pulito).

### File toccati
`backend/src/db/schema.sql`, `backend/src/controllers/authController.js`, `backend/.env.example`.

### In sospeso (produzione)
- **Migrazione produzione** delle 2 colonne su `users`, su conferma esplicita dell'utente.

---

## S3 — Logging e tracciabilità (audit trail) ✅

**Obiettivo**: registrare le operazioni importanti (accessi, modifiche a dati/turni/corsi,
assegnazioni, eliminazioni, azioni amministrative) con chi–quando–cosa.

### Cosa è stato fatto
- **Schema** (idempotente): tabella `audit_logs` (`company_id` FK→companies ON DELETE SET NULL,
  `actor_user_id` FK→users ON DELETE SET NULL — lo storico sopravvive alla rimozione dell'attore,
  `action`, `entity_type`, `entity_id`, `metadata` JSONB, `ip`, `created_at`) + 2 indici
  (per società/data e per entità).
- **Servizio** `backend/src/services/auditService.js`: `logAction()` **best-effort e non bloccante**
  (cattura internamente ogni errore, non lo propaga — un errore di audit non fa mai fallire
  l'operazione); `logFromReq()` (ricava company/actor/ip dalla request); `ipFromReq()` (primo valore
  di `X-Forwarded-For` dietro proxy Vercel).
- **Strumentazione eventi** (in coda ai flussi, come le notifiche): `authController` (auth.login,
  auth.login_failed con motivo: unknown_user/locked/bad_initial_code/bad_password); `userController`
  (user.create/delete/reset_password/regenerate_code/update_areas); `shiftController`
  (shift.create/update/delete); `courseController` (course.create/update/delete);
  `cancellationController` (cancellation.approve/reject); `companyController`
  (company.create/update/dirigente_create, azioni super admin con `company_id` = società toccata).
- **Endpoint di lettura** `GET /api/audit-logs` (`routes/audit.js` + `auditController.js`):
  riservato a **dirigente** (scoping automatico alla propria società) e **super admin** (tutte,
  filtro opzionale `?companyId`); filtri `action`/`entityType`, paginazione difensiva (limit
  max 500). **Predisposto** per una futura UI (nessun frontend in questa fase).

### Decisioni prese
- Audit **best-effort awaitato** (non fire-and-forget): su serverless conviene attendere la
  scrittura prima del freeze della funzione, ma senza propagare errori.
- Responsabile (`admin`) **escluso** dalla lettura audit: funzione di governance riservata a
  dirigente/super admin (facilmente estendibile se servisse).
- `metadata` non contiene mai dati sensibili (nessuna password): solo id/ruoli/motivi.

### Verifica svolta (locale, DB reale)
- Migrazione idempotente (2×); app carica senza cicli di require; tabella/colonne confermate.
- E2E via HTTP: login riuscito → riga `auth.login`; login errato → `auth.login_failed`
  (`reason: bad_password`), con `actor_username`, `ip`, `metadata`. `GET /api/audit-logs` come
  dirigente restituisce gli eventi della propria società; come **dipendente → 403**; senza token →
  **401**. Bug intercettato e corretto in verifica: `company_id` ambiguo nella JOIN con users →
  filtri qualificati con alias `a.`. Dati di test rimossi (6 righe audit + 2 utenti).

### File toccati
`backend/src/db/schema.sql`, `backend/src/services/auditService.js` (nuovo),
`backend/src/controllers/auditController.js` (nuovo), `backend/src/routes/audit.js` (nuovo),
`backend/src/app.js` (registrazione route), `authController.js`, `userController.js`,
`shiftController.js`, `courseController.js`, `cancellationController.js`, `companyController.js`.

### In sospeso (produzione)
- **Migrazione produzione** della tabella `audit_logs`, su conferma esplicita.
- Futuro (non pianificato): UI di consultazione, ritenzione/rotazione dei log.

---

## S4 — Predisposizione verifica email + token auth avanzata ✅

**Obiettivo**: preparare la struttura per verifica email, reset password via link temporaneo e 2FA
via email — **senza attivare** alcun invio (funzioni future). Solo schema + servizio testabile.

### Cosa è stato fatto
- **Schema** (idempotente): `users.email_verified` e `users.two_factor_enabled` (entrambi BOOLEAN
  DEFAULT FALSE — nessun impatto sui flussi attuali, che non consultano ancora questi campi).
  Tabella generica **`auth_tokens`** (`user_id` FK ON DELETE CASCADE, `purpose` CHECK in
  email_verification/password_reset/two_factor, `token_hash`, `expires_at`, `used_at`, `created_at`
  + 2 indici). Un'unica struttura per i tre scopi futuri.
- **Servizio** `backend/src/services/authTokenService.js`: `createToken(userId, purpose, options)`
  → restituisce il token **in chiaro una sola volta** (nel DB solo l'hash SHA-256), con TTL per
  scopo configurabile via env e invalidazione dei token precedenti dello stesso scopo;
  `consumeToken(rawToken, purpose)` → verifica scadenza + **monouso atomico** (UPDATE con guardia
  `used_at IS NULL` che evita corse concorrenti). Usa `crypto` di Node, **nessuna dipendenza**.

### Decisioni prese
- **Solo hash a DB**, mai il token in chiaro: se il DB venisse compromesso i token non sarebbero
  spendibili. Il valore in chiaro vive solo il tempo di essere consegnato all'utente (futuro invio).
- **Tabella unica `auth_tokens`** con `purpose` invece di 3 tabelle separate: struttura modulare
  che copre in un colpo verifica email / reset / 2FA.
- **Nessun endpoint attivato**: il servizio è testabile ma non è ancora agganciato a rotte — sarà
  la fase futura di attivazione (dopo S5 email) a collegarlo, su richiesta.

### Verifica svolta (locale, DB reale)
- Migrazione idempotente (2×); colonne `email_verified`/`two_factor_enabled` e tabella `auth_tokens`
  confermate. Test del servizio **7/7**: token creato (chiaro 64 char), a DB solo l'hash
  (SHA-256, ≠ chiaro); primo consumo valido con userId corretto; secondo consumo **rifiutato**
  (monouso); purpose errato rifiutato; token scaduto (ttl −1) rifiutato; creazione nuova invalida
  la precedente dello stesso scopo. Dati di test rimossi.

### File toccati
`backend/src/db/schema.sql`, `backend/src/services/authTokenService.js` (nuovo),
`backend/.env.example`.

### In sospeso (produzione / future)
- **Migrazione produzione** (2 colonne su `users` + tabella `auth_tokens`), su conferma esplicita.
- Attivazione effettiva (endpoint di verifica email / reset / 2FA) rimandata: richiede S5 (email) e
  una fase di wiring dedicata su richiesta dell'utente.

---

## S5 — Predisposizione sistema email (modulare) ✅

**Obiettivo**: base modulare per gli invii email futuri (reset password, verifica email, proposte
di sostituzione, comunicazioni) **senza attivare** alcun invio reale.

### Cosa è stato fatto
- **Modulo** `backend/src/services/email/`:
  - `emailService.js` — `sendEmail({ to, template, data })`: costruisce subject/text/html dal
    template e delega al provider selezionato; `isEmailConfigured()` (true solo con provider reale).
    Mittente da `EMAIL_FROM`.
  - `providers/` — `index.js` (`getProvider()` sceglie via `EMAIL_PROVIDER`, default `noop`; provider
    ignoto → fallback no-op con warning) + `noopProvider.js` (**non invia**, logga soltanto). Spazio
    predisposto per SMTP/API futuri (commentati).
  - `templates/index.js` — template puri `{subject,text,html}`: `email_verification`,
    `password_reset`, `two_factor_code`, `substitution_proposal`, `generic_notification`; costruzione
    link da `APP_BASE_URL`; escape HTML dei dati interpolati.
- Nessuna dipendenza aggiunta (`nodemailer` sarà introdotto **solo** quando si attiverà l'SMTP reale).

### Decisioni prese
- **Transport no-op di default**: la struttura è completa e testabile end-to-end senza rischio di
  invii accidentali in sviluppo e senza configurare un provider. Nessun chiamante è ancora agganciato.
- Email come **canale futuro aggiuntivo** rispetto alle notifiche in-app (che restano primarie).
- Provider ignoto → fallback no-op (nessuna rottura se `EMAIL_PROVIDER` viene impostato in anticipo).

### Verifica svolta (locale)
- Test del modulo **7/7**: render `email_verification`/`password_reset` con link corretti;
  escape HTML (nessun `<script>` grezzo); `sendEmail` con no-op → `provider:'noop'`,
  `delivered:false`, logga; `isEmailConfigured()` = false col default; template sconosciuto e
  destinatario mancante → errore esplicito.

### File toccati
`backend/src/services/email/emailService.js`, `.../providers/index.js`, `.../providers/noopProvider.js`,
`.../templates/index.js` (tutti nuovi), `backend/.env.example`.

### In sospeso (future)
- Attivazione di un provider reale (SMTP via `nodemailer` o API) + wiring degli invii ai flussi
  (reset password, verifica email, ...), su richiesta esplicita dell'utente.

---

## S6 — Modulo cifratura dati sensibili (predisposizione) ✅

**Obiettivo**: fornire il modulo di cifratura at-rest e la classificazione dei dati, **senza
applicarlo** ad alcun campo esistente (decisione esplicita: l'applicazione tocca dati reali).

### Cosa è stato fatto
- **Modulo** `backend/src/utils/crypto.js`: **AES-256-GCM** (cifratura autenticata), IV casuale a
  12 byte per valore, chiave a 32 byte da env (`DATA_ENCRYPTION_KEY`, hex). Formato autodescrittivo
  `enc:<keyId>:<iv>:<tag>:<ciphertext>` pensato per la **rotazione**: keyring con chiave primaria +
  chiavi ritirate (`DATA_ENCRYPTION_KEYS_RETIRED`) in sola decifratura. `encrypt`/`decrypt`
  gestiscono null; `decrypt` restituisce invariati i valori **non** cifrati (adozione graduale
  sicura); `isEncrypted`/`isEncryptionConfigured`. Usa `crypto` di Node, **nessuna dipendenza**.
- **Classificazione dati** documentata in `PROJECT_CONTEXT.md` → "Sicurezza: classificazione dati e
  cifratura": operativi (in chiaro) / credenziali (già hashate) / personali sensibili. `email`
  resta in chiaro per motivi funzionali (login-lookup, unicità, verifica email); candidati primari
  alla cifratura: `phone` e note contrattuali.

### Decisioni prese
- **Nessuna applicazione ai dati** in questa fase (richiesta esplicita dell'utente): solo modulo +
  predisposizione. L'applicazione a `phone`/note sarà una fase dedicata, su conferma.
- **AES-256-GCM** (non solo AES-CBC): autentica il ciphertext, un valore manomesso è rifiutato.
- **Chiave solo via env**, mai nel codice; versioning della chiave per rotazione senza riscrivere
  tutti i valori storici in una volta.

### Verifica svolta (locale)
- Test del modulo **8/8**: round-trip; IV casuale (cifrari diversi per stesso input); manomissione
  del ciphertext → decrypt **rifiuta** (GCM); valore in chiaro storico → pass-through; null→null;
  `isEncrypted`/`isEncryptionConfigured`; **rotazione** (valore cifrato con `v0` ritirata,
  decifrato con keyring `v1`+`v0`; nuovi valori con primaria `v1`); senza chiave → encrypt lancia,
  `isEncryptionConfigured=false`.

### File toccati
`backend/src/utils/crypto.js` (nuovo), `backend/.env.example`, `PROJECT_CONTEXT.md` (classificazione).

### In sospeso (future)
- **Applicazione** della cifratura ai campi selezionati (`phone`, note) con migrazione dei dati
  esistenti — solo su conferma esplicita (impatta dati reali e la lettura/scrittura di quei campi).

---

## S7 — Backup, affidabilità, separazione ambienti, documentazione ✅

**Obiettivo**: predisporre backup/ripristino, proteggere gli ambienti (dev/prod) dagli script
distruttivi, e chiudere con la documentazione finale.

### Cosa è stato fatto
- **Guardia script distruttivi**: nuovo `backend/src/utils/envGuard.js`
  (`assertDestructiveAllowed`): in `NODE_ENV=production` gli script distruttivi si rifiutano di
  partire salvo `ALLOW_DESTRUCTIVE=true`. Applicata a `db/reset.js` e `db/seedDirigente.js` (prima
  solo un commento). `seed:superadmin` **non** è bloccato: è il bootstrap legittimo dell'admin di
  piattaforma (idempotente `ON CONFLICT DO UPDATE`).
- **Backup/ripristino**: `backend/scripts/backup.sh` (`pg_dump` → `.sql.gz`, carica `DATABASE_URL`
  da `.env` se assente) e `scripts/restore.sh` (`psql`, con protezione produzione). Nuovi npm
  script `db:backup` / `db:restore`. `backups/` aggiunto a `.gitignore`.
- **Separazione ambienti**: documentata in `.env.example` (locale vs Vercel), `NODE_ENV` e
  `ALLOW_DESTRUCTIVE` esplicitati. `.env.example` completo di **tutte** le env delle fasi S1–S6.
- **Documentazione**: `PROJECT_CONTEXT.md` (changelog per ogni fase + sezione classificazione dati)
  e questo file aggiornati; riepilogo finale qui sotto.

### Decisioni prese
- Backup logico manuale come **aggiuntivo** al PITR gestito dal provider (Neon) in produzione — non
  sostitutivo.
- `seed:superadmin` non bloccato (bootstrap legittimo); `reset`/`seed:dirigente`/`restore` sì.

### Verifica svolta (locale)
- Guardia: `db:reset` con `NODE_ENV=production` → **exit 1** (bloccato); con `ALLOW_DESTRUCTIVE=true`
  → guardia superata; in dev non blocca. `bash -n` OK su entrambi gli script.
- `npm run db:backup` contro il DB locale → file `.gz` reale prodotto (poi rimosso).
- **Regressione finale**: migrazione idempotente completa (2×), app carica con tutte le route,
  **build frontend OK**.

### File toccati
`backend/src/utils/envGuard.js` (nuovo), `backend/scripts/backup.sh` (nuovo),
`backend/scripts/restore.sh` (nuovo), `backend/src/db/reset.js`, `backend/src/db/seedDirigente.js`,
`backend/package.json`, `backend/.gitignore`, `backend/.env.example`, `PROJECT_CONTEXT.md`.

---

## Riepilogo finale — Iniziativa Sicurezza (S1–S7)

### Sicurezza IMPLEMENTATA e attiva
- **Password**: hashing bcrypt (mai in chiaro, costo configurabile) + **politica robusta
  configurabile** (lunghezza, maiuscole/minuscole/numeri/speciali, blocklist, no-username), validata
  **lato backend e frontend** con requisiti mostrati all'utente (single-source via
  `GET /api/auth/password-policy`). [S1]
- **Sessioni/token**: boot check `JWT_SECRET` (fail-fast), sessioni JWT 8h (invariate). [S1]
- **Hardening HTTP**: **Helmet**, `x-powered-by` off, body limit 100kb, 404/500 handler che non
  espongono dettagli né loggano credenziali. [S1]
- **Anti brute-force**: account lockout su DB (soglia/durata configurabili), compatibile serverless,
  copre anche il primo accesso. [S2]
- **Autorizzazioni**: confermato che tutti i permessi sono lato backend (`requireManager/Dirigente/
  SuperAdmin`) + isolamento multi-tenant `company_id` nei controller (nessun privilegio ottenibile
  da URL/API/parametri). [audit S3]
- **SQL Injection**: confermato che tutte le query sono parametrizzate (nessuna concatenazione di
  input). **XSS**: API solo-JSON, React escapa di default, nessun `dangerouslySetInnerHTML`.
- **Audit trail**: registro `audit_logs` (chi/quando/cosa) su accessi, CRUD utenti/turni/corsi,
  cancellazioni, azioni società; endpoint di lettura per dirigente/super admin. [S3]
- **Affidabilità**: guardie anti-esecuzione distruttiva in produzione + backup/ripristino. [S7]

### Parti solo PREDISPOSTE (struttura pronta, non attive)
- **Verifica email + 2FA**: colonne `users.email_verified`/`two_factor_enabled` + tabella
  `auth_tokens` + servizio token monouso/scadenza (`authTokenService`). Nessun endpoint agganciato. [S4]
- **Sistema email**: modulo `services/email/` (provider astratto, **transport no-op** di default,
  template). Nessun invio reale. [S5]
- **Cifratura dati sensibili**: modulo `utils/crypto.js` (AES-256-GCM, chiave da env, rotazione).
  **Non applicato** ad alcun campo. [S6]

### Migrazioni DB in sospeso per la PRODUZIONE (solo su conferma esplicita)
- `users`: `failed_login_attempts`, `locked_until` [S2]; `email_verified`, `two_factor_enabled` [S4].
- Tabelle nuove: `audit_logs` [S3], `auth_tokens` [S4].
- Tutte idempotenti, additive, senza perdita dati. Da applicare in blocco con `npm run migrate`
  (connection string di produzione) dopo il via dell'utente.

### Miglioramenti consigliati prima/della fase produzione
1. **Impostare le env di sicurezza in produzione**: `JWT_SECRET` robusto (obbligatorio),
   `NODE_ENV=production`, `CORS_ORIGIN` ristretto al dominio del frontend, e — quando si attiveranno —
   `DATA_ENCRYPTION_KEY` / provider email.
2. **`npm audit`**: risolvere le vulnerabilità transitive di `bcrypt` (`tar`/`node-pre-gyp`, solo
   build-time) valutando `npm audit fix` o l'aggiornamento di `bcrypt` (testare il login dopo).
3. **Attivare cifratura** su `phone` e note contrattuali (fase dedicata, con migrazione dati).
4. **Attivare email** (provider reale) e **wiring** di verifica email / reset password / 2FA sui
   token già predisposti.
5. **UI audit log** per dirigente/super admin (endpoint già pronto).
6. Valutare **refresh token / logout server-side** (oggi sessioni stateless 8h) e ritenzione/
   rotazione dei log di audit.

---

# Iniziativa: Riorganizzazione struttura interfaccia (sidebar + sezioni)

**Stato: ✅ completata (2026-07-08).** Solo frontend: nessuna modifica al backend/schema, nessuna
funzionalità rimossa, nessun restyling grafico (palette e componenti visivi invariati). Fonte di
verità architetturale: `PROJECT_CONTEXT.md` → sezione "Struttura dell'interfaccia: navigazione a
sezioni con sidebar".

## Cosa è stato fatto

- **Layout comune** `components/layout/AppLayout.jsx` (sidebar sempre visibile + topbar con
  campanella/logout + `<Outlet />`) e tre layout di ruolo: `ManagerLayout` (9 sezioni, selettore
  sede nella sidebar, condiviso da /dirigente e /admin), `EmployeeLayout` (7 sezioni),
  `SuperAdminLayout` (Dashboard + Società, senza campanella).
- **Contesto** `context/ManagerWorkspaceContext.jsx`: sede selezionata (riusa `useSedeSelection`) +
  aree della sede + timeWindow, condivisi da tutte le sezioni manager.
- **Pagine per sezione** (i contenuti sono i componenti preesistenti, ricollocati):
  `pages/manager/*` (ManagerDashboard, CalendarioPage, TurniPage, PersonalePage, SostituzioniPage,
  FabbisognoPage, ImpostazioniPage), `pages/employee/*` (EmployeeHome, EmployeeCalendario,
  EmployeeTurni, EmployeeSostituzioni, EmployeeImpostazioni), `pages/sections/*` (ComunicazioniPage,
  ReportPage — condivise), `pages/superadmin/*` (SuperAdminHome, SocietaPage).
- **Dashboard solo riassuntive** (nuove): indicatori sintetici + link alle sezioni, costruite
  esclusivamente su endpoint esistenti (listAvailableShifts, staffing/coverage,
  cancellation-requests, notifications, proposals/mine), polling 30s.
- **Routing** `App.jsx`: rotte annidate per ruolo sotto i layout; redirect di compatibilità
  `/…/users/new` → `/…/personale/nuovo`; `ROLE_HOME` invariata. `CreateUser.jsx` è ora pagina
  figlia di Personale (rimossa la topbar propria).
- **Rimossi** (sostituiti, nessuna funzionalità persa): `AdminDashboard.jsx`,
  `DirigenteDashboard.jsx`, `employee/EmployeeDashboard.jsx`, `superadmin/SuperAdminDashboard.jsx`.
- **Stili**: classi layout in coda a `styles.css` (`.app-shell`, `.sidebar*`, `.dash-grid`,
  `.stat-card`, `.comms-list`); sotto i 900px la sidebar diventa barra orizzontale scorrevole.
  `relativeTime` esportata da `NotificationsBell.jsx` (riusata da ComunicazioniPage).

## Verifica svolta

Browser end-to-end sui 4 ruoli con dati locali reali: Dirigente (tutte le 9 sezioni; calendario con
chip fabbisogno/corsie/toolbar invariati; Impostazioni con Sedi/Aree/escalation), Responsabile
(stesse sezioni, senza Responsabili in Personale e senza gestione struttura in Impostazioni),
Dipendente (7 sezioni; calendario dalle proprie aree; profilo/disponibilità/opt-out in
Impostazioni), Super Admin (statistiche + tabella società). Redirect legacy verificato. Build Vite
OK, nessun errore console introdotto. (Nota dati locali: password di `testmag` reimpostata a scopo
di test; utente temporaneo `resp_test` creato e poi eliminato.)

## Possibili passi successivi

- Restyling grafico vero e proprio (vedi suggerimenti in PROJECT_CONTEXT.md: variabili CSS, icone
  sidebar, refresh tabelle, topbar sticky con attenzione agli z-index).
- Deep-link delle notifiche verso le sezioni (ora che le aree/sezioni hanno URL propri, il
  `payload` delle notifiche può diventare navigabile — limite v1 dichiarato in Fase 3).
- Eventuale endpoint di riepilogo dedicato per le Dashboard se i conteggi multipli diventassero
  pesanti su società grandi.

---
---

# Iniziativa: Demo Framework (fasi D1–D6)

> **Scopo**: rendere Planivo capace di generare **ambienti dimostrativi realistici per qualsiasi
> settore** come funzionalità permanente: un layer "Demo Framework" sopra il software esistente in
> cui cambiano SOLO i dati caricati, mai la logica del gestionale. Piano completo e decisioni in
> `~/.claude/plans` (sessione 2026-07-10) e in `PROJECT_CONTEXT.md` → sezione "Demo Framework".
> Architettura: Framework (motore generico) → Scenario (modulo dati autocontenuto) → Dataset
> (offset di date + ref simbolici) → Tour guidato → Software (invariato).

**Decisioni vincolanti prese con l'utente (2026-07-10)**:
1. Isolamento: società demo nello **stesso DB**, flag `companies.is_demo`; il framework rifiuta di
   scrivere su società non-demo (`assertDemoCompany`, chokepoint unico).
2. Ingresso: bottone "Prova la demo" nel Login (visibile solo con `DEMO_MODE=true`), scelta persona
   Dirigente/Responsabile/Dipendente.
3. Tour multi-attore: azioni dell'altro attore **simulate lato server** riusando gli helper
   esistenti (mai logica duplicata).
4. Voci di spec senza funzionalità corrispondente: ferie → richieste di cancellazione + opt-out con
   nota "Ferie"; logo → placeholder solo frontend; documenti esclusi dalla v1.

## Stato fasi

- **D1 — Fondamenta: migrazione + framework core + guardie + status** ✅ *completata (2026-07-10)*
- **D2 — Scenario ristorante + loader completo + npm run demo:load** ✅ *completata (2026-07-10)*
- **D3 — Demo login (lazy re-anchor) + bottone Login + banner (Demo Libera)** ✅ *completata (2026-07-10)*
- **D4 — Tour engine frontend (scenario-agnostico)** ✅ *completata (2026-07-10)*
- **D5 — Tour commerciale + azioni simulate** ✅ *completata (2026-07-10)*
- **D6 — Rifiniture: badge Demo superadmin, stats, documentazione finale** ✅ *completata (2026-07-10)*

---

## D1 — Fondamenta: migrazione, framework core, guardie, /api/demo/status ✅

**Completata**: 2026-07-10. Additivo puro (2 righe in `app.js`, il resto è tutto nuovo).

### Cosa è stato fatto
- **Schema** (migrazione idempotente in coda a `schema.sql`): `companies.is_demo BOOLEAN NOT NULL
  DEFAULT FALSE` + indice parziale; tabella **`demo_state`** (`company_id` UNIQUE FK CASCADE,
  `scenario_id` UNIQUE — una istanza per scenario in v1, `dataset_version`, `anchor_date`,
  `loaded_at`, `tour_context JSONB` per i "ganci" dei tour risolti in id reali).
- **`backend/src/demo/framework/`** (ZERO logica di settore):
  - `config.js` — env `DEMO_MODE` (default spenta), `DEMO_RESEED_AFTER_DAYS` (default 7),
    `DEMO_PERSONA_PASSWORD` (solo dev); lette a runtime, mai hardcoded.
  - `guard.js` — `requireDemoEnabled` (middleware: demo spenta ⇒ 404 identico al 404 globale) e
    **`assertDemoCompany(companyId, db)`** — chokepoint anti-dati-reali, PRIMA istruzione di ogni
    percorso di scrittura del framework; accetta il client di transazione.
  - `rng.js` — PRNG deterministico seedato (xmur3+mulberry32, zero dipendenze): ogni reload di uno
    scenario produce lo stesso "mondo" traslato sulla nuova ancora.
  - `anchor.js` — conversioni offset→data/timestamp TZ-safe (riusa `formatLocalDate`/`DAY_CODES`
    di `utils/recurrence.js`), `weekdayOfOffset` per i generatori.
  - `registry.js` — registro scenari: aggiungere uno scenario = una cartella + una riga qui.
  - `loader.js` — **motore generico completo**: `loadScenario(id,{force})` in TRANSAZIONE UNICA
    (`pool.connect()` → BEGIN/COMMIT, primo uso di transazioni nel progetto, confinato qui) con
    `pg_advisory_xact_lock` per scenario (load concorrenti serializzati, stato riletto dentro il
    lock); `isStateStale` (ancora più vecchia di `DEMO_RESEED_AFTER_DAYS` o version bump del
    dataset); `insertDataset` consuma le sezioni generiche del contratto scenario (documentato in
    testa al file: company, sedi, aree, utenti, contratti, disponibilita, optouts, fabbisogni,
    eccezioni*, turni, corsi, richiesteCancellazione, proposte, notifiche, auditLogs, tourContext)
    risolvendo i ref simbolici in id reali; INSERT multi-riga a blocchi da 200 per lo storico;
    UNA sola password bcrypt per load (casuale, o `DEMO_PERSONA_PASSWORD` in dev); username demo
    validati col prefisso obbligatorio `demo-`; payload notifiche con chiavi `*Ref` risolte come
    nei flussi reali.
  - `reset.js` — `resetScenarioCompany(client, companyId)`: guardia, DELETE espliciti di
    `audit_logs` (FK SET NULL) e `demo_state`, poi `DELETE FROM companies WHERE id=$1 AND
    is_demo=TRUE` (predicato ridondante; rowCount 0 ⇒ errore, mai silenzioso). Il CASCADE della
    company elimina tutto il resto.
- **`controllers/demoController.js`** + **`routes/demo.js`** (montato su `/api/demo` in `app.js`):
  `GET /api/demo/status` pubblico — `{enabled:false}` a demo spenta, altrimenti scenari registrati
  (solo metadati di presentazione). Le rotte operative future useranno `requireDemoEnabled`.
- `backend/.env.example` — sezione Demo Framework (DEMO_MODE / DEMO_RESEED_AFTER_DAYS /
  DEMO_PERSONA_PASSWORD).

### Decisioni della fase
- **Demo = dominio proprio (`/api/demo/*`), non legato al Super Admin**: caricare/resettare uno
  scenario è gestione di dati operativi, che il Super Admin per vincolo non tocca. Il framework si
  auto-amministra (lazy al demo-login + reset self-service); al Super Admin resterà solo la
  visibilità (badge "Demo", Fase D6).
- **Default sicuro**: `DEMO_MODE` assente ⇒ rotte demo 404 (indistinguibili da rotte inesistenti),
  bottone frontend non renderizzato.
- **Una istanza per scenario (v1)**: UNIQUE su `demo_state.scenario_id`; le future demo
  per-cliente/temporanee aggiungeranno `instance_key`/`expires_at` rimuovendo il vincolo.

### Verifica svolta (locale, DB reale)
- Migrazione idempotente (2×, seconda no-op); struttura `demo_state`/`is_demo`/indici confermata;
  le società esistenti restano `is_demo=false`.
- Guardia: società reale → rifiutata; id inesistente → rifiutato; società demo di test → passa
  (creata e rimossa); registry con scenario ignoto → errore esplicito.
- Server live: `GET /api/demo/status` → `{enabled:false}` senza `DEMO_MODE`, `{enabled:true,
  scenarios:[]}` con; rotta demo non registrata → `404 {"error":"Risorsa non trovata"}`;
  regressione `GET /api/health` e login reale (200, token) OK. `node --check` su tutti i nuovi
  file; app carica senza cicli di require.

### In sospeso
- Migrazione produzione di `is_demo`/`demo_state`: con le altre pendenti, solo su conferma esplicita.

### Ripresa
- **La Fase D2 riparte da**: creare `backend/src/demo/scenarios/ristorante/` secondo il contratto
  documentato in `loader.js`, registrarlo in `registry.js`, aggiungere `demo/cli.js` + npm script
  `demo:load`/`demo:reset`, e verificare il load end-to-end.

---

## D2 — Scenario ristorante + loader completo + npm run demo:load ✅

**Completata**: 2026-07-10. Primo scenario reale + verifica end-to-end del motore generico.

### Cosa è stato fatto
- **`backend/src/demo/scenarios/ristorante/`** (modulo dati puro, nessun accesso DB):
  - `structure.js` — società "Ristorante Da Mario S.r.l." (escalation 24h), 1 sede (calendario
    09:00-23:30), 5 aree: Sala/Cucina/Bar/Accoglienza (`shifts`) + Eventi & Formazione (`courses`).
    Ristorante chiuso il lunedì (nessun turno/fabbisogno MON).
  - `people.js` — **35 persone hand-authored** (1 dirigente titolare, 2 responsabili, 32
    dipendenti; alcuni multi-area). Contratti differenziati (tempo pieno/part-time 20/24/30/
    apprendistato/extra con massimali e note), disponibilità per profilo (studenti sere+weekend,
    "ignota" per i full-timer per esercitare quel ramo del motore), pattern settimanale di turni.
  - `planning.js` — orari per area (pranzo/cena), 48 fabbisogni fissi (per giorno/fascia, con
    rinforzo weekend), conversione dei pattern in **55 turni fissi ricorrenti ancorati a -90 gg**
    (backbone "operativo da mesi"), 4 corsi (HACCP fisso + 2 degustazioni singole + 1 volante).
  - `timeline.js` — **presente + storico**: gancio del tour (assenza pendente di Giulia), richiesta
    ferie pendente, 3 sostituzioni scoperte (oggi/domani/+3, una da cancellazione con
    origin_shift_id), 3 proposte mirate (2 pending + 1 declined con snapshot score/reasons),
    notifiche non lette per gestori/dipendenti, 2 opt-out "Ferie" (attivo + storico), 10 cancellazioni
    storiche decise (con sostituzioni coperte da colleghi), turni extra recenti, 12 audit_logs
    distribuiti. Storico di riempimento con **RNG deterministico** (stabile fra i reload), stati
    visibili scritti a mano.
  - `metadata.js` — 3 personas (Dirigente/Responsabile/Dipendente), logoPlaceholder (iniziali DM +
    colore, solo frontend), tour `commerciale`, `version:1`.
  - `index.js` — implementa il contratto scenario: assembla le sezioni, deriva username/email nel
    namespace `demo-ristorante-*`, e applica un **invariante fail-fast** (nessun dipendente supera il
    monte ore settimanale contrattuale con i turni fissi) PRIMA di toccare il DB.
- **`backend/src/demo/cli.js`** + npm `demo:load`/`demo:reset` (load/reset da terminale, TZ-safe).
- **`registry.js`** — scenario `ristorante` registrato (unica riga).
- Fix additivo: `utils/recurrence.js` esporta ora anche `formatLocalDate` (helper puro già
  esistente, serve ad `anchor.js`; nessun cambio di comportamento).

### Verifica svolta (locale, DB reale)
- Build a secco (senza DB): 35 utenti / 34 contratti / 215 disponibilità / 48 fabbisogni / 84 turni
  / 4 corsi / 12 richieste / 3 proposte / 2 opt-out / 9 notifiche / 12 audit; invariante ore
  superato (4 pattern eccedenti corretti a mano, poi verde).
- `demo:load`: **127 ms** (≪ limite serverless 10s). Conteggi a DB coerenti (35 utenti = 1+2+32,
  5 aree, 55 turni fissi, 3 volante scoperti, 2 richieste pendenti, 3 proposte, 6 notifiche non
  lette). `tour_context` risolto in id reali. **Zero sovrapposizioni** turni (self-join), **zero**
  turni fuori finestra sede, **zero** incoerenze area/sede.
- **Idempotenza**: secondo `demo:load` stesso giorno → no-op; `--force` → ricrea con id nuovi,
  rimuove il precedente. `demo:reset` → 0 società demo / 0 demo_state residui, **società reali
  intatte** (`is_demo=false`).
- **Usabilità attraverso il software reale** (login normale con `DEMO_PERSONA_PASSWORD`): login del
  dirigente demo OK; `/api/sedi`, `/api/calendar` (73 turni settimana corrente inclusi 2 volante;
  **69 turni una settimana di 3 mesi fa** → operatività da mesi), `/api/staffing/coverage` (12
  occorrenze, 1 con posti scoperti) — tutto risponde identico al reale, nessuna logica demo nei
  controller.
- Ambiente di test rimosso al termine (DB locale pulito). `node --check` su tutti i nuovi file OK.

### Ripresa
- **La Fase D3 riparte da**: aggiungere `POST /api/demo/login` (lazy load via `loadScenario` +
  emissione JWT di sessione della persona), `POST /api/demo/reset`, `isDemo` in **entrambe** le
  copie di `toSafeUser` (authController esporta già `toSafeUserWithAreas`), i componenti frontend
  `DemoBanner`/`DemoPersonaPicker`, il bottone "Prova la demo" in `Login.jsx` e i metodi in
  `client.js`.

---

## D3 — Ingresso demo: demo-login (lazy), bottone Login, banner = Demo Libera ✅

**Completata**: 2026-07-10. La Demo Libera è pienamente usabile: si entra scegliendo una persona,
si trova il software popolato, si usa tutto senza limiti.

### Cosa è stato fatto
- **Schema** (idempotente): `demo_state.personas JSONB` — mappa persona-key → user_id reale,
  risolta dal loader dopo l'inserimento utenti (il demo-login trova l'utente senza conoscere gli
  username interni).
- **Backend**:
  - `authController.js` — `toSafeUser` espone `isDemo` (JOIN `companies.is_demo` in `login` e `me`);
    estratto `signSessionToken(user)` (JWT sessione 8h, identico all'inline di login) ed esportati
    `toSafeUserWithAreas`/`signSessionToken` per riuso.
  - `userController.js` — `isDemo` anche nella **seconda copia** di `toSafeUser` (+ JOIN in
    `listUsers`); pitfall "toSafeUser duplicata" onorato.
  - `demoController.js` — `demoLogin` (lazy `loadScenario` → risolve la persona → JWT di sessione;
    risposta identica a `/auth/login`), `demoReset` (force reload della propria società demo →
    token+user freschi). `guard.js` — middleware `requireDemoCompany` (403 su società reale).
  - `routes/demo.js` — `POST /demo/login` (pubblico, dietro `requireDemoEnabled`),
    `POST /demo/reset` (`authenticate` + `requireDemoCompany`).
- **Frontend**:
  - `api/client.js` — `demoStatus`/`demoLogin`/`demoReset`.
  - `components/demo/DemoPersonaPicker.jsx` — selettore persona (da `/demo/status`), entra via
    `demoLogin` + `loginWithToken`; persiste la persona in `localStorage` (`turni_demo_persona`).
  - `pages/Login.jsx` — bottone "Prova la demo" (solo se `demoStatus().enabled`), espande il picker.
  - `components/demo/DemoBanner.jsx` — banner permanente (se `user.isDemo`) con "Reinizializza"
    (chiama `demoReset`, `loginWithToken`, reload); montato in `AppLayout.jsx`.
  - `styles.css` — classi `.demo-*` (palette invariata).

### Verifica svolta
- **Backend (curl)**: demo-login per le 3 personas (forma identica a `/auth/login`, `isDemo:true`,
  aree risolte; token valido su `/auth/me` che ritorna `isDemo:true`); persona non valida → 400;
  **staleness** (ancora −10gg → il login successivo ri-seeda, nuova società); **reset** demo →
  token nuovo, reset da utente **reale** → **403**, senza token → **401**; regressione `/auth/me`
  utente reale → `isDemo:false`. Demo spenta (`DEMO_MODE` vuoto): `/demo/login` e `/demo/reset` →
  **404**, `/demo/status` → `{enabled:false}`.
- **Browser (preview)**: pagina login mostra "Prova la demo — Ristorante Da Mario" solo con demo
  attiva; picker con 3 personas; ingresso come Dirigente → `/dirigente`, banner "MODALITÀ DEMO"
  visibile, dashboard popolata (3 sostituzioni aperte, 2 richieste, 2 posti scoperti oggi, copertura
  fabbisogno reale), campanella con badge; calendario con 5 tab area, 222 blocchi turno, 58 chip
  fabbisogno. **Nessun errore console.**
- `.env` locale: aggiunto `DEMO_MODE=true` per il preview. Build frontend OK (101 moduli).

### In sospeso
- Migrazione produzione di `demo_state.personas` (con `is_demo`/`demo_state`), su conferma esplicita.

### Ripresa
- **La Fase D4 riparte da**: creare l'engine tour frontend (`tour/TourProvider|TourOverlay|
  useTourTarget`, `constants/tours/`), aggiungere gli attributi `data-tour` alle voci nav e il
  bottone "Tour guidato" nel `DemoBanner`, con overlay z-index 70.

---

## D4 — Tour engine frontend (scenario-agnostico) ✅

**Completata**: 2026-07-10. Motore del Tour Guidato config-driven, indipendente dagli scenari e
dai dati. Solo frontend (nessuna modifica backend): fase deployabile da sola.

### Cosa è stato fatto
- **`frontend/src/tour/`**:
  - `useTourTarget.js` — `useTargetRect(selector)`: risolve un `[data-tour=…]` nel suo
    `getBoundingClientRect` con **retry** (l'elemento può non essere ancora montato), scroll-into-view,
    ricalcolo su scroll/resize + intervallo leggero. Target assente dopo timeout ⇒ `found:false`
    (lo step degrada a "centrato", il tour non si blocca mai). **Nessuna coordinata hardcoded.**
  - `TourProvider.jsx` — state machine `{tourId, stepIndex}` persistita in **sessionStorage**
    (`turni_demo_tour`): `start/next/goTo/stop`. Risolve `{base}` per ruolo (una definizione, tre
    ruoli). Naviga alla `route` dello step; criteri di avanzamento **`next`** (bottone), **`route`**
    (l'utente naviga), **`click`** (listener delegato sul selettore); predisposti `poll`/`action`
    (Fase D5). Si spegne al logout ma **non durante il caricamento auth** (fix: preserva il tour a
    un refresh a metà, quando `user` è momentaneamente null).
  - `TourOverlay.jsx` — portale su `document.body`, **z-index 70** (sopra `.notif-panel` 60 e
    `.modal-overlay` 50): spotlight a 4 pannelli attorno al target (+ anello verde) con
    `pointer-events:none` (l'app resta usabile), tooltip con titolo/descrizione/progresso/comandi
    e clamp al viewport secondo `placement`; step centrato se non c'è target.
  - `constants/tours/benvenuto.js` — mini-tour di validazione (5 step: welcome centrato → dashboard
    → click su Calendario → sostituzioni → fine); `constants/tours/index.js` — registro
    (`getTour`/`listTours`, `DEFAULT_TOUR_ID`).
- **Wiring**: `App.jsx` avvolge le rotte in `<TourProvider>`; `AppLayout.jsx` rende `data-tour` sulle
  voci nav; `ManagerLayout`/`EmployeeLayout` assegnano `tourId` (`nav-dashboard`/`nav-calendario`/…,
  indipendente dal ruolo); `DemoBanner.jsx` — bottone "Tour guidato" (`start(DEFAULT_TOUR_ID)`).
  `styles.css` — classi `.tour-*` (palette invariata).

### Verifica svolta (browser, preview)
- Attributi `data-tour` corretti su tutte le nav; bottone "Tour guidato" nel banner demo.
- Avvio tour: step 1 **centrato** con dim; "Avanti" → step 2 con **spotlight** (anello verde sulla
  nav Dashboard, resto oscurato, tooltip "2/5", vedi screenshot).
- Criterio **click**: allo step 3, click sulla nav Calendario → avanza a step 4 **e** l'app naviga
  a `/dirigente/calendario`.
- **Persistenza**: refresh a metà tour → il tour **riprende** allo stesso step (dopo il fix
  auth-loading). "Esci" → overlay chiuso e sessionStorage pulita.
- **Nessun errore console** (dopo riavvio dev server; gli errori HMR erano residui transitori del
  momento in cui l'index tour importava un file non ancora creato). Build Vite OK.

### Ripresa
- **La Fase D5 riparte da**: creare `constants/tours/tourCommerciale.js` (13 step della giornata
  lavorativa), registrarlo in `constants/tours/index.js` + `DEFAULT_TOUR_ID='commerciale'`, i
  `data-tour` sui componenti coinvolti (SubstitutionsPanel/FindReplacementModal/MyProposalsPanel/
  NotificationsBell/HoursStats/TurniPage), e gli endpoint backend di simulazione azioni/check
  (`framework/simulations.js` + estrazione `acceptProposalForUser`).

---

## D5 — Tour commerciale + azioni simulate ✅

**Completata**: 2026-07-10. Il primo tour racconta una vera giornata lavorativa (un imprevisto
risolto in un minuto) e mostra il VALORE del software. Il flusso a due attori è gestito riusando
gli helper reali, mai duplicando logica.

### Cosa è stato fatto
- **Backend**:
  - `substitutionProposalController.js` — **estratto `acceptProposalForUser({ proposal, user })`**
    (cuore dell'accettazione: `assignVolanteToUser` + accepted/gemelle-expired + notifica);
    `acceptProposal` è ora un wrapper HTTP a **comportamento invariato**. Stesso precedente
    documentato di `claimShift → assignVolanteToUser`.
  - `demo/framework/simulations.js` — **nuovo**: azione `collega-accetta-proposta` (accetta la
    proposta pendente **più recente** della società demo — quella appena inviata dal responsabile,
    a prescindere da quale turno scoperto abbia scelto: robusto, non legato a un turno specifico —
    impersonando il dipendente SOLO lato server via `acceptProposalForUser`); check
    `turno-assegnato` (esiste una proposta `accepted` nella società demo: falso nel dataset
    iniziale, vero solo dopo la simulazione).
  - `demoController.js` — `tourAction`/`tourCheck`; `routes/demo.js` —
    `POST /demo/tour/actions/:name` e `GET /demo/tour/checks/:name` (`authenticate` +
    `requireDemoCompany`: un utente reale non può innescarli → 403).
- **Frontend**:
  - `api/client.js` — `demoTourAction`/`demoTourCheck`.
  - `tour/TourProvider.jsx` — `runAction` (chiama l'endpoint, avanza a esito positivo, mostra
    l'errore senza avanzare su un passo mancato) + criterio **`poll`** (interroga un check a
    intervallo, avanza quando soddisfatto).
  - `tour/TourOverlay.jsx` — bottone azione (`step.action`) + stato attesa/errore; su step `poll`
    nasconde "Avanti" e mostra "in attesa".
  - `constants/tours/tourCommerciale.js` — **12 step** (benvenuto → dashboard → assenza di Giulia →
    approva [click reale] → turno scoperto → trova sostituzione [click] → classifica candidati →
    invia proposta [click reale] → il collega accetta [azione simulata] → turno assegnato [poll] →
    statistiche → conclusione); registrato in `constants/tours/index.js`, `DEFAULT_TOUR_ID='commerciale'`.
  - `data-tour` aggiunti (stringhe statiche): `cancellation-requests`/`approve-request`
    (CancellationRequestsPanel), `substitutions-panel`/`find-replacement` (SubstitutionsPanel),
    `find-replacement-modal`/`send-proposal` (FindReplacementModal), `hours-stats` (HoursStats),
    `notifications-bell` (NotificationsBell). `styles.css` — `.tour-action`/`.tour-error`.

### Verifica svolta
- **Backend (script HTTP e2e, 13/13)**: check iniziale `false` → approva richiesta di Giulia
  (genera volante) → candidati dal motore → invia proposta → **azione simulata accetta** (assegna
  al candidato proposto) → check `turno-assegnato` `true`; guardie **404** (azione/check ignoti),
  **401** (senza token), **403** (utente reale). **Regressione del path reale `acceptProposal`**
  (token firmato per cam_sara sulla proposta pre-caricata): `/proposals/mine` mostra la proposta →
  accept **200** turno assegnato → ri-accept **409**. Comportamento invariato dopo l'estrazione.
- **Browser (preview, tour completo end-to-end)**: percorsi tutti e 12 gli step come Dirigente —
  approvazione reale (avanza + naviga), apertura "Trova sostituzione", classifica candidati,
  selezione + invio proposta reale, **bottone "Il collega accetta ✓"** (azione simulata → turno
  assegnato), **poll** che avanza da solo, pagina Report con statistiche. Screenshot dello step
  finale. "Fine" chiude il tour e pulisce sessionStorage. **Console pulita** in sessione normale
  (i 404 su `/auth/me` visti in corso d'opera erano dovuti al reset del DB demo durante i test
  backend, non a un bug: scenario non reale). Build Vite OK.

### In sospeso
- Nessuna migrazione DB nuova. Migrazioni produzione pendenti invariate (is_demo/demo_state/personas).

### Ripresa
- **La Fase D6 riparte da**: `companyController.js` (`is_demo` in `listCompanies`, esclusione demo
  da `getPlatformStats` previa riconferma), badge "Demo" in `SocietaPage.jsx`, sezione "Demo
  Framework" in `PROJECT_CONTEXT.md` già presente da D1 (integrare tour/simulazioni), riepilogo
  finale e checklist produzione.

---

## D6 — Rifiniture e visibilità piattaforma ✅

**Completata**: 2026-07-10. Chiusura del piano Demo Framework.

### Cosa è stato fatto
- **`companyController.js`**: `is_demo` esposto in `listCompanies` (`toSafeCompany`); **`getPlatformStats`
  esclude le società demo** (`WHERE is_demo = FALSE` sulle società e sugli utenti; il super admin,
  `company_id NULL`, continua a contare) — decisione dell'utente: gli ambienti demo non gonfiano i
  numeri di piattaforma.
- **`SocietaPage.jsx`**: badge "Demo" accanto al nome delle società demo (tooltip "escluso dalle
  statistiche"); `styles.css` — classe `.demo-tag`.
- **Documentazione**: sezione "Demo Framework" in `PROJECT_CONTEXT.md` (da D1, integrata nel
  changelog D2–D5); questo file completo fase per fase; riepilogo finale + checklist produzione qui sotto.

### Verifica svolta
- Super admin: `GET /api/companies` mostra `isDemo:true` per la società demo; `GET /api/companies/stats`
  con un ambiente demo caricato (35 utenti) → `companiesTotal:2` (solo reali), `usersTotal:3`
  (reali + super admin): **demo correttamente escluse**. Build frontend OK; app backend carica.
- Ambiente demo di test rimosso (0 società demo residue). DB locale pulito.

---

## Riepilogo finale — Demo Framework (D1–D6)

**Obiettivo raggiunto**: Planivo può generare ambienti dimostrativi realistici per qualsiasi
settore, come layer permanente sopra il gestionale. Il software resta unico: **cambiano solo i dati
caricati**, mai la logica (le stesse funzionalità funzionano identiche in demo e in reale — provato
usando gli endpoint reali su dati demo).

**Cosa c'è**:
- **Framework generico** (`backend/src/demo/framework/`): config, guardie (chokepoint
  `assertDemoCompany`), RNG deterministico, ancoraggio date, registry, loader in transazione +
  advisory lock, reset, simulazioni tour. Zero logica di settore.
- **Scenario ristorante** (`backend/src/demo/scenarios/ristorante/`): azienda realistica operativa
  "da mesi" (~35 persone, contratti/disponibilità/turni/fabbisogni/corsi/ferie/cancellazioni/
  proposte/notifiche/audit coerenti). **Aggiungere uno scenario = una cartella + una riga in
  `registry.js`** (contratto documentato in `loader.js`).
- **Demo Libera**: bottone "Prova la demo" nel login → scelta persona → software popolato, tutto
  usabile senza limiti. Re-anchoring lazy (senza cron), reset self-service.
- **Tour Guidato**: engine config-driven scenario-agnostico (overlay, spotlight, criteri
  next/route/click/poll/action) + **tour commerciale** (12 step, una giornata lavorativa) con azioni
  del secondo attore simulate lato server riusando gli helper reali.
- **Isolamento**: società demo nello stesso DB, flag `is_demo`, isolamento multi-tenant + guardia +
  namespace username `demo-`. Escluse dalle statistiche di piattaforma.

**Estendibilità predisposta** (non costruita): scenari multipli (registry già a lista), demo
per-cliente/temporanee (`demo_state` pronta per `instance_key`/`expires_at`), demo localizzate
(testi nello scenario), scenari da file di configurazione (contratto JSON-serializzabile tranne
`build()`).

### Migrazione produzione in sospeso (solo su conferma esplicita)
- Colonna `companies.is_demo` + indice parziale; tabella `demo_state` (+ colonna `personas`).
- Tutte idempotenti e additive. Applicare con `npm run migrate` (connection string di produzione).
- Env da impostare sul progetto Vercel backend per attivare la demo in produzione: `DEMO_MODE=true`
  (assente ⇒ demo spenta, rotte 404, bottone non mostrato). Opzionali: `DEMO_RESEED_AFTER_DAYS`
  (default 7). **NON** impostare `DEMO_PERSONA_PASSWORD` in produzione (solo per ispezione locale).
- Il frontend non richiede env nuove: `GET /api/demo/status` guida il rendering del bottone.

### Note / limiti noti
- Il caricamento scenario usa una **transazione** (`pool.connect()`), primo caso nel progetto,
  confinato al loader demo: misurato ~130–150 ms in locale (≪ limite serverless). Se in produzione
  il tempo salisse, valutare batch più grandi o il solo caricamento via CLI + re-anchor lazy corto.
- Il tour commerciale è pensato per la persona **Dirigente** (approvazioni/proposte). Le personas
  Responsabile/Dipendente entrano nella Demo Libera; si potranno aggiungere tour dedicati (una nuova
  definizione in `constants/tours/`, nessuna modifica all'engine).

# Iniziativa: Email Automation, Notification Center e Email Actions (fasi E1–E8)

> Obiettivo: trasformare Planivo da gestionale "a consultazione" a piattaforma **proattiva** che
> invia comunicazioni automatiche (email, poi WhatsApp/SMS/Push) sugli eventi del sistema, con
> verifica email, azioni direttamente dalla mail, storico e preferenze. Costruita come **layer
> additivo** sopra i flussi esistenti, riusando le predisposizioni delle fasi Sicurezza S4
> (`auth_tokens`, `email_verified`) e S5 (modulo `services/email/`).

## Architettura scelta

- **Notification Service centralizzato a canali**: `services/notificationService.js` resta il layer
  eventi (le `notify*`, una per evento, call site nei controller invariati). Sotto di esso ogni
  canale è un modulo con la stessa interfaccia: il canale in-app (tabella `notifications`, già
  esistente) e il nuovo **canale email** (`services/notificationChannels/emailChannel.js`).
  Aggiungere WhatsApp/SMS/Push in futuro = un modulo fratello + una riga di aggancio negli eventi,
  senza toccare la logica di evento.
- **Vincolo serverless (Vercel)**: nessun cron/coda/worker. Gli invii sono sincroni e **best-effort**
  in coda ai flussi, come le notifiche in-app (un errore di invio non fa mai fallire l'azione).
- **Additività**: `claimShift`/`approveRequest`/`createShift`/... non vengono modificati; le email
  partono dalle stesse `notify*` già chiamate in coda.

## Stato fasi

- **E1 — Canale email + storico**: ✅ completata e testata in locale (2026-07-10). Vedi sotto.
- **E2 — Verifica email**: ✅ completata e testata in locale (2026-07-10). Vedi sotto.
- **E3 — Nuovi eventi turno**: ✅ completata e testata in locale (2026-07-10). Vedi sotto.
- **E4 — Template email professionali**: ✅ completata e testata in locale (2026-07-10). Vedi sotto.
- **E5 — Email Actions**: ✅ completata e testata in locale (2026-07-10). Vedi sotto.
- **E6 — Preferenze notifiche**: ✅ completata e testata in locale (2026-07-10). Vedi sotto.
- **E7 — Demo + UI storico comunicazioni + piano di test finale**: ✅ completata e testata in locale
  (2026-07-10). Vedi sotto.
- **E8 — Configurazione provider guidata** (dominio, SPF/DKIM/DMARC, API key, test invio): ✅
  completata con l'utente (2026-07-10). Provider **Resend** configurato, dominio **`planivo.it`
  verificato** (DKIM + SPF via record TXT su Aruba; l'MX del return-path non disponibile su Aruba ma
  non necessario — DKIM allineato copre il DMARC), `EMAIL_FROM=Planivo <no-reply@planivo.it>`.
  **Invio reale riuscito** verso un indirizzo esterno qualsiasi. Resta da replicare la configurazione
  nelle env di produzione (Vercel) e da eseguire le migrazioni in produzione, su conferma.

## Fase E1 — Canale email + storico ✅

Introduce il canale email come secondo canale delle notifiche, con storico degli invii, provider
reale (Resend) e soppressione in ambiente demo. Aggancia le email agli eventi mirati **già
esistenti** (proposta di sostituzione, richiesta/esito cancellazione, proposta rifiutata). Additivo
puro: nessuna modifica ai controller, solo aggiunte in coda alle `notify*`.

### File toccati

- **Schema** (`backend/src/db/schema.sql`): nuova tabella `email_log` (storico invii) + 2 indici.
  Idempotente, additiva. `company_id`/`user_id` con `ON DELETE SET NULL` (log storico, stesso
  principio di `audit_logs`); `to_email` in chiaro per record autoconsistente.
- **Nuovo** `backend/src/services/notificationChannels/emailChannel.js`: `deliverEventEmail(...)`,
  best-effort (non lancia mai). Risolve i destinatari (una query per id), rileva l'ambiente demo,
  applica il gate "solo email verificate", renderizza il template, consegna al provider e registra
  SEMPRE l'esito in `email_log` (`sent`/`failed`/`suppressed`).
- **Nuovo** `backend/src/services/email/providers/resendProvider.js`: invio via API Resend con
  `fetch` nativo (nessuna dipendenza). Registrato nello switch di `providers/index.js` (`resend`).
- `backend/src/services/email/emailService.js`: estratto `deliver({to,subject,text,html})` (invio di
  contenuto già renderizzato, unico punto verso il provider); `sendEmail` ora lo riusa (no doppio
  render).
- `backend/src/services/email/templates/index.js`: 4 nuovi template testuali —
  `cancellation_requested`, `cancellation_approved`, `cancellation_rejected`,
  `substitution_proposal_declined` (stile coerente con gli esistenti; E4 li rivestirà in HTML pro).
- `backend/src/services/notificationService.js`: import di `deliverEventEmail` e aggiunta del canale
  email in coda a 4 funzioni evento — `notifySubstitutionProposal` (→ dipendente proposto),
  `notifyCancellationRequested` (→ responsabili), `notifyCancellationDecision` (→ richiedente,
  approvata/rifiutata), `notifyProposalDeclined` (→ responsabili, escluso chi rifiuta). Le funzioni
  restano best-effort; l'in-app resta invariato.
- `backend/.env.example`: sezione email aggiornata (`EMAIL_PROVIDER=resend`, `RESEND_API_KEY`,
  `EMAIL_FROM`, `APP_BASE_URL`, `EMAIL_REQUIRE_VERIFIED`).

### Decisioni specifiche della fase

- **Solo eventi mirati via email, non broadcast**: `notifySubstitutionAvailable` (nuova sostituzione
  disponibile a TUTTA l'area) resta **solo in-app** — via email sarebbe spam e brucerebbe quota
  provider. Le email E1 hanno sempre un destinatario specifico.
- **Gate v1 "solo email verificate"** (`EMAIL_REQUIRE_VERIFIED`, default `true`): i destinatari non
  verificati producono una riga `suppressed` (motivo "email non verificata"), non un invio. Tutti
  gli account esistenti nascono `email_verified=FALSE`: fino alla Fase E2 nessuna email reale parte
  (a meno di impostare `EMAIL_REQUIRE_VERIFIED=false` per i test). Scelta deliberata, coerente col
  requisito.
- **Soppressione demo**: per società `is_demo=TRUE` la pipeline è identica (evento → template →
  storico) ma **non** si contatta il provider (email fittizie `@demo-…example` = solo bounce). Riga
  `suppressed` (motivo "ambiente demo"). La demo ha la **precedenza** sul gate di verifica. Nessun
  codice demo separato: la stessa `deliverEventEmail` gestisce il caso.
- **Provider Resend**: API REST con `fetch` nativo di Node 18+ → **zero dipendenze npm nuove**
  (filosofia del progetto). Astrazione provider invariata: cambiare provider = un modulo + una riga.
- **`deliver` estratto in `emailService`**: unico punto verso il provider, riusato sia dal canale
  (che rende il template per conto proprio, per loggare il subject e gestire la soppressione) sia da
  `sendEmail` (invii singoli futuri: verifica/reset). Nessun doppio render.

### Verifica svolta (locale)

- **Migrazione idempotente** 2× (seconda no-op). Struttura `email_log` verificata.
- **Test canale (13/13)**: `sent` (non-demo verificato, provider noop), `suppressed`/non-verificato,
  `suppressed`/demo (demo batte il gate), `sent` con gate disattivato, `excludeUserId` (0 righe).
- **Test integrazione (10/10)**: le 4 `notify*` reali alimentano ENTRAMBI i canali (notifica in-app
  + riga `email_log` con template/event_type corretti); esclusione dell'attore su
  `notifyProposalDeclined`.
- **Percorso di fallimento**: con `EMAIL_PROVIDER=resend` senza `RESEND_API_KEY`, `deliverEventEmail`
  **non lancia** (best-effort) e registra `failed` con l'errore corretto.
- **Boot app** OK. Dati di test rimossi (DB pulito, 0 residui). Nessuna dipendenza aggiunta.

### In sospeso

- **Migrazione produzione** della tabella `email_log`: da eseguire con `npm run migrate` (insieme
  alle altre migrazioni additive in sospeso) solo su conferma esplicita.
- **Nessun retry** per gli invii `failed` in v1 (restano tracciati; un retry lazy in stile
  escalation Fase 7 è un'estensione futura).
- Attivazione invii reali: richiede E8 (configurazione dominio + provider) e E2 (verifica email) per
  superare il gate. Fino ad allora il default `noop` non invia nulla.

## Fase E2 — Verifica e cambio email ✅

Sistema completo di conferma dell'indirizzo email + cambio email self-service, sopra le
predisposizioni S4 (`auth_tokens`, `email_verified`). Riusa il canale email (E1) in modalità
transazionale (invio anche a indirizzi non ancora verificati).

### File toccati
- **Schema** (`schema.sql`): `users.pending_email` (colonna nullable, idempotente) = nuovo indirizzo
  in attesa di conferma nel cambio email. `email` (attivo) resta invariato finché non si conferma.
- **`emailChannel.js`** (refactor additivo): estratto il core `sendOne` e aggiunta
  `deliverTransactionalEmail` — invio a UN indirizzo esplicito **NON gated** (le email di verifica
  devono partire proprio verso indirizzi non ancora verificati), con soppressione demo + logging.
  `deliverEventEmail` invariata nel comportamento.
- **Nuovo** `services/emailVerificationService.js`: `issueAndSendVerification` (emette token
  `email_verification` via `authTokenService` + invio transazionale del template `email_verification`).
- **Nuovo** `controllers/emailVerificationController.js`: `sendVerification` (self, reinvio),
  `changeEmail` (self, salva `pending_email` + invia link al nuovo indirizzo), `verifyEmail`
  (**pubblico**: consuma il token; se c'è `pending_email` lo promuove a `email`, altrimenti marca
  verificata). Ri-controllo di unicità in promozione (409 se preso nel frattempo), gestione violazione
  UNIQUE concorrente.
- **Route** (`routes/auth.js`): `POST /auth/verify-email` (pubblico), `POST /auth/send-verification`
  e `POST /auth/change-email` (authenticate).
- **`userController.js`**: `createUser` invia il link di verifica al nuovo account (best-effort);
  `toSafeUser` espone `emailVerified`/`pendingEmail`. **Anche `authController.toSafeUser`** aggiornato
  (le due copie vanno sempre allineate — trappola nota).
- **Frontend**: pagina pubblica `pages/VerifyEmail.jsx` (rotta `/verifica-email`, POST del token con
  guard anti-doppio-consumo per StrictMode), `components/notifications/EmailVerificationBanner.jsx`
  (banner in `AppLayout`, nascosto in demo/se già verificata), `components/profile/EmailManager.jsx`
  (scheda Email in `MyProfile`: stato + reinvio + cambio), `AuthContext.refreshUser`, 3 metodi in
  `client.js`, classi `.email-*`/`.badge-success`/`.success` in `styles.css`.

### Decisioni specifiche della fase
- **Cambio email con `pending_email`**: il nuovo indirizzo non sostituisce subito quello attivo; il
  link va al NUOVO indirizzo e solo alla conferma viene promosso. Un errore di battitura non
  interrompe le comunicazioni verso l'indirizzo funzionante.
- **`verify-email` pubblico e via POST**: il token è la prova (nessuna sessione); la mutazione avviene
  con una POST dalla pagina frontend, non con la sola apertura del link (i client email prefetchano i
  link in GET — stesso principio di sicurezza che userà E5 per le Email Actions).
- **Gate "solo verificate"**: già in `emailChannel` (E1); E2 fornisce agli utenti il modo di
  verificarsi. Le email di verifica **bypassano** il gate (transazionali), la demo resta soppressa.
- **`toSafeUser` duplicata**: `emailVerified`/`pendingEmail` aggiunti in ENTRAMBE le copie.

### Verifica svolta (locale)
- Migrazione idempotente 2×. **Test backend 22/22** (invio, no-op se già verificata, cambio con
  pending + email attiva invariata, errori formato/uguale/duplicato, verify current, promozione
  pending, token non valido/riuso monouso, conflitto in promozione). Provider forzato `noop` nel test.
- Build frontend OK. **Smoke browser**: pagina `/verifica-email` con token valido → successo +
  `email_verified=true` a DB; token riusato → errore "non valido o scaduto" (monouso). Dati di test
  rimossi.

### In sospeso
- Migrazione produzione di `users.pending_email` (con `email_log` di E1), su conferma.
- Smoke browser di banner + EmailManager (cambio email end-to-end) rimandato alla sessione condivisa
  (richiede login di un utente reale): logica già coperta dai test backend.

## Fase E3 — Email assegnazione e modifica turno ✅

Nuovi eventi che finora non generavano alcuna notifica: l'assegnazione di un turno a un dipendente e
la modifica di un turno assegnato. Additivo puro, in coda a `createShift`/`updateShift`. Nessuna
modifica di schema.

### File toccati
- **`services/email/templates/index.js`**: nuovi template `shift_assigned` e `shift_modified`
  (quest'ultimo mostra Prima/Adesso + eventuale motivo).
- **`services/notificationService.js`**: helper `sedeName`/`companyName`; funzioni `notifyShiftAssigned`
  e `notifyShiftModified` (in-app + email, best-effort, escludono l'attore). Risolvono i nomi
  (azienda/area/sede) dagli id; il nome del dipendente è lo `username` del destinatario.
- **`controllers/shiftController.js`**: helper `describeShiftWhen` (data concreta per singoli/volante,
  etichetta di ricorrenza per i fissi, es. "ogni Lun, Mer"); hook in `createShift` (turno
  fisso/singolo con `user_id` → `notifyShiftAssigned`; il volante resta sul flusso Sostituzioni) e in
  `updateShift` (stesso dipendente → `notifyShiftModified` con vecchi/nuovi valori; riassegnazione a
  un altro → `notifyShiftAssigned` al nuovo). Nuovo campo opzionale `reason` nel body di `updateShift`
  (non persistito, solo per la comunicazione).

### Decisioni specifiche della fase
- **Assegnazione ≠ Sostituzione**: `notifyShiftAssigned` riguarda i turni fissi/singoli assegnati
  direttamente a una persona; le Sostituzioni (volante) mantengono il proprio flusso broadcast
  (`notifySubstitutionAvailable`), non toccato.
- **Turni fissi**: niente data concreta (ricorrenza), descritta a parole da `describeShiftWhen`.
- **Riassegnazione**: se cambia il dipendente assegnato, per il nuovo è un'assegnazione. Un evento
  "turno rimosso" per il vecchio dipendente non è previsto in v1 (estensione futura).
- **`reason`**: motivo della modifica opzionale, passato dal responsabile, non salvato a DB (nessuna
  colonna nuova); appare solo nella comunicazione.

### Verifica svolta (locale)
- **Test controller 15/15** (provider forzato noop): assegnazione singolo (in-app + email, subject con
  data/orario), modifica stesso dipendente (Prima/Adesso), riassegnazione (nuovo dipendente riceve
  "assegnato"), turno fisso (subject con "ogni Lun, Mer"), volante che NON genera `shift_assigned`.
  Dati di test rimossi.

### In sospeso
- Nessuna migrazione. I template testuali verranno rivestiti dal layout HTML professionale in E4.

## Fase E4 — Template email professionali ✅

Layout HTML email condiviso, responsive e brandizzato, applicato a tutti i template. Nessuna
modifica alle firme dei dati (i chiamanti E1–E3 restano invariati) né allo schema.

### File toccati
- **Nuovo** `services/email/templates/layout.js`: `renderLayout({ heading, contentHtml, previewText })`
  (documento HTML completo con header brand verde, corpo, footer) + helper compositivi `paragraph`,
  `button`, `buttonRow` (già pronto per le Email Actions E5: Accetta/Rifiuta affiancati),
  `detailBox` (riquadro etichetta/valore), `highlightBox` (codice 2FA). Brand da `EMAIL_BRAND_NAME`
  (default "Planivo").
- **`services/email/templates/index.js`**: ogni `html` ricostruito col layout (subject e text
  invariati). Coperti tutti i template richiesti: verifica email, reset, 2FA, proposta sostituzione,
  richiesta/approvazione/rifiuto cancellazione, proposta rifiutata, turno assegnato, turno modificato,
  generico.

### Decisioni specifiche della fase
- **Tabelle + stili inline + nessuna risorsa esterna**: vincoli dei client email (Outlook & co.),
  non pagine web. Brand a testo (nessuna immagine remota), max 600px, responsive.
- **Escape dei dati nei template** (non nel layout): il template ha i dati grezzi ed è già il punto in
  cui si applica `escapeHtml`, coerente con E1.
- **`buttonRow` predisposto per E5**: i bottoni Accetta/Rifiuta delle Email Actions useranno questo
  helper (varianti primary/danger/neutral).

### Verifica svolta (locale)
- **Render di tutti i template 55/55** (subject/text presenti, `<!DOCTYPE html>`, brand presente,
  nessun `undefined`/`[object Object]`). **Anteprima visiva nel browser** (file temporaneo in
  `frontend/public`, poi rimosso): header brand, riquadro dettagli e bottoni CTA resi correttamente
  su email_verification e shift_assigned.

### In sospeso
- Nessuna. Le Email Actions (E5) aggiungeranno i bottoni Accetta/Rifiuta usando `buttonRow`.

## Fase E5 — Email Actions ✅

Esecuzione di un'azione direttamente da un bottone nell'email (accetta/rifiuta una proposta di
sostituzione, approva/rifiuta una richiesta di cancellazione) senza aprire il portale.

### File toccati
- **Schema** (`schema.sql`): tabella `email_action_tokens` (token dedicati: `token_hash` SHA-256,
  `user_id` attore, `action` con CHECK, `entity_type`/`entity_id`, `expires_at`/`used_at`) + indice.
- **Nuovo** `services/emailActionService.js`: `createActionToken` / `peekActionToken` (valida senza
  consumare, per la conferma) / `consumeActionToken` (marca used ATOMICO, per l'esecuzione) /
  `actionLink`. Solo hash a DB, valore in chiaro una volta.
- **Estrazioni core** (riuso, nessuna divergenza): `declineProposalForUser` (da `declineProposal`),
  `approveRequestCore`/`rejectRequestCore` + `loadPendingRequest` (da approve/reject cancellazione).
  Gli handler HTTP restano wrapper a comportamento invariato. `acceptProposalForUser` già esisteva.
- **Nuovo** `controllers/emailActionController.js`: `describeAction` (GET pubblico, non muta) +
  `executeAction` (POST pubblico: consuma il token, ri-verifica lo stato dell'entità e
  l'autorizzazione, esegue via i core, audit). **Route** `routes/emailActions.js` + `app.js`.
- **`emailChannel.js`**: `buildData` ora può essere ASYNC (per generare un token per-destinatario),
  con try/catch per destinatario.
- **`notificationService.js`**: `notifySubstitutionProposal` genera i token Accetta/Rifiuta per il
  dipendente; `notifyCancellationRequested` genera i token Approva/Rifiuta **per ciascun responsabile**.
- **Template**: `substitution_proposal` e `cancellation_requested` mostrano i bottoni azione
  (`buttonRow`) quando gli URL sono presenti, altrimenti un link all'app.
- **Frontend**: pagina pubblica `pages/EmailAction.jsx` (rotta `/azione-email`: describe on-load →
  Conferma → execute), 2 metodi in `client.js`.

### Decisioni specifiche della fase (SICUREZZA)
- **Mutazione solo via POST dopo conferma**: il link nell'email è un GET a una pagina che DESCRIVE
  l'azione; l'esecuzione avviene solo col POST esplicito. Così i prefetch dei client email (che
  aprono i link in GET) non innescano l'azione. Stesso principio di `verify-email` (E2).
- **Token dedicati**: hash-only, scadenza (default 7 giorni, `EMAIL_ACTION_TTL_MINUTES`), **monouso
  atomico** (consume), vincolati a utente+azione+entità.
- **Ri-verifica al momento dell'esecuzione**: stato dell'entità (proposta/richiesta ancora
  azionabile) + autorizzazione (per le cancellazioni, l'attore dev'essere un responsabile della
  società del token). "Già gestita" → messaggio, non errore.
- **Riuso dei core, nessuna divergenza**: le Email Actions passano dagli stessi core del percorso
  HTTP (invariante coerente con `assignVolanteToUser`/`acceptProposalForUser`).

### Verifica svolta (locale)
- Migrazione idempotente. **Test backend 21/21**: accetta/rifiuta proposta, approva/rifiuta
  cancellazione, monouso (2° uso 400), **autorizzazione** (token cancellazione a un non-manager →
  403), già-gestita (done:false), token scaduto, integrazione notify→token→email (token creati +
  email registrata). Provider forzato noop.
- Build frontend. **Smoke browser end-to-end**: describe ("Accetta la sostituzione" + dettagli +
  Conferma) → esecuzione → a DB proposta `accepted`, turno assegnato, token `used_at` valorizzato.
  Dati di test rimossi.

### In sospeso
- Migrazione produzione di `email_action_tokens` (con le altre), su conferma.

## Fase E6 — Preferenze notifiche ✅

Ogni utente sceglie quali email di EVENTO ricevere. Riguarda solo il canale email degli eventi: le
notifiche in-app restano il registro completo, le email transazionali (verifica/reset) non sono mai
filtrate.

### File toccati
- **Schema** (`schema.sql`): tabella `notification_preferences` (1:1 con users, `email_mode`
  all/important/none + `disabled_categories` JSONB). Assenza di riga = default "tutte" (retrocompatibile).
- **Nuovo** `services/notificationPreferencesService.js`: catalogo `EMAIL_CATEGORIES` (le 7 categorie
  email di evento, con flag `important`), `getPreferences`, `isEmailAllowed(prefs, eventType)`,
  `sanitizePreferences`.
- **`emailChannel.js`**: `fetchRecipients` fa LEFT JOIN sulle preferenze; `sendOne` (solo percorso
  gated) applica `isEmailAllowed` → riga `suppressed` con motivo "preferenze notifiche utente".
- **Nuovo** `controllers/notificationPreferencesController.js` (`getMyPreferences`/`updateMyPreferences`,
  UPSERT) + rotte `GET/PUT /api/notifications/preferences` (`authenticate`, self).
- **Frontend**: `components/notifications/NotificationPreferences.jsx` (radio modalità + checkbox
  categorie in modalità "tutte"), montato in `MyProfile` (dipendente) e in `ImpostazioniPage`
  (responsabile — che ora ha anche `EmailManager`); 2 metodi in `client.js`; classi `.pref-*`.

### Decisioni specifiche della fase
- **Solo canale email di evento**: le preferenze non toccano le notifiche in-app (registro completo)
  né le email transazionali (verifica/reset, sempre inviate — passano `gated=false`).
- **Importanza**: tutte le categorie sono "importanti" tranne "proposta rifiutata (responsabili)".
  In modalità "solo importanti" solo quella viene soppressa; le categorie fini si gestiscono in "tutte".
- **Default = tutte**: nessuna migrazione dati, gli utenti esistenti continuano a ricevere tutto.

### Verifica svolta (locale)
- Migrazione idempotente. **Test 12/12** (default invia; `none` sopprime tutto; `important` invia le
  importanti e sopprime le altre; categoria disattivata soppressa; transazionale NON filtrata; sanitize
  di modalità/categorie non valide; controller get/update). Provider noop. Build frontend OK.

### In sospeso
- Migrazione produzione di `notification_preferences` (con le altre), su conferma.
- Smoke browser del form preferenze rimandato alla sessione condivisa (logica coperta dai test).

## Fase E7 — Storico comunicazioni + demo ✅

Vista di consultazione dello storico email per responsabile/dirigente (requisito 7) e verifica del
comportamento in demo (requisito 9). Nessuna modifica di schema.

### File toccati
- **Nuovo** `controllers/emailLogController.js` (`listEmailLog`, scoped `company_id`, LIMIT) +
  `routes/emailLog.js` (`GET /api/email-log`, `requireManager`) + `app.js`.
- **Frontend**: `pages/sections/ComunicazioniPage.jsx` estesa con la sezione "Email inviate"
  (solo responsabile/dirigente): tabella con Quando / Destinatario / Comunicazione / Stato (badge
  Inviata/Non inviata/Fallita + motivo per suppressed/failed). `api.listEmailLog`, classi
  `.email-log-*`/`.badge-danger`/`.table-scroll`.

### Demo (requisito 9)
- **Nessun codice demo separato**: gli eventi generati durante l'uso della demo passano dagli stessi
  controller e canale email; per una società `is_demo` l'invio è **soppresso** (riga `email_log`
  `suppressed`), quindi lo storico Comunicazioni in demo mostra le email "che sarebbero state inviate"
  senza contattare il provider. Verificato (test E7 [3]).
- Il loader dello scenario NON è stato modificato (dati storici creati via SQL diretto non generano
  email): lo storico demo si popola man mano che la persona demo compie azioni (proposte,
  approvazioni). Scelta coerente con la filosofia "cambiano solo i dati, mai la logica".

### Verifica svolta (locale)
- **Test E7 9/9**: scoping società (A non vede le email di B), storico demo con riga `suppressed`,
  campi restituiti (recipientUsername/eventType/subject). Build frontend OK.

### In sospeso
- Nessuna migrazione. Smoke browser della pagina Comunicazioni (sezione email) rimandato alla
  sessione condivisa (endpoint + rendering coperti da test + build).

## Riepilogo finale — Iniziativa Email Automation (E1–E7)

**Completata** (2026-07-10) la parte software (E1–E7); E8 (configurazione provider) in corso con
l'utente. Tutto verificato in locale; migrazioni produzione in sospeso su conferma.

### Implementato
- **Canale email a eventi** fratello dell'in-app, best-effort non bloccante, con storico `email_log`
  (E1). Provider **Resend** via `fetch` nativo (zero dipendenze), astrazione provider invariata.
- **Verifica e cambio email** self-service con `pending_email`, pagina pubblica, banner, gate "solo
  verificate" (E2).
- **Email su assegnazione/modifica turno** (E3).
- **Template HTML professionali** responsive brandizzati per tutte le comunicazioni (E4).
- **Email Actions**: accetta/rifiuta proposta e approva/rifiuta cancellazione dai bottoni nella mail,
  con token dedicati monouso, conferma frontend e POST finale (E5).
- **Preferenze notifiche** per utente (tutte / solo importanti / nessuna + categorie) (E6).
- **Storico comunicazioni** consultabile dal gestionale (E7).

### Predisposto (non costruito)
- WhatsApp / SMS / Push: il `notificationService` separa evento e canale; aggiungere un canale =
  un modulo fratello di `emailChannel` + una riga di aggancio negli eventi.
- Retry degli invii `failed` (oggi tracciati, non ritentati): un retry lazy in stile escalation
  Fase 7 è un'estensione naturale.
- 2FA via email: template + `authTokenService` (purpose `two_factor`) già pronti.

### Migrazioni produzione — ESEGUITE (2026-07-10)
- `email_log`, `users.pending_email`, `email_action_tokens`, `notification_preferences` applicate al
  DB **Neon di produzione** (`npm run migrate`, idempotente — verificata no-op alla seconda esecuzione).
- **`schema.sql` è cumulativo**: la stessa esecuzione ha allineato la produzione all'intero schema,
  applicando anche tutte le migrazioni additive rimaste in sospeso dalle iniziative precedenti
  (Sicurezza S2–S4, Sostituzioni fasi 1–7, Demo Framework). Nessun errore, nessuna perdita dati.

### Env da impostare in produzione (Vercel, backend)
- `EMAIL_PROVIDER=resend`, `RESEND_API_KEY=...`, `EMAIL_FROM="Planivo <no-reply@dominio-verificato>"`,
  `APP_BASE_URL=<url frontend>`, `EMAIL_REQUIRE_VERIFIED=true`. Opzionali: `EMAIL_ACTION_TTL_MINUTES`,
  `EMAIL_BRAND_NAME`. Finché `EMAIL_PROVIDER` resta `noop` (default) non parte alcuna email.

### Piano di test finale (requisito 11) — copertura automatizzata locale
| Flusso | Copertura |
|---|---|
| Registrazione nuovo utente → email di verifica | E2 (createUser hook) + E1 (log) |
| Verifica email (successo/errore/monouso) | E2 22/22 + smoke browser |
| Assegnazione turno → email | E3 15/15 |
| Modifica turno → email (vecchi/nuovi valori) | E3 |
| Richiesta cancellazione → email responsabili + azioni | E5 21/21 |
| Approvazione/rifiuto dalla mail | E5 + smoke browser (accept end-to-end) |
| Proposta sostituzione → email + azioni | E5 |
| Accettazione/rifiuto dalla mail | E5 |
| Gestione errori (token scaduto/riusato, non autorizzato) | E5 |
| Preferenze (tutte/importanti/nessuna/categorie) | E6 12/12 |
| Storico comunicazioni (scoping società) | E7 9/9 |
| Funzionamento in demo (soppressione + storico) | E1 + E7 |
| Best-effort non bloccante (provider ko) | E1 (failed non lancia) |

---

# Iniziativa: Sezione Report (analisi operativa del personale)

> Strumento per titolare/responsabile per capire la situazione del personale in pochi secondi.
> **Sola lettura, puramente additiva**: aggrega dati già presenti riusando le logiche esistenti,
> **nessun sistema parallelo**, **nessuna nuova tabella/colonna**, **nessuna migrazione DB**.
> **Non valuta i dipendenti**: solo dati oggettivi + alert informativi (disclaimer esplicito in UI —
> la decisione finale resta al responsabile). Dettaglio architetturale in `PROJECT_CONTEXT.md` →
> sezione "Sezione Report (analisi operativa del personale)".

**Completata**: 2026-07-10.

## Cosa è stato fatto

- **Backend** (dominio isolato, coerente con la modularità del progetto):
  - `services/reportService.js` — cuore dell'aggregazione riusato da entrambi gli endpoint:
    `buildOverview` (scheda per dipendente) e `buildDetail` (dettaglio + confronto col periodo
    precedente di pari durata + storico turni). Una sola `getExpandedShifts` + due query aggregate
    (cancellazioni, proposte) raggruppate per utente (nessun N+1). Alert/stato operativo con soglie in
    costanti (`ALERT_THRESHOLDS`, `STATUS_TOLERANCE_HOURS`). Monte ore previsto proporzionato dal
    massimale contrattuale settimanale/mensile alla durata del periodo (`expectedHoursForPeriod`).
  - `controllers/reportController.js` — validazione periodo (default mese corrente, 400 su date non
    valide/incoerenti), autorizzazione: overview `requireManager`; detail `authenticate` + guardia
    fine (dipendente solo su sé → 403 altrove; manager qualunque della società → 404 fuori società).
  - `routes/reports.js` (`GET /api/reports/employees`, `GET /api/reports/employees/:id`) + registrazione
    in `app.js`.
- **Frontend** (nuova cartella `components/reports/`):
  - `ReportPage.jsx` (riscritta) istrada per ruolo; `ManagerReport` (filtri + griglia + dettaglio
    inline, polling 60s sull'elenco), `EmployeeReport` (self-service), `EmployeeReportCard`,
    `EmployeeReportDetail`, `ReportFilters`, helper `reportPeriods.js`/`reportFormat.jsx`.
  - `api/client.js`: `getReportOverview`, `getEmployeeReport`. Stili `.report-*` in `styles.css`
    (palette esistente). Ancora tour `data-tour="hours-stats"` spostata sulla card filtri del Report.

## Dati riusati (nessun sistema parallelo)

`shifts` via `getExpandedShifts`/`shiftDurationHours` (ore lavorate/pianificate, turni, sostituzioni
prese) · `user_contracts` (monte ore previsto) · `cancellation_requests` (richieste per stato) ·
`substitution_proposals` (proposte ricevute per stato, scoping via JOIN su `shifts`) · `user_areas`
(area = "ruolo/reparto", filtro).

## Verifica svolta (locale, scenario demo "ristorante", 32 dipendenti)

- **Service**: `buildOverview`/`buildDetail` con aggregati coerenti (ore, differenza, stato, alert,
  confronto periodo precedente 31→31 giorni, storico 19–20 turni).
- **HTTP**: overview manager 200 (32 dip.) e filtrata per `userId`; detail manager 200; detail
  dipendente su sé 200, su altro **403**; overview come dipendente **403** (`requireManager`); senza
  token **401**; periodo non valido **400**; detail cross-società **404** (isolamento).
- **UI end-to-end** (browser): griglia schede con badge stato/alert, filtro area (Cucina → 10 dip.
  tutti appartenenti all'area), dettaglio con tutte le sezioni (info, analisi ore, richieste,
  statistiche operative, confronto periodi con variazioni colorate, alert + disclaimer, storico),
  vista dipendente self-service (solo propri dati, senza filtri/elenco). Build frontend OK. **Zero
  errori console dagli endpoint `/api/reports/*`.**

## Note

- **Nessuna migrazione DB** (feature sola lettura su tabelle esistenti).
- Da valutare in futuro (non fatto, per scelta di semplicità): esportazione CSV/PDF, assegnazione
  esclusiva della copertura, report di copertura del fabbisogno aggregati. Il Report deve restare
  **raccolta di dati oggettivi**, mai valutazione automatica del personale.

---

# Iniziativa: Multi-tenant SaaS (piani, entitlements, RBAC granulare)

> **Scopo**: trasformare Planivo in un SaaS multi-tenant *commerciale*, aggiungendo sopra
> l'isolamento per `company_id` (già esistente e in produzione) un **layer additivo** di piani
> configurabili, controllo delle funzionalità (entitlements) e permessi granulari per utente. Piano
> operativo approvato dall'utente il 2026-07-10. **Vincoli approvati** (non derogabili senza
> riconferma): DB/schema condiviso + isolamento `company_id` (nessun DB/schema per cliente);
> modifiche **additive** (turni/corsi/sostituzioni/fabbisogno/notifiche/Demo/email invariati); JWT
> invariato (piani/feature/permessi **letti a DB**, mai nel token, così i cambi valgono subito);
> ruoli invariati (superadmin/dirigente/admin/user, personalizzazione via permessi+override, **niente
> ruoli custom in V1**); **niente RLS Postgres** in questa fase; **niente tabella dipendenti
> separata**; **zero limiti hardcoded** — piani/limiti/feature interamente configurabili dal Super
> Admin a runtime; **sicurezza per prima** (test cross-tenant + helper condivisi).

## Roadmap (step rilasciabili singolarmente)

| Step | Obiettivo | Stato |
|---|---|---|
| 0 | Harness isolamento cross-tenant + helper condiviso `tenantScope` | ✅ completato (2026-07-10) |
| 1 | Fondamenta piani: `plans` + `company_subscriptions` + `entitlements` + CRUD Super Admin + endpoint entitlements tenant | ✅ completato (2026-07-10) |
| 2 | Enforcement limiti (maxEmployees/maxManagers/maxSedi) in creazione | ✅ completato (2026-07-10) |
| 3 | Feature gating (`requireFeature`) sui domini premium | ✅ completato (2026-07-10) — backend; sidebar condizionale frontend in Step 6 |
| 4 | Catalogo permessi + `requirePermission`, agganciato a comportamento invariato | ✅ completato (2026-07-10) |
| 5 | Override permessi per utente (`user_permission_overrides`) + endpoint | ✅ completato (2026-07-10) — UI in Step 6 |
| 6 | Frontend: UI Super Admin piani + sezione "Organizzazione" (Dirigente) + sidebar condizionale | ✅ completato (2026-07-11) |
| 7 | Hardening + audit degli eventi piano/permessi (+ pannello registro) | ✅ completato (2026-07-11) |
| 8 | Billing (Stripe) — **predisposizione** testata, spenta di default | ✅ completato (2026-07-11) — attivazione live su conferma |

## Step 0 — Harness isolamento + helper condiviso ✅

### File toccati
- `backend/scripts/testTenantIsolation.js` (nuovo) — harness e2e in-process: crea 2 società di test
  (dirigente+dipendente+sede+area ciascuna) + un super admin temporaneo, verifica cross-tenant,
  cleanup CASCADE finale. **25 asserzioni.**
- `backend/src/utils/tenantScope.js` (nuovo) — `belongsToCompany`/`assertSameCompany`: rete di
  sicurezza uniforme per l'isolamento (404 cross-tenant). Usato dal nuovo codice; NON è stato fatto
  un refactor di massa dei ~20 controller esistenti (churn rischioso), ma resta lo standard per il
  nuovo codice e per la futura migrazione graduale.
- `backend/package.json` — script `npm run test:isolation`.

### Cosa verifica (permanente, estendibile)
Liste scoped (A vede i propri utenti/sedi, non quelli di B); mutazioni cross-tenant su utenti/sedi di
B → **404**; scoping di ruolo del layer piani (dirigente su `/api/plans` → 403; super admin → 200);
entitlements end-to-end (assegnazione piano → effetto immediato via invalidazione cache; il piano di
A non tocca B); semantica unit di `entitlements` (limiti/feature).

## Step 1 — Fondamenta piani ✅

### File toccati
- `backend/src/db/schema.sql` — tabelle `plans` (code/name/limits JSONB/features JSONB/is_active/
  is_public/display_order) e `company_subscriptions` (1:1 con companies, plan_id, status,
  limit_overrides/feature_overrides JSONB, trial/period, external_ref per billing futuro); seed
  idempotente dei piani (**contenitori vuoti**: legacy + starter/professional/enterprise, nessun
  valore commerciale); backfill del piano `legacy` (illimitato) a **tutte** le società esistenti,
  demo comprese. Tutto idempotente (ON CONFLICT / WHERE NOT EXISTS).
- `backend/src/services/entitlements.js` (nuovo) — unica fonte di verità: `getEntitlements(companyId)`
  (merge piano+override, cache TTL 60s + `invalidate`), `limitFor`, `isFeatureEnabled`. **Letto a DB,
  mai nel JWT.** Default sicuro (illimitato) se manca la subscription.
- `backend/src/controllers/planController.js` + `backend/src/routes/plans.js` (nuovi) — Super Admin:
  CRUD piani (no hard-delete, `is_active`; `code` immutabile; validazione JSONB limiti/feature),
  get/set subscription di una società con **usage** (dipendenti/responsabili/sedi). Registrato in
  `app.js`.
- `backend/src/controllers/companySettingsController.js` + `routes/company.js` — `GET
  /api/company/entitlements` (authenticate, tutti i ruoli): entitlements effettivi della propria
  società per adattare la UI (enforcement resta lato backend).
- `backend/src/controllers/companyController.js` — `listCompanies` espone `planCode/planName/
  planStatus` (LEFT JOIN, safe).

### Decisioni specifiche
- **Semantica configurabile senza codice**: limite assente/null = illimitato; feature assente/true =
  abilitata (`false` esplicito = negata). Retrocompatibile: il piano `legacy` (limits `{}`/features
  `{}`) preserva esattamente il comportamento attuale delle società esistenti e demo.
- **Fail-open commerciale** (non di sicurezza): senza subscription → illimitato + tutte le feature.
  Il confine di sicurezza resta `company_id`, non il piano.
- **Seed = solo contenitori**: nessun limite/prezzo hardcoded; Starter/Professional/Enterprise sono
  righe editabili dal Super Admin (vincolo esplicito dell'utente).

### Verifica svolta (locale, DB reale)
- Migrazione idempotente **2×** (no-op alla seconda), seed 4 piani, backfill delle 3 società
  (demo inclusa) al piano legacy.
- `npm run test:isolation`: **25/25** asserzioni (isolamento, scoping ruoli, entitlements
  end-to-end, semantica unit). Dati di test rimossi (0 residui, DB pulito).

### In sospeso (produzione)
- **Migrazione produzione** di `plans` + `company_subscriptions` (+ seed/backfill) da eseguire con
  `npm run migrate` **solo su conferma esplicita** (stesso protocollo delle iniziative precedenti).
  Il backfill assegnerà il piano `legacy` alle società di produzione: **nessun cambiamento di
  comportamento** (illimitato). Nessuna migrazione ancora eseguita.

## Step 2–5 — Sistema configurabile: limiti, feature, permessi ✅

Tranche unica (backend) del "sistema configurabile" richiesto: i MECCANISMI di enforcement, gating e
RBAC, con i VALORI interamente configurabili a runtime dal Super Admin (nessun limite/feature
commerciale nel codice). **Tutto behavior-invariant di default**: finché il Super Admin non configura
limiti/feature/override, il comportamento è identico a prima.

### File toccati
- `backend/src/config/planCatalog.js` (nuovo) — **vocabolario** delle chiavi limite (`maxEmployees`/
  `maxManagers`/`maxSedi`) e feature (`reports`/`substitutionEngine`/`emailAutomation`): solo nomi/
  etichette, **nessun valore**. Letto dalla UI Super Admin (`GET /api/plans/catalog`).
- `backend/src/config/permissions.js` (nuovo) — catalogo permessi + matrice default per ruolo che
  **replica il gate attuale**. V1 contiene solo `cancellations.approve` (realmente agganciato a una
  rotta): niente toggle finti.
- **Step 2** `controllers/userController.js` (`createUser`) + `controllers/sedeController.js`
  (`createSede`) — conteggio vs `entitlements.limitFor`; `403 { code:'PLAN_LIMIT', limit }` al tetto.
  Limite assente/null = illimitato ⇒ no-op.
- **Step 3** `middleware/requireFeature.js` (nuovo) applicato a `routes/reports.js` (`reports`),
  `routes/shifts.js` (candidates/proposals lato manager → `substitutionEngine`), `routes/emailLog.js`
  (`emailAutomation`). `403 { code:'PLAN_FEATURE', feature }`. Default abilitato (retrocompatibile);
  le rotte dipendente `/api/proposals/*` NON gated (per non intrappolare proposte già inviate).
- **Step 4** `middleware/requirePermission.js` (nuovo) — permesso effettivo = default ruolo ±
  override; Dirigente/Super Admin non soggetti a override (pavimento di sicurezza). Agganciato a
  `POST /api/cancellation-requests/:id/approve|reject` (era `requireManager`; il default replica il
  gate, quindi invariato). `403 { code:'PERMISSION_DENIED' }`.
- **Step 5** `schema.sql` (tabella `user_permission_overrides`, idempotente), nuovo
  `controllers/permissionController.js` + rotte `GET/PUT /api/users/:id/permissions`
  (`requireDirigente`); `getCatalog` in `planController.js` + rotta `GET /api/plans/catalog`.

### Decisioni specifiche
- **Zero valori commerciali nel codice** (vincolo esplicito): il codice conosce solo *chiavi* e
  *semantica*; quali limiti/feature per ogni piano è dato configurabile. Enforcement e gating sono
  no-op finché non si configura.
- **Comportamento invariato al rilascio**: la matrice permessi replica i gate esistenti; il default
  dei limiti (assente) è illimitato; le feature sono abilitate salvo diniego esplicito.
- **RBAC minimo ma reale in V1**: enforcement solo su `cancellations.approve` (il caso d'uso
  richiesto). Estendere = una voce nel catalogo + `requirePermission(key)` sulla rotta desiderata,
  con default = il gate attuale.
- **Nessun ruolo custom** (vincolo): personalizzazione via permessi+override, ruoli invariati.

### Verifica svolta (locale, DB reale)
- Migrazione idempotente **2×** (tabella `user_permission_overrides`).
- `npm run test:saas`: **28/28** — catalogo; enforcement limiti (no-op senza limite; 403 PLAN_LIMIT
  al tetto; sblocco immediato all'aumento); feature gating (default 200; 403 PLAN_FEATURE se
  disattivata; riattivazione); RBAC (revoca/ripristino approvazione al responsabile, Dirigente non
  revocabile, isolamento cross-società 404, requireDirigente, validazione chiavi/valori).
- `npm run test:isolation`: **25/25** (nessuna regressione dopo le modifiche alle rotte/controller).
- Dati di test rimossi (DB pulito).

### In sospeso (produzione)
- **Migrazione produzione** di `user_permission_overrides` (con `plans`/`company_subscriptions`), su
  conferma esplicita. Nessun impatto: tabella vuota = comportamento invariato.

## Step 6 — Frontend (UI Super Admin piani + Organizzazione Dirigente + sidebar condizionale) ✅

Interfaccia del layer SaaS: rende usabile dal Super Admin la configurazione dei piani (senza codice)
e dà al Dirigente la vista organizzazione + gestione permessi del team. Nessuna modifica backend.

### File toccati
- `frontend/src/api/client.js` — metodi: `getPlanCatalog`, `listPlans`, `createPlan`, `updatePlan`,
  `getCompanySubscription`, `setCompanySubscription`, `getCompanyEntitlements`, `getUserPermissions`,
  `setUserPermissions`.
- `frontend/src/context/AuthContext.jsx` — carica gli entitlements della società (se `companyId`)
  ed espone `entitlements` + `hasFeature(key)` per la UI condizionale. Best-effort: se non caricati,
  la UI non nasconde nulla.
- **Super Admin** — nuova `pages/superadmin/PianiPage.jsx` (CRUD piani con editor limiti/feature
  **guidato dal catalogo** `GET /api/plans/catalog`, così nuove chiavi compaiono senza toccare il
  frontend); `pages/superadmin/SocietaPage.jsx` estesa con colonna Piano + `SubscriptionModal`
  (assegna piano + override + mostra consumi); voce "Piani" in `SuperAdminLayout` + rotta in `App.jsx`.
- **Dirigente** — nuova `pages/manager/OrganizzazionePage.jsx` (piano + utilizzo vs limiti +
  funzioni incluse + `PermissionsModal` per responsabile con tri-state Predefinito/Consentito/Negato);
  voce "Organizzazione" (solo Dirigente) in `ManagerLayout` + rotta in `App.jsx`.
- **Sidebar condizionale** — `ManagerLayout`/`EmployeeLayout` nascondono la sezione Report se la
  feature `reports` non è inclusa nel piano (`hasFeature`); "Organizzazione" solo per il Dirigente.
- `frontend/src/styles.css` — classi `.modal-subhead`/`.org-features` (palette esistente).

### Verifica svolta (browser, DB reale, dati di test ripristinati)
- **Super Admin**: sezione Piani mostra i 4 piani; editor del piano Starter → impostato
  `maxEmployees=15` + disattivata la feature `reports` → la riga riflette "max dipendenti: 15" e
  "Escluse: Report". Modale società → assegnato Starter a "Società Principale" (consumi 1/0/1 mostrati).
- **Dirigente** (token della stessa società): sezione **Organizzazione** mostra piano Starter,
  utilizzo **1/15 dipendenti "Entro il limite"**, funzioni con **Report escluso**; il **Report
  scompare dalla sidebar** (feature gated) mentre "Organizzazione" compare (solo Dirigente). Matrice
  permessi di un responsabile → impostato "Negato" su `cancellations.approve` → override scritto a DB
  (`granted=false`, `granted_by`=dirigente).
- **Build**: `npm run build` OK (120 moduli). **Console**: nessun errore dai nuovi endpoint (gli unici
  404 osservati, `/api/sedi/:id/areas`, sono pre-esistenti — selezione sede stantia in localStorage).
- **Regressione backend**: `test:isolation` 25/25 + `test:saas` 28/28 dopo le modifiche.
- **Stato ripristinato**: società/piani di test riportati allo stato originale, override e utenti
  temporanei rimossi.

### In sospeso
- **Migrazione produzione** delle tabelle SaaS (con `user_permission_overrides`), su conferma.
- Affinamento UX possibile: nella sezione Organizzazione, gestione self delle feature_overrides da
  parte del Dirigente (oggi in sola lettura, il piano lo governa il Super Admin) — da valutare.

## Step 7 — Hardening + audit degli eventi SaaS ✅

L'audit dei principali eventi SaaS era già presente (plan.create/update, subscription.set,
user.set_permissions, via `auditService`). Completato con:
- **Audit `plan.limit_reached`** (best-effort) in `userController.createUser` e
  `sedeController.createSede` quando una creazione è bloccata da un limite di piano — segnale utile
  per governance e upsell.
- **Pannello "Registro attività"** nella sezione Organizzazione del Dirigente
  (`OrganizzazionePage.jsx`): legge `GET /api/audit-logs` (già `requireDirigente`, scoped società) e
  mostra gli ultimi eventi con etichette leggibili (`ACTION_LABELS`). `api.listAuditLogs` in client.js.
- Verificato nel browser: il registro mostra eventi reali del layer SaaS ("Modifica permessi",
  "Piano aggiornato", accessi) con data/attore/azione tradotti.

## Step 8 — Billing (predisposizione Stripe, spenta di default) ✅

Infrastruttura pagamenti completa e testata, **senza addebiti reali** finché non attivata via env —
stesso pattern del progetto per integrazioni esterne rischiose (email S5, cifratura S6).

### File toccati (backend)
- `db/schema.sql` — `plans.external_price_ref` (idempotente): mappatura piano → prezzo del provider,
  configurabile dal Super Admin. **Nessun prezzo hardcoded**: vive nel provider.
- `config/billing.js` — config da env: `BILLING_ENABLED` (default **false**), `STRIPE_SECRET_KEY`
  (assente ⇒ checkout segnaposto), `STRIPE_WEBHOOK_SECRET`, URL, tolleranza firma. `isLive()`.
- `services/billing/stripeProvider.js` — checkout via `fetch` (zero dipendenze) + `constructEvent`
  (verifica firma HMAC-SHA256 dell'header `Stripe-Signature`, timing-safe, tolleranza timestamp).
- `services/billing/billingService.js` — orchestrazione: `createCheckoutSession` (stub se non live),
  `constructEvent`, `applyEvent` (sync `company_subscriptions` da `checkout.session.completed` /
  `customer.subscription.updated|deleted` + `entitlements.invalidate`).
- `controllers/billingController.js` + `routes/billing.js` — `GET /status`, `GET /plans` (pubblici
  attivi), `POST /checkout` (`requireDirigente`), `POST /webhook` (pubblico, firma). Spento ⇒ mutazioni 404.
- `app.js` — `express.raw` sul solo `/api/billing/webhook` **prima** di `express.json` (corpo grezzo
  per la firma); registrazione route. `planController` gestisce `externalPriceRef`. `.env.example` esteso.

### Frontend
- `PianiPage` — campo "Riferimento prezzo" nell'editor piano. `OrganizzazionePage` — card
  "Abbonamento" **gated su `GET /api/billing/status`** (compare solo se billing attivo): elenca i
  piani pubblici con "Passa a questo piano" → checkout → redirect. `client.js`: `getBillingStatus`,
  `listBillingPlans`, `createBillingCheckout`.

### Sicurezza / decisioni
- **Spento di default** (verificato sul server: `/status` enabled=false, `/checkout` → 404).
- **Nessun prezzo hardcoded**: `plans.external_price_ref` configurabile dal Super Admin.
- **Webhook = firma HMAC** (nessuna sessione): mutazione solo dopo verifica. Senza chiave Stripe il
  checkout è un URL segnaposto (nessuna chiamata esterna).
- **Nessuna nuova dipendenza** (fetch nativo + crypto di Node), coerente col progetto.

### Verifica svolta (locale)
- Migrazione idempotente 2× (`external_price_ref`).
- `npm run test:billing`: **15/15** — status, checkout stub, plans pubblici, webhook firma
  mancante/errata → 400, sync completa (completed→active+external_ref, updated→past_due+period_end,
  deleted→canceled), entitlements invalidati, evento ignoto → 200 handled=false, checkout non-dirigente → 403.
- Regressione: `test:isolation` 25/25 + `test:saas` 28/28 dopo il wiring del raw-body.
- Build frontend OK; card Abbonamento correttamente nascosta con billing spento. Dati di test rimossi.

### In sospeso (attivazione reale, su conferma)
- Impostare le env Stripe in produzione (`BILLING_ENABLED`, chiavi, webhook secret, URL),
  configurare i `external_price_ref` dei piani, registrare l'endpoint webhook su Stripe. Solo allora
  il billing effettua transazioni reali. **Migrazione produzione** di `external_price_ref` con le
  altre tabelle SaaS, su conferma.

---

# Iniziativa: UX/Accessibilità + Design System (audit Impeccable) ✅

> Interventi solo frontend, zero cambi a logica/API/DB. Origine: audit `/impeccable` (11→17/20).
> Dettaglio completo nel changelog di `PROJECT_CONTEXT.md` (voce 2026-07-11).

## Fasi (tutte completate il 2026-07-11)

- **P1 A11y/interazione ✅** — `common/Modal.jsx` accessibile su 18 modali; tastiera sui controlli
  custom (`utils/a11y.js`); notifiche accessibili; skip-link; focus ring globale; reduced-motion.
- **P1 Design token ✅** — 54 variabili `:root` in `styles.css`, ~205 hex → `var()`; base per
  temi per-società. Aspetto invariato (verificato pixel-identico sul login).
- **P2 Touch/responsive ✅** — target ≥44px su `pointer: coarse`; nav mobile scroll-snap.
- **P2 Contrasto ✅** — `--color-text-muted` → #5f6673 (AA ovunque); placeholder espliciti.
- **P3 Polish ✅** — chip fabbisogno tinta+pallino (via striscia 4px); emoji→SVG (`icons.jsx`);
  z-index semantici; `tabular-nums`.
- **Fix ✅** — `FirstAccessSetup`: `<Navigate>` dichiarativo (via warning setState-in-render).
- **Rebrand Planivo ✅** — `Logo.jsx`, login (solo grafica, flow invariato), sidebar, title/favicon/
  splash, loading brandizzato. Tagline rimossa su richiesta; "Prova la demo" intatto.

## Verifica
Build production OK a ogni fase; login end-to-end nel browser (dirigente → dashboard);
focus/contrasti misurati nel browser; nessun nuovo warning console. Audit finale: **17/20**.

## In sospeso (raccomandazioni future, non bloccanti)
Dark mode/temi tenant sui token; `<button>`/`<dialog>` nativi dove possibile; refactor del selettore
globale `button` verso classi; onboarding first-run (attivazione guidata Dirigente).
