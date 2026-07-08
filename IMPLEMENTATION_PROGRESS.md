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

- **Ultima fase completata**: **Fase 4 — Motore di compatibilità + "Trova sostituzione"** (2026-07-08).
- **Fase in corso**: nessuna (Fase 4 chiusa e verificata; documentazione allineata).
- **Prossimo passo consigliato**: **Fase 5 — Proposte mirate** (vedi in fondo).

**Funzionalità già utilizzabili (Fasi 1–4):**
- Contratto per dipendente (tipo + massimali ore/giorni), gestito dal responsabile.
- Disponibilità dichiarate dal dipendente (self-service) e consultabili dal responsabile.
- Notifiche in-app (campanella + contatore non lette + elenco) per dipendenti e responsabili, su
  tutti gli eventi di Sostituzione/cancellazione.
- "Trova sostituzione": classifica 0–100 dei candidati interni con motivazioni (solo suggerimento).

**Modifiche al database (tutte applicate SOLO in locale, mai in produzione):**
- Fase 1: tabella `user_contracts`.
- Fase 2: tabella `user_availability`.
- Fase 3: tabella `notifications` (+ 3 indici, incluso l'unico parziale per `dedupe_key`).
- Fase 4: **nessuna** (motore sola lettura).
- Tutte le migrazioni sono idempotenti in `backend/src/db/schema.sql` (verificate 2× di fila).
  ⚠️ **Migrazione produzione delle 3 tabelle ancora DA ESEGUIRE**, dopo conferma esplicita
  dell'utente (`cd backend && DATABASE_URL=... DATABASE_SSL=true npm run migrate`).

**Test eseguiti e risultato:** tutto verificato **in locale** (il progetto non ha suite di test
automatici, la verifica è manuale via curl + browser, come da `PROJECT_CONTEXT.md`). Ogni fase:
migrazione idempotente 2×, endpoint via curl (happy path + errori 400/401/403/404 + isolamento),
flusso UI end-to-end nel browser. **Esito: tutto superato**; dati di test rimossi al termine di ogni
fase; DB locale attualmente pulito. Build di produzione frontend e `node --check` dei file backend:
OK (verificati a fine sessione).

**Problemi aperti / punti da verificare:**
- **Migrazioni produzione pendenti** per `user_contracts`/`user_availability`/`notifications` (vedi
  sopra) — bloccanti per il deploy delle Fasi 1–4, da fare su conferma dell'utente.
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
| 5 | Proposte mirate ai candidati più compatibili | ⏳ Prossima |
| 6 | Opt-out "Non partecipare" + storico per il motore | ☐ Da fare |
| 7 | Escalation lazy (via polling notifiche, senza cron) | ☐ Da fare |

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

## Prossima fase — Fase 5: Proposte mirate

Il responsabile, dalla classifica di "Trova sostituzione", invia una **proposta** solo ai candidati
selezionati (non a tutti): nuova tabella `substitution_proposals` (`shift_id`, `user_id`,
`proposed_by`, `status`, snapshot `score`/`reasons`), notifica personale a ciascuno (riusa la Fase 3),
pannello dipendente "Le mie proposte" con Accetta/Rifiuta. **Accept riusa la stessa assegnazione
atomica di `claimShift`** (stessi doppi controlli): se un altro ha già preso il turno, la proposta va
in `expired`. Decline → notifica al responsabile + storico per il motore. Come sempre: prima i file e
le modifiche previste, poi implementazione, verifica e aggiornamento di questo file e
`PROJECT_CONTEXT.md`.
