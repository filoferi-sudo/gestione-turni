# PROJECT_CONTEXT.md — Gestione Turni (SaaS multi-azienda, configurabile)

> **Regola per chi (umano o AI) lavora su questo progetto**: leggi questo file per intero prima
> di iniziare qualunque modifica non banale. È la fonte di verità sul contesto del progetto,
> più affidabile della memoria di una singola conversazione. Dopo ogni modifica importante,
> aggiorna la sezione [Changelog](#changelog--aggiornamenti) in fondo (cosa è cambiato, quali
> file, nuove decisioni, cosa ricordare per il futuro). Non eliminare o alterare funzionalità
> esistenti senza aver prima capito perché sono fatte così (vedi
> [Logiche da non modificare senza motivo](#logiche-importanti-da-non-modificare-senza-motivo)).

## Descrizione generale del software

Applicazione web per la gestione di turni di lavoro e corsi in strutture sportive (piscine/
palestre). Nata come app per un'unica struttura, è stata evoluta in una piattaforma **SaaS
multi-azienda e configurabile**: più società possono usare la stessa installazione, ognuna con i
propri utenti e dati completamente isolati dalle altre, e ogni società organizza liberamente la
propria struttura interna — **sedi fisiche** e **aree operative** — senza bisogno di modifiche al
codice.

Gestisce: sedi multiple per società, aree operative configurabili liberamente dal Dirigente
all'interno di ogni sede (ognuna con il proprio calendario, generato automaticamente), calendario
turni dei dipendenti (fissi ricorrenti, singoli, "Sostituzioni" da accettare — turni pubblicati
senza dipendente assegnato, creati manualmente o generati automaticamente da una cancellazione
approvata), calendario corsi (stessa logica fisso/singolo/disponibile, ma con possibilità di corsi
sovrapposti nello stesso orario), **fabbisogno di personale per area operativa** (quante persone
servono in una fascia oraria, confrontato automaticamente con i turni già assegnati), richieste di
cancellazione turno con approvazione del responsabile, statistiche ore lavorate, gestione utenti a
più livelli gerarchici con assegnazione a una o più aree operative, personalizzazione
dell'intervallo orario del calendario per sede, e amministrazione delle società da parte di un
Super Admin di piattaforma.

## Obiettivo del progetto

Fornire uno strumento semplice e specifico (non un ERP generico) per la programmazione di turni
e corsi in strutture come piscine comunali, con un flusso di lavoro chiaro per ruolo: chi decide
gli orari (dirigente/responsabile), chi li esegue (dipendenti, assegnati liberamente alle aree
operative di competenza), e — dall'introduzione del multi-tenant — chi vende/amministra il
software a più clienti (super admin). L'obiettivo di fondo è restare **rivendibile a più aziende
dalla stessa piattaforma**, con ciascuna società capace di **modellare la propria organizzazione
(sedi, aree, orari) senza richiedere interventi sul codice**, mantenendo tutte le funzionalità già
costruite.

## Struttura attuale dell'applicazione

Monorepo con due progetti **indipendenti**, deployati come due progetti Vercel separati dallo
stesso repository GitHub (root directory diversa per ciascuno: `backend/` e `frontend/`). Questo
evita ambiguità di rilevamento framework e permette di scalare/deployare i due lati
separatamente.

```
turni-app/
  backend/
    api/index.js              entry point serverless per Vercel (wrappa src/app.js)
    vercel.json                rewrite esplicito /api/(.*) -> /api (route multi-segmento)
    src/
      app.js                  app Express: CORS, middleware, registrazione route, error handler
      server.js                avvio locale (node src/server.js / npm run dev)
      config/db.js             pool pg, gestisce SSL per provider hosted
      middleware/auth.js       authenticate, requireManager, requireDirigente, requireSuperAdmin
      controllers/             un controller per dominio (vedi sotto), incluso
                                sedeController.js, areaController.js
      routes/                  un file per dominio, wiring middleware + controller, incluso
                                sedi.js (annidate: /api/sedi/:sedeId/areas), areas.js (flat:
                                /api/areas/:id), staffing.js (tutte le rotte requireManager)
      services/                 shiftExpansion.js, courseExpansion.js: espansione ricorrenze
                                (entrambe filtrano anche per area_id); userAreas.js: unica fonte
                                di verità per le aree operative assegnate a un utente (usata sia
                                da authController sia da userController); staffingCoverage.js:
                                calcolo copertura fabbisogno (riusa getExpandedShifts) + guardia
                                duplicati (findConflictingRequirement)
      utils/                    helper puri: date/ore (isWithinDailyWindow ora accetta la
                                finestra oraria della sede), generazione codici, ricorrenza,
                                staffingOccurrences.js (espansione occorrenze fabbisogno fisso/
                                singolo, applicazione eccezioni)
      db/
        schema.sql              SCHEMA + MIGRAZIONI IDEMPOTENTI, unica fonte di verità del DB
        seedDirigente.js        bootstrap locale/dev: crea società demo + dirigente
        seedSuperAdmin.js       crea/aggiorna l'account super admin (company_id NULL)
        reset.js                wipe dati applicativi — SOLO uso locale/dev (vedi sotto)
  frontend/
    vercel.json                rewrite SPA per il routing lato client
    src/
      main.jsx, App.jsx        routing (react-router-dom): rotte annidate per ruolo sotto un
                                layout con sidebar (vedi sezione "Struttura dell'interfaccia"),
                                mappa ruolo -> home (/dirigente, /admin, /dashboard, /superadmin)
      api/client.js            unico client HTTP, tutte le chiamate API passano da qui
      context/AuthContext.jsx   token + user (con `areas[]`) in localStorage
      context/ManagerWorkspaceContext.jsx   stato condiviso delle sezioni manager (sede
                                selezionata via useSedeSelection + aree della sede + timeWindow),
                                montato da ManagerLayout così Calendario/Sostituzioni/Fabbisogno/
                                Impostazioni condividono la stessa selezione
      hooks/useSedeSelection.js  stato "sede selezionata" per le dashboard manager (elenco sedi
                                della società + sede attiva, persistita in localStorage)
      hooks/usePolling.js       polling leggero riutilizzabile (pausa se tab non visibile, refetch
                                immediato al ritorno di focus) per aggiornamenti quasi in tempo
                                reale sui dati condivisi tra utenti (vedi sezione dedicata)
      components/
        layout/                 AppLayout.jsx (guscio comune: sidebar di navigazione sempre
                                visibile + topbar con campanella/logout + Outlet), ManagerLayout.jsx
                                (le 9 sezioni manager + selettore sede nella sidebar, monta
                                ManagerWorkspaceProvider), EmployeeLayout.jsx (7 sezioni),
                                SuperAdminLayout.jsx (2 sezioni, senza campanella)
        calendar/               CalendarPage (turni, richiede areaId+timeWindow; per mode='admin'
                                carica anche la copertura fabbisogno e i 3 modali fabbisogno, vedi
                                sezione dedicata), CalendarGrid (turni sovrapposti affiancati via
                                utils/courseLayout.layoutCourses, riusato invariato; riga
                                `.calendar-staffing-row` opzionale con gli indicatori di copertura
                                per giorno, resa da StaffingChip), StaffingChip.jsx (indicatore di
                                copertura di una singola occorrenza, compatto/espandibile),
                                ShiftBlock (lane/laneCount come CourseBlock), ShiftFormModal (senza
                                più "ruolo richiesto"), TabbedCalendar (contenitore generico
                                multi-vista, usato ora per costruire dinamicamente una tab per area)
        courses/                CoursesCalendar (richiede areaId+timeWindow), CoursesGrid,
                                CourseBlock, CourseFormModal, CoursesAvailablePanel
        shifts/SubstitutionsPanel.jsx   "Sostituzioni" (ex "turni volanti"), scoped per area
        staffing/               StaffingWeeklySlotsModal.jsx (lista delle fasce fisse indipendenti
                                di un'area, entry point di "Gestisci fabbisogno settimanale"),
                                StaffingScheduleModal.jsx (form di UNA fascia fissa, creazione o
                                modifica, apre da StaffingWeeklySlotsModal), StaffingSingleModal.jsx
                                (fabbisogno singolo), StaffingOccurrenceModal.jsx (le 4 modalità di
                                modifica occorrenza) — questi ultimi due riusati invariati, aperti
                                direttamente da CalendarPage/CalendarGrid (vedi sotto);
                                StaffingPanel.jsx (il vecchio pannello riepilogativo separato dal
                                calendario) è stato rimosso
        cancellation/           CancellationRequestsPanel (manager), MyCancellationRequests (self)
        management/UserManagementSection.jsx   colonna "Aree" + azione "Modifica aree"
        areas/AreasManagement.jsx   CRUD aree operative di una sede (solo Dirigente)
        profile/MyProfile.jsx
        stats/HoursStats.jsx     riusato sia per vista manager (tutti) sia self-service (proprie ore)
      pages/
        Login.jsx, FirstAccessSetup.jsx
        manager/                 sezioni Dirigente+Responsabile (stesse pagine per entrambi, rotte
                                /dirigente/* e /admin/*; le differenze di permesso vivono nelle
                                pagine): ManagerDashboard (panoramica riassuntiva), CalendarioPage
                                (tab per area della sede attiva), TurniPage (richieste di
                                cancellazione), PersonalePage (gestione account), SostituzioniPage
                                (pannelli manage), FabbisognoPage (regole fabbisogno per area),
                                ImpostazioniPage (account; per il Dirigente anche sedi/aree/
                                escalation)
        employee/                sezioni Dipendente (/dashboard/*): EmployeeHome (panoramica),
                                EmployeeCalendario (tab dalle aree assegnate, user.areas),
                                EmployeeTurni (mie richieste), EmployeeSostituzioni (proposte +
                                disponibili), EmployeeImpostazioni (profilo/disponibilità/opt-out)
        sections/                pagine condivise tra ruoli: ComunicazioniPage (elenco notifiche
                                completo), ReportPage (istrada al Report manager o self-service
                                secondo il ruolo — vedi sezione "Sezione Report")
        reports/                 componenti della sezione Report (vedi sezione dedicata):
                                ManagerReport (filtri + griglia schede + dettaglio inline),
                                EmployeeReport (self-service, solo propri dati), EmployeeReportCard,
                                EmployeeReportDetail, ReportFilters, reportPeriods.js, reportFormat.jsx
        superadmin/              SuperAdminHome (statistiche piattaforma), SocietaPage (anagrafica
                                società + primo dirigente)
        dirigente/SediManagement.jsx   CRUD sedi (solo Dirigente), ora dentro ImpostazioniPage
        CreateUser.jsx           creazione responsabile/dipendente con multi-select aree operative
                                (raggruppate per sede); pagina figlia di Personale
                                (/…/personale/nuovo)
      utils/                    dates.js, timeWindow.js (createTimeWindow(start,end): fabbrica
                                della finestra oraria del calendario, non più costanti fisse),
                                courseLayout.js (algoritmo "lane" per corsi sovrapposti)
      styles.css                unico foglio di stile, classi riusate ovunque (.card, .table,
                                .segmented, .modal-*, .badge, .checkbox-grid, .area-picker-group)
```

## Tecnologie utilizzate

- **Backend**: Node.js (>=18) + Express 4, PostgreSQL via `pg` (pool diretto, niente ORM),
  autenticazione JWT (`jsonwebtoken`), password con `bcrypt`, `cors`, `dotenv`.
- **Frontend**: React 18 + Vite 5, `react-router-dom` 6. Nessuna libreria UI/CSS esterna (CSS
  scritto a mano in `styles.css`), nessuna libreria calendario/drag&drop (drag&drop dei corsi
  implementato con le API HTML5 native).
- **Database**: PostgreSQL (locale in sviluppo, hosted su Neon in produzione, richiede
  `DATABASE_SSL=true`).
- **Hosting**: Vercel, due progetti separati (backend con funzioni serverless via `backend/api/`,
  frontend come sito statico Vite).
- **Niente TypeScript, niente test automatici**: il progetto è JS puro; la verifica avviene
  tramite test manuali via curl/browser ad ogni modifica (non ci sono suite di test da lanciare).

## Configurazione del database

**Unica fonte di verità dello schema**: `backend/src/db/schema.sql`. Non esistono file di
migrazione separati numerati: il file contiene sia le `CREATE TABLE IF NOT EXISTS` (per
un'installazione pulita) sia, in coda, una sezione di **migrazioni idempotenti** (`ALTER TABLE
... ADD COLUMN IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT`) che porta un
database già esistente allo stato corrente. Si applica con:

```bash
cd backend
npm run migrate     # in locale usa .env; per produzione: DATABASE_URL=... DATABASE_SSL=true npm run migrate
```

**Va sempre lanciata così ad ogni modifica di schema**, mai riscritta come nuova
`CREATE TABLE` pulita: il file deve restare eseguibile ripetutamente e senza perdita dati sia su
un DB vuoto sia su quello di produzione già popolato. Ordine importante: quando si aggiunge una
colonna `NOT NULL`/con `CHECK`/con indice a una tabella già esistente, l'ordine corretto nel file
è **ADD COLUMN (nullable) → backfill dati → SET NOT NULL / ADD CONSTRAINT → CREATE INDEX**,
altrimenti fallisce su un DB con dati preesistenti (già successo più volte durante lo sviluppo,
vedi changelog).

**Tabelle principali**:
- `companies` — società/piscine: `name`, `email`, `phone`, `address`, `is_active`, `created_by`,
  `created_at`, `substitution_escalation_hours` (Fase 7: ore prima dell'escalation di una Sostituzione
  ancora scoperta, configurabile dal **Dirigente**; NULL/≤0 = disattivata). `created_by` referenzia
  `users(id)` con FK aggiunta *dopo* la creazione di `users` nel file, per evitare dipendenza
  circolare tra le due `CREATE TABLE`.
- `sedi` — sedi fisiche di una società: `company_id`, `name`, `is_active`, `display_order`,
  `calendar_start_time`/`calendar_end_time` (default `07:30`/`23:00`, personalizzabili dal
  Dirigente). Una società creata da Super Admin riceve automaticamente una "Sede Principale"
  vuota (nessuna area predefinita).
- `operational_areas` — aree operative, create liberamente dal Dirigente **dentro** una sede
  (Bagnini, Reception, Bar, Manutenzione, Istruttori, ...): `sede_id`, `company_id`, `name`,
  `calendar_mode` (`shifts` | `courses`, sceglie quale motore di calendario usa l'area),
  `display_order`, `is_active`. Nessuna area è predefinita dal codice.
- `user_areas` — tabella ponte `(user_id, area_id)`: un dipendente può appartenere a più aree,
  anche di sedi diverse. Sostituisce il vecchio `users.category` come fonte di verità.
- `users` — `role` (`admin` | `user` | `dirigente` | `superadmin`). `category` (legacy:
  `bagnino`/`istruttore`) **resta nello schema per compatibilità storica ma non è più la fonte di
  verità**: sostituita da `user_areas`. `company_id` (NULL solo per `superadmin`, obbligatorio per
  tutti gli altri ruoli — CHECK `users_company_check`).
- `shifts` — turni: `type` (`fixed` ricorrente | `mobile` singolo | `volante` = "Sostituzione" in
  UI, disponibile), `user_id` (NULL per `volante` non ancora accettato), `company_id` **diretto**
  (non dedotto da `user_id`, vedi sotto), `area_id`/`sede_id` **obbligatori** (ogni turno
  appartiene sempre a un'area operativa, valorizzati fin dalla creazione), `recurrence_rule` (solo
  per `fixed`), `date` (per `mobile`/`volante`). `status` (`active` | `cancelled_approved`),
  `required_category` (**legacy, non più scritta per le nuove Sostituzioni**: superata da
  `area_id`, vedi sezione dedicata), `origin_shift_id` (turno originale sostituito, NULL per
  creazione manuale), `requirement_id` (NULL, valorizzato solo per le Sostituzioni generate da
  `POST /api/staffing/requirements/:id/generate-gap` per coprire un buco di fabbisogno — vedi
  sezione dedicata "Fabbisogno di personale").
- `staffing_requirements` — regole di fabbisogno di personale per area operativa (solo aree
  `calendar_mode='shifts'`): `req_type` (`fixed` ricorrente per giorno della settimana | `single`
  una sola data), `weekday`/`date` a seconda del tipo, `start_time`/`end_time`, `required_count`,
  `effective_from`/`effective_until` (solo `fixed`: finestra di validità della regola, usata per
  gli split "questa occorrenza e le future").
- `staffing_requirement_exceptions` — eccezione puntuale a una singola occorrenza di una regola
  `fixed`: `is_deleted` (occorrenza esclusa) oppure `override_count` (persone richieste diverse
  solo quel giorno), mai entrambi. Stesso principio di `shift_exceptions`, esteso con un override
  numerico.
- `shift_exceptions` — singole occorrenze escluse da un turno `fixed` ricorrente (quando una
  richiesta di cancellazione per quella data viene approvata). Non ha `company_id`: si accede
  sempre tramite `shift_id` (mai NULL), la società si eredita per JOIN.
- `cancellation_requests` — richieste di cancellazione turno, sempre da approvare (nessuna
  cancellazione automatica). `company_id` diretto (il turno collegato può essere già stato
  eliminato in seguito ad approvazione).
- `courses` — corsi, stessa logica di `shifts` ma con `instructor_id` al posto di `user_id` e
  **nessun vincolo di esclusività sull'orario** (più corsi possono sovrapporsi, istruttori/spazi
  diversi). `company_id` diretto, `area_id`/`sede_id` obbligatori (area con `calendar_mode='courses'`).
- `user_contracts` — configurazione contrattuale del dipendente, **1:1 con `users`** (`UNIQUE
  user_id`): `contract_type` (testo libero, i preset sono solo suggerimenti UI), massimali tutti
  *nullable* (`max_weekly_hours`, `max_monthly_hours`, `min_weekly_hours`, `max_daily_hours`,
  `max_consecutive_days`, `weekly_rest_days`; nullable = "nessun vincolo su questo parametro"),
  `note` (vincoli aziendali liberi), `custom_config` JSONB (vincoli specifici/futuri senza nuove
  colonne), audit (`created_by`/`updated_by`/`created_at`/`updated_at`). **Nessun `company_id`
  duplicato**: qui `user_id` è sempre valorizzato (a differenza di `shifts`/`courses`), la società
  si ricava per JOIN e l'isolamento è verificato nel controller. Prima tabella del **sistema
  avanzato di sostituzioni** (vedi sezione dedicata); il futuro motore di compatibilità la leggerà
  per *ordinare* i candidati, mai per escluderli in automatico.
- `user_availability` — disponibilità dichiarate dal dipendente, ricorrenti per giorno della
  settimana (**righe multiple** per utente, anche più fasce lo stesso giorno): `user_id`, `weekday`
  (MON..SUN, stessa convenzione di `staffing_requirements`/`recurrence.js`), `start_time`/`end_time`
  (`CHECK end_time > start_time`). **Nessun `company_id`** (come `user_contracts`: `user_id` sempre
  valorizzato, isolamento nel controller). **Assenza di righe = disponibilità "ignota"**, non
  incompatibile: il futuro motore di compatibilità (Fase 4) la userà per *ordinare*, mai per
  escludere. Il dipendente modifica solo le proprie righe; il responsabile le legge in sola lettura.
- `notifications` — notifiche in-app per utente: `company_id` (**diretto**, tabella trasversale ad
  alto volume, valorizzato dal contesto dell'evento), `user_id` (**destinatario**), `type`
  (categoria, es. `substitution_available`/`substitution_claimed`/`cancellation_requested`...),
  `message`, `payload` JSONB (riferimenti per il collegamento diretto: `shiftId`/`areaId`/`sedeId`/
  `date`/...), `is_read`, `dedupe_key` (nullable, per la deduplica idempotente dell'escalation lazy
  della Fase 7 — indice unico parziale su `(user_id, dedupe_key)`). Generate **in coda** ai flussi
  esistenti in modo best-effort (vedi sezione "Sistema avanzato di sostituzioni" → Fase 3).
- `email_log` — storico degli invii email (Fase E1, iniziativa Email Automation): pendant "email"
  di `notifications`, a **canale separato** (la stessa `notify*` alimenta entrambi). `company_id`/
  `user_id` con `ON DELETE SET NULL` (log storico, come `audit_logs`); `to_email` in chiaro (record
  autoconsistente), `event_type`, `template`, `subject`, `status` (`pending`|`sent`|`failed`|
  `suppressed`), `error` (motivo di failed/suppressed), `provider`/`provider_message_id`, `payload`
  JSONB, `sent_at`. `suppressed` = invio volutamente non tentato (ambiente demo o destinatario non
  verificato). Scritto sempre best-effort da `services/notificationChannels/emailChannel.js`.
- `substitution_proposals` — proposte mirate di sostituzione (Fase 5): il responsabile invia una
  Sostituzione scoperta solo ai candidati che sceglie. `shift_id` (FK→shifts `ON DELETE CASCADE`, la
  Sostituzione `volante` proposta), `user_id` (dipendente destinatario), `proposed_by` (chi l'ha
  inviata, `ON DELETE SET NULL`), `status` (`pending`|`accepted`|`declined`|`expired`), `score` +
  `reasons` JSONB (**snapshot** della classifica di compatibilità al momento dell'invio),
  `responded_at`, `created_at`. `UNIQUE (shift_id, user_id)` (una proposta per coppia; ri-proporre
  dopo un rifiuto è un UPSERT che la riporta a `pending`). **Nessun `company_id`**: `shift_id`/
  `user_id` sempre valorizzati, società ricavata per JOIN (autoritativo `shift.company_id`),
  isolamento nel controller — stesso principio di `user_contracts`/`user_availability`.
- `substitution_optouts` — periodi di opt-out "Non partecipare" dichiarati dal dipendente (Fase 6):
  `user_id`, `start_date`, `end_date` (**nullable** = a tempo indeterminato), `note`, `created_at`
  (`CHECK end_date IS NULL OR end_date >= start_date`). Un opt-out è attivo su una data D se
  `start_date <= D AND (end_date IS NULL OR end_date >= D)`. Niente `company_id` (come
  `user_availability`). Dichiarati dal dipendente stesso, letti anche dal responsabile in sola lettura.
  Effetti (additivi): il motore RETROCEDE il candidato (motivo rosso, resta visibile), il responsabile
  non può inviargli una proposta nel periodo, niente notifica broadcast — ma `listAvailableShifts`
  resta invariato (può ancora reclamare da sé).

**Perché `company_id` è diretto su `shifts`/`courses`/`cancellation_requests` e non dedotto da
`user_id`/`instructor_id`**: un turno o corso `volante`/disponibile nasce **senza** utente
assegnato (`user_id`/`instructor_id` NULL). Se la società si potesse dedurre solo tramite
l'utente assegnato, un turno/corso non ancora accettato non avrebbe modo di sapere a quale
società appartiene. Questo è un vincolo strutturale, non una scelta arbitraria — non
"semplificare" rimuovendo la colonna e facendo un JOIN. **Stesso principio vale per `area_id`/
`sede_id`** su `shifts`/`courses`: diretti e non dedotti, per la stessa ragione (una Sostituzione
non ancora accettata non ha alcun dipendente da cui risalire all'area).

## Ruoli presenti nel sistema

Gerarchia: **Super Admin → Società → Sede → Area operativa → Dirigente/Responsabili/Dipendenti**.

- **Super Admin** (`role='superadmin'`, `company_id` sempre NULL): non appartiene a nessuna
  società, le amministra tutte. Può creare/modificare/disattivare società, creare il primo
  dirigente di ciascuna, vedere statistiche aggregate di piattaforma. **Non entra mai** nei dati
  operativi (sedi/aree/turni/corsi/dipendenti specifici) di una società: resta un ruolo di
  supervisione a livello di anagrafica società, non di gestione quotidiana (decisione esplicita
  dell'utente, non cambiare senza riconferma). Pannello dedicato: `/superadmin`.
- **Dirigente** (`role='dirigente'`): uno o più per società. Gestisce **sedi e aree operative
  della propria società** (unico ruolo che può crearle/modificarle/eliminarle — i Responsabili le
  selezionano ma non le gestiscono), responsabili e dipendenti, calendario turni/corsi (dentro le
  aree già configurate), richieste di cancellazione, statistiche. Creato **solo** dal pannello
  Super Admin (`POST /api/companies/:id/dirigente`), mai da `CreateUser.jsx`/`POST /api/users`.
- **Responsabile** (`role='admin'`, in UI "Responsabile"): creato dal dirigente, stesse
  funzionalità gestionali del dirigente su calendario/dipendenti **dentro le sedi/aree già
  configurate dal Dirigente**, ma non può creare altri responsabili, gestire l'account dirigente,
  né creare/modificare/eliminare sedi o aree operative.
- **Dipendente** (`role='user'`): può appartenere a **una o più aree operative** (tabella
  `user_areas`), assegnate alla creazione o modificabili in qualsiasi momento
  (`PUT /api/users/:id/areas`). La dashboard (`EmployeeDashboard.jsx`, generica) costruisce
  dinamicamente una tab di calendario per ogni area assegnata (motore turni o corsi secondo
  `calendar_mode` dell'area), più i pannelli "Sostituzioni disponibili"/"Corsi disponibili" per
  ciascuna area di tipo turni/corsi. **Nessuna categoria fissa nel codice**: il Dirigente crea le
  aree che vuole (Bagnini, Reception, Bar, Manutenzione, Istruttori...) e i dipendenti vi si
  assegnano, senza toccare codice.
  - Account dipendente creati **prima** dell'introduzione delle aree operative (con la vecchia
    `category` valorizzata) sono stati migrati automaticamente a `user_areas` (vedi sezione
    "Gerarchia Sedi → Aree operative" più sotto): nessuna regressione per dati storici.

## Gestione delle società/piscine

Ogni società (`companies`) ha sedi/aree/dirigente/responsabili/dipendenti/turni/corsi/richieste
completamente isolati dalle altre tramite `company_id`. Punti chiave:

- Il **login non chiede la società**: username ed email sono **univoci a livello globale di
  piattaforma** (vincolo `UNIQUE` su `users.username`/`users.email`, non composito con
  `company_id`) — scelta deliberata, necessaria perché il login è per solo username, senza
  selettore azienda. Non renderlo unico-per-società senza ripensare anche il flusso di login.
- Il JWT di sessione include `companyId` (oltre a `id`, `username`, `role`). Ogni controller
  esistente filtra le proprie query con `req.user.companyId`, e le operazioni di
  update/delete verificano esplicitamente che la riga appartenga alla stessa società prima di
  agire (altrimenti 404, per non rivelare l'esistenza di risorse di altre società). Lo stesso
  principio si applica ora a `sedeId`/`areaId`: ogni endpoint di sedi/aree/turni/corsi verifica
  che l'entità richiesta appartenga alla società di chi opera.
- **Disattivare una società** (`is_active=false`) blocca solo i **nuovi login** (controllo in
  `authController.login()`). Le sessioni già aperte (JWT, max 8h) restano valide fino a scadenza
  naturale — **scelta deliberata**, coerente con il fatto che in nessun altro punto del sistema
  si fa un controllo a DB ad ogni richiesta autenticata (si fida sempre del JWT). Non aggiungere
  un controllo DB per-request "per sicurezza" senza discuterne: sarebbe un cambio di modello
  architetturale, non un bugfix.
- **Una nuova società creata dal Super Admin riceve automaticamente una "Sede Principale" vuota**
  (nessuna area predefinita): il Dirigente parte da zero e costruisce la propria struttura. Le
  società preesistenti alla migrazione hanno invece ricevuto aree "Bagnino"/"Istruttore" per
  compatibilità con i dati storici (vedi sezione dedicata).

## Layer SaaS: piani commerciali ed entitlements (multi-tenant configurabile)

Livello **additivo** sopra l'isolamento multi-tenant già esistente (`company_id`), per vendere
Planivo a tier differenziati. **Non rifà nulla**: l'isolamento dati resta quello collaudato; questo
layer aggiunge solo "cosa può fare / fino a che limite" ogni società. Iniziativa "Multi-tenant SaaS"
in `IMPLEMENTATION_PROGRESS.md` (roadmap a step 0–8). **Stato: Step 0–1 completati** (fondamenta +
sicurezza); enforcement limiti, feature gating e RBAC granulare sono i passi successivi.

### Modello dati (nuove tabelle, tutte additive)
- `plans` — catalogo piani: `code` (identificatore stabile, es. `starter`/`professional`/`enterprise`/
  `legacy`), `name`, `is_active` (assegnabile o no), `is_public` (in listino o no), `display_order`,
  e due mappe JSONB **`limits`** e **`features`**. **Nessun valore commerciale è nel codice**: limiti
  e feature sono dati, modificabili dal Super Admin a runtime. Il seed crea solo *contenitori vuoti*.
- `company_subscriptions` — abbonamento 1:1 di una società (`UNIQUE company_id`): `plan_id`, `status`
  (`trialing`/`active`/`past_due`/`canceled`), `limit_overrides`/`feature_overrides` JSONB (contratti
  su misura **senza creare piani dedicati**), `trial_ends_at`/`current_period_end`/`external_ref`
  (predisposizione billing futuro, non ancora usati).

### Semantica entitlements (`services/entitlements.js`, unica fonte di verità)
`getEntitlements(companyId)` = merge del piano con gli override della subscription. Regole (valgono
sia in codice sia come vincolo sui dati JSONB):
- **Limite**: numero ≥ 0 = tetto; chiave **assente o null = illimitato**. Un limite è applicato solo
  se valorizzato.
- **Feature**: `false` esplicito = negata; **assente o `true` = abilitata** (default permissivo,
  retrocompatibile — un cliente non perde funzioni e una feature nuova non si spegne da sola sui piani
  che non la menzionano).
- **Default sicuro**: una società **senza** subscription ottiene illimitato + tutte le feature (è il
  comportamento pre-SaaS). Il gating dei piani è un confine **commerciale**, non di sicurezza:
  l'isolamento dati resta `company_id`.

### Backfill retrocompatibile
La migrazione assegna il piano `legacy` (`limits`/`features` vuoti = illimitato) a **tutte** le
società esistenti, **demo comprese** (devono mostrare tutte le funzioni nei tour). Risultato: **zero
cambi di comportamento** all'attivazione del layer. Le società create in futuro dal Super Admin
riceveranno un piano esplicito.

### Endpoint
- Super Admin (`/api/plans`, `requireSuperAdmin`): CRUD piani (no hard-delete, si usa `is_active`;
  `code` immutabile), `GET/PUT /api/plans/subscriptions/:companyId` (assegna piano + override, con
  **usage** dipendenti/responsabili/sedi). Coerente con "Super Admin = piattaforma/commerciale".
- Tenant (`GET /api/company/entitlements`, `authenticate`, tutti i ruoli): entitlements effettivi
  della propria società, per adattare la UI. **L'enforcement resta lato backend** (frontend "dumb").

### Enforcement, feature gating e RBAC granulare (Step 2–5)
Sopra le fondamenta, i **meccanismi** che rendono i piani operativi — con i **valori sempre
configurabili** (nessun limite/feature commerciale nel codice) e **comportamento invariato** finché
il Super Admin non configura nulla:
- **Limiti** (`config/planCatalog.js` = vocabolario chiavi): `userController.createUser` e
  `sedeController.createSede` contano le entità e rispondono `403 { code:'PLAN_LIMIT' }` al tetto
  (`entitlements.limitFor`). Chiave `maxEmployees`/`maxManagers`/`maxSedi` assente = illimitato ⇒
  no-op di default.
- **Feature gating** (`middleware/requireFeature.js`): gate per dominio di rotte —
  `reports` (sezione Report), `substitutionEngine` (classifica candidati + proposte mirate, **solo
  entry point lato manager**; le rotte dipendente `/api/proposals/*` restano sempre attive),
  `emailAutomation` (storico email). `403 { code:'PLAN_FEATURE' }`. Default abilitato.
- **RBAC con override** (`config/permissions.js` + `middleware/requirePermission.js` +
  `user_permission_overrides`): permesso effettivo = default del ruolo ± override per-utente, gestiti
  dal **Dirigente** (`GET/PUT /api/users/:id/permissions`). Il Dirigente/Super Admin non sono soggetti
  a override (pavimento di sicurezza). In V1 è agganciato a `cancellations.approve` (approva/rifiuta
  cancellazioni): la matrice default replica il gate storico (admin+dirigente) → invariato, ma il
  Dirigente può revocare l'approvazione a un singolo responsabile ("Manager A approva, Manager B solo
  lettura"). Estendere = una voce nel catalogo + `requirePermission(key)` sulla rotta.
- **Catalogo per la UI**: `GET /api/plans/catalog` (Super Admin) espone le chiavi limite/feature
  configurabili senza replicarle nel frontend.

### Audit degli eventi SaaS (Step 7)
Gli eventi del layer (creazione/modifica piano, assegnazione abbonamento, modifica permessi) sono
tracciati con `auditService` (best-effort, come il resto dell'audit trail S3). In più,
`plan.limit_reached` è registrato quando una creazione viene bloccata da un limite (governance +
upsell). La sezione **Organizzazione** del Dirigente include un pannello "Registro attività" che
legge `GET /api/audit-logs` (già `requireDirigente`, scoped società) con etichette leggibili.

### Billing (Step 8) — predisposizione pagamenti, spenta di default
Infrastruttura Stripe **completa e testata ma NON attiva** (`BILLING_ENABLED=false` di default),
stesso pattern del progetto per integrazioni esterne rischiose (email S5, cifratura S6). Punti chiave:
- **Nessun prezzo hardcoded**: il prezzo vive nel provider e si mappa al piano tramite
  `plans.external_price_ref` (configurabile dal Super Admin), coerente col vincolo "zero valori
  commerciali nel codice".
- **Provider astratto** (`services/billing/`): `stripeProvider.js` (checkout via `fetch`, verifica
  firma webhook HMAC-SHA256) dietro `billingService.js` (sync `company_subscriptions` +
  invalidazione entitlements). Nessuna dipendenza nuova.
- **Endpoint** (`/api/billing`): `status`/`plans` (authenticate), `checkout` (`requireDirigente`),
  `webhook` (pubblico, **sicurezza = firma**, corpo grezzo via `express.raw` prima di `express.json`).
  Con billing spento le mutazioni rispondono 404; senza chiave Stripe il checkout ritorna un URL
  segnaposto (nessuna chiamata esterna, nessun addebito).
- **Attivazione reale** solo impostando le env in produzione + configurando i `external_price_ref` +
  registrando il webhook su Stripe (su conferma esplicita).

### Interfaccia (frontend)
- **Super Admin → "Piani"** (`pages/superadmin/PianiPage.jsx`): CRUD dei piani con editor di limiti e
  funzioni **guidato dal catalogo** (`GET /api/plans/catalog`) — aggiungere una chiave lato backend la
  fa comparire nell'editor senza toccare il frontend. **Super Admin → "Società"** estesa con colonna
  Piano e modale di assegnazione (piano + override per-cliente + consumi correnti).
- **Dirigente → "Organizzazione"** (`pages/manager/OrganizzazionePage.jsx`): piano attivo, utilizzo vs
  limiti (dipendenti/responsabili/sedi), funzioni incluse, e **matrice permessi per responsabile**
  (tri-state Predefinito/Consentito/Negato → override). Il piano è in sola lettura (lo governa il
  Super Admin); i permessi del team sono di competenza del Dirigente. Voce visibile **solo** al Dirigente.
- **Sidebar condizionale**: `ManagerLayout`/`EmployeeLayout` nascondono la sezione Report se la feature
  `reports` non è nel piano (`AuthContext.hasFeature`). L'enforcement resta lato backend: la UI è solo
  un adattamento (frontend "dumb"). Gli entitlements sono caricati una volta in `AuthContext`.

### Sicurezza: rete di isolamento automatica
Due harness di regressione (le prime suite automatiche del progetto), da estendere a ogni nuovo
endpoint scoped:
- `backend/scripts/testTenantIsolation.js` (`npm run test:isolation`, **25 asserzioni**): due società
  di test, verifica sistematica che una non veda/tocchi i dati dell'altra (404 cross-tenant) + scoping
  del layer piani + entitlements.
- `backend/scripts/testSaasLayer.js` (`npm run test:saas`, **28 asserzioni**): enforcement limiti,
  feature gating, RBAC con override end-to-end.

Helper condiviso `utils/tenantScope.js` (`assertSameCompany`) come standard uniforme per le verifiche
di appartenenza nel nuovo codice.

## Gerarchia Sedi → Aree operative (configurabilità)

Introdotta per rendere il gestionale **completamente configurabile dal Dirigente senza modifiche
al codice**: prima esisteva un'unica categoria fissa di dipendente (`bagnino`/`istruttore`,
hardcoded), un'unica dashboard per categoria, due domini paralleli hardcoded (turni/corsi), un
solo calendario per società con orari fissi (07:30-23:00). Ora:

### Modello

- **Sede** (`sedi`): una società può avere più sedi fisiche. Ogni sede ha un proprio intervallo
  orario per il calendario (`calendar_start_time`/`calendar_end_time`, es. 05:00→00:00),
  configurabile liberamente dal Dirigente (`SediManagement.jsx`). Il "00:00" come orario di fine
  è trattato come mezzanotte/24:00 (fine giornata), non come inizio, sia lato validazione backend
  (`isWithinDailyWindow`) sia lato calcolo griglia frontend (`createTimeWindow`).
- **Area operativa** (`operational_areas`): dentro una sede, il Dirigente crea liberamente le
  aree che rispecchiano la propria organizzazione (Bagnini, Reception, Bar, Manutenzione,
  Istruttori, ...). Ogni area sceglie alla creazione un **motore di calendario**
  (`calendar_mode`): `'shifts'` (turni fisso/singolo/Sostituzione — il caso generale, adatto alla
  maggior parte delle aree) oppure `'courses'` (corsi nominati con sovrapposizioni affiancate —
  per aree stile "Istruttori"). **Nessuna fusione dei due motori**: si è scelto di riusare i due
  motori esistenti (già collaudati, con tutta la logica Sostituzioni/cancellazioni costruita sui
  turni) invece di crearne un terzo generico, per minimizzare il rischio. Il tipo di calendario si
  può cambiare solo se l'area non ha ancora turni/corsi (altrimenti i dati esistenti diventerebbero
  incoerenti con la nuova modalità).
- **Assegnazione dipendente-area** (`user_areas`): un dipendente può appartenere a più aree, anche
  di sedi diverse. Sostituisce interamente `users.category`.
- **Ogni turno/corso appartiene sempre a un'area** (`shifts.area_id`/`courses.area_id`,
  obbligatori, mai NULL): non esistono più calendari "generali" di società, solo calendari di
  area. `sede_id` si eredita dall'area (denormalizzato per comodità di query, sempre coerente
  con `area.sede_id` per costruzione applicativa).

### Intuizione chiave: l'area sostituisce il "ruolo richiesto"

Prima delle aree, una Sostituzione portava un `required_category` esplicito perché non c'era
altro modo di sapere a chi fosse destinata (non ha ancora un dipendente assegnato). Da quando
**ogni turno — Sostituzioni comprese — appartiene sempre a un'area operativa**, l'area **è già**
il "ruolo richiesto": una Sostituzione creata nel calendario dell'area "Bagnini" è per definizione
per chi è assegnato a quell'area. Conseguenze pratiche:
- `shifts.required_category` **non viene più scritta** per le nuove Sostituzioni (resta nello
  schema per lo storico, letta solo per compatibilità, mai più fonte di verità applicativa).
- Il selettore "Ruolo richiesto" in `ShiftFormModal` è stato **rimosso**: il contesto (l'area/tab
  in cui si crea la Sostituzione) lo sostituisce implicitamente.
- `shiftController.listAvailableShifts`/`claimShift` filtrano ora per `user_areas` (il dipendente
  è assegnato all'area del turno?), non più per categoria.
- `cancellationController.approveRequest`: la nuova Sostituzione generata eredita `area_id`/
  `sede_id` **direttamente dal turno originale**, non più dalla categoria del dipendente titolare
  — più semplice e sempre corretto per costruzione.
- Stesso principio per i corsi: `courseController.claimCourse` verifica "il dipendente è
  assegnato a quest'area" invece di "categoria = istruttore".

### Migrazione dati preesistenti (idempotente, in `schema.sql`)

Un solo `npm run migrate` porta un database "a categorie fisse" allo stato configurabile senza
perdita di funzionalità:
1. Ogni società priva di sedi riceve una "Sede Principale".
2. Ogni sede priva di aree riceve due aree che replicano esattamente le vecchie categorie:
   "Bagnino" (`calendar_mode='shifts'`) e "Istruttore" (`calendar_mode='courses'`).
3. Ogni dipendente con `category` valorizzata viene collegato (`user_areas`) all'area
   equivalente della sede di default della propria società.
4. Ogni turno/corso esistente viene collegato all'area "Bagnino"/"Istruttore" della sede di
   default della propria società (`area_id`/`sede_id` backfillati, poi resi `NOT NULL`).

Il risultato: **zero regressioni** per le società esistenti (dashboard, calendari, permessi
restano identici subito dopo la migrazione), ma da quel momento il Dirigente può rinominare,
aggiungere, riordinare o rimuovere aree/sedi liberamente — la migrazione è solo un punto di
partenza compatibile, non un vincolo permanente. Le società create **dopo** questa migrazione
(via Super Admin) non ricevono invece alcuna area predefinita: partono da una sede vuota, così da
non imporre nomi di categoria legacy a clienti nuovi.

### Permessi

Gestione sedi/aree (crea/modifica/elimina/riordina) **riservata al Dirigente**: coerente con
permessi già esistenti (es. solo il Dirigente crea i Responsabili). I Responsabili selezionano
la sede su cui lavorare ma non la gestiscono. Sia Responsabili sia Dirigente possono leggere
l'elenco sedi/aree per navigare (`GET /api/sedi`, `GET /api/sedi/:id/areas` con `requireManager`).

### Cancellazione di sedi/aree

Nessun hard-delete distruttivo se l'entità ha dati collegati (coerente con l'assenza di
hard-delete altrove nel sistema: companies, cancellation_requests). Una sede non si può eliminare
se ha aree operative; un'area non si può eliminare se ha turni, corsi o dipendenti assegnati. In
questi casi si usa `isActive=false` per "nascondere" l'entità dalla navigazione mantenendo i dati.

## Logica delle Sostituzioni (ex "turni volanti")

Evoluzione del vecchio meccanismo "turno volante": in UI il termine non esiste più, è sempre
"Sostituzione" (bottoni, legenda calendario, pannelli). **Il valore interno a DB `type='volante'`
non è cambiato** — stessa convenzione già usata per il rename "Turno mobile" → "Turno singolo":
si rinomina solo l'etichetta mostrata, mai il dato, per evitare una migrazione di dati rischiosa
e non necessaria.

Una Sostituzione nasce in due modi:
1. **Creazione manuale** (responsabile/dirigente, da `ShiftFormModal`, dentro una specifica area):
   data, orario, note. Il "ruolo richiesto" non è più un campo esplicito: è l'area stessa (vedi
   sezione "Gerarchia Sedi → Aree operative" sopra). Endpoint invariati (`POST/PUT /api/shifts`),
   con `areaId` obbligatorio nel body.
2. **Creazione automatica da cancellazione approvata** (`cancellationController.approveRequest`):
   quando un responsabile/dirigente approva la richiesta di cancellazione di un dipendente, il
   turno originale **non viene più eliminato**:
   - turno `fixed`: invariato, si esclude solo l'occorrenza richiesta via `shift_exceptions` (la
     serie resta intatta, comportamento pre-esistente, non toccato);
   - turno `mobile`/`volante` assegnato: la riga passa a `status='cancelled_approved'` invece di
     essere cancellata — resta in tabella come storico ma sparisce dal calendario attivo
     (`getExpandedShifts` filtra sempre `status='active'`). Non esiste (ancora) una UI dedicata
     per consultare questo storico: il dato è persistito ma solo interrogabile via DB.
   In entrambi i casi viene creata una nuova riga `shifts` con `type='volante'`, `user_id=NULL`,
   `origin_shift_id` = id del turno originale, `area_id`/`sede_id` **ereditati direttamente dal
   turno originale** (non più dalla categoria del dipendente).

**Disponibilità e claim** (`shiftController.listAvailableShifts`/`claimShift`,
`shiftExpansion.hasOverlappingShift`):
- Un responsabile/dirigente vede **tutte** le Sostituzioni pendenti di un'area (vista "manage",
  invariata, può solo eliminarle).
- Un dipendente vede solo le Sostituzioni **compatibili**: assegnato all'area del turno (tramite
  `user_areas`) *e* non ha già, in quella data/orario, un turno attivo che si sovrappone (fisso
  espanso o singolo/Sostituzione già accettata, **in qualunque area**: la sovrapposizione si
  controlla sempre su tutte le aree del dipendente, non solo su quella del turno). La
  sovrapposizione si calcola riusando `getExpandedShifts` sul solo giorno interessato, stessa
  funzione del calendario.
- Il filtro lato lista è solo un aiuto UX: `claimShift` **ripete sempre** entrambi i controlli
  (area + sovrapposizione) prima di assegnare, per non fidarsi di chi chiama l'endpoint
  direttamente bypassando la UI.

## Fabbisogno di personale per area operativa

Livello superiore ai turni: esprime "quante persone servono" in un'area/fascia oraria a
prescindere da chi sia già assegnato, e confronta automaticamente questo fabbisogno con la
copertura reale (turni fissi/singoli/Sostituzioni accettate). Solo per aree con
`calendar_mode='shifts'` (nessun caso d'uso per le aree Corsi).

### Modello

- **Fabbisogno fisso** (`req_type='fixed'`): regola ricorrente per giorno della settimana, una
  riga per giorno (il numero di persone può variare giorno per giorno). Un'area può avere **più
  fasce fisse indipendenti in parallelo** (es. mattina 08-14 e sera 18-22, o "cucina pranzo" e
  "cucina cena" nello stesso giorno): ogni fascia è identificata dal proprio orario
  (`start_time`/`end_time`) ed è gestita indipendentemente dalle altre. Editor:
  `StaffingWeeklySlotsModal` (lista delle fasce esistenti dell'area, raggruppate lato frontend per
  `(startTime, endTime)` — nessuna colonna/tabella dedicata al concetto di "fascia", è solo un
  raggruppamento di visualizzazione) + `StaffingScheduleModal` (form di UNA fascia: orario
  condiviso dai giorni selezionati, un conteggio per giorno, 0 = nessun fabbisogno quel giorno in
  quella fascia, data di decorrenza). `PUT /api/staffing/requirements/weekly` accetta ora
  gli opzionali `originalStartTime`/`originalEndTime`: se presenti (modifica di una fascia
  esistente) chiude/ricrea **solo** le righe con quell'orario esatto; se assenti (nuova fascia) non
  chiude/tocca nulla, crea soltanto le nuove righe. Così facendo una fascia non sostituisce mai le
  altre fasce della stessa area — solo se stessa. "Eliminare" una fascia dall'editor equivale a
  salvarla con tutti i giorni a 0 (nessuna riga da ricreare, quelle esistenti vengono chiuse).
  **Prima di questa modifica** un solo editor gestiva un unico orario condiviso da tutti i giorni
  e ogni salvataggio sostituiva sempre l'intera programmazione fissa dell'area: causava la perdita
  silenziosa di una fascia già configurata quando se ne creava una seconda con orario diverso
  (bug segnalato dall'utente subito dopo il primo deploy dell'integrazione calendario, vedi
  changelog). Non tornare al modello "un solo editor/un solo orario per area": è insufficiente per
  i casi d'uso del prodotto (ristoranti, magazzini con più turni giornalieri).
- **Fabbisogno singolo** (`req_type='single'`): esigenza straordinaria per una sola data, non
  tocca la programmazione ricorrente.
- **Eccezioni su un fabbisogno fisso** (`staffing_requirement_exceptions` + endpoint
  `PUT /api/staffing/requirements/:id/occurrence`): 4 modalità, scelte dal dirigente occorrenza
  per occorrenza (`StaffingOccurrenceModal`):
  1. *Modifica solo questa occorrenza* → scrive un'eccezione con `override_count`.
  2. *Modifica questa occorrenza e tutte le future* → "spezza" la regola: chiude quella corrente
     (`effective_until = data-1`) e ne crea una nuova identica da quella data con il nuovo conteggio
     (stesso principio già usato per i turni fissi con `recurrence_rule`, qui a granularità di
     singolo giorno della settimana).
  3. *Elimina solo questa occorrenza* → scrive un'eccezione con `is_deleted=true`.
  4. *Elimina questa occorrenza e tutte le future* → chiude la regola senza crearne una nuova.
  Se la data coincide con l'inizio della regola (nessuna occorrenza precedente da preservare), le
  modalità 2/4 agiscono direttamente sulla regola esistente invece di spezzarla.

### Calcolo della copertura (`staffingCoverage.computeCoverage`)

Per ogni occorrenza nell'intervallo richiesto: espande le regole (`utils/staffingOccurrences.js`,
applica le eccezioni), poi riusa **invariato** `shiftExpansion.getExpandedShifts` per i turni
assegnati dell'area/periodo, e conta come copertura ogni turno che si **sovrappone** (non
corrispondenza esatta) alla fascia del fabbisogno — stesso criterio di `hasOverlappingShift`.
`missingSlots = requiredCount - assegnati - Sostituzioni già pubblicate e non reclamate`.

**Limite noto, scelta deliberata**: se due fabbisogni della stessa area/data si sovrappongono
nella fascia oraria (es. un fabbisogno singolo lo stesso giorno di un'occorrenza fissa, o due
fasce diverse ma sovrapposte), lo stesso turno assegnato può contare come copertura di entrambi
contemporaneamente (nessuna "prenotazione esclusiva" di un turno da parte di un'occorrenza). Una
logica di assegnazione esclusiva (priorità al fabbisogno con fascia oraria più ristretta, un
turno mai conteggiato due volte) è stata progettata e poi scartata per questa prima versione, su
richiesta esplicita dell'utente, per tenere il calcolo semplice — può essere reintrodotta in
futuro senza cambi allo schema dati se il caso d'uso reale lo richiede. Non implementarla "di
nascosto" in una modifica futura senza discuterne: cambierebbe il significato dei numeri mostrati.

### Slot scoperti → Sostituzioni (`POST /api/staffing/requirements/:id/generate-gap`)

**Generazione sempre manuale** (bottone "Genera" sul chip di copertura nel calendario, mai
automatica): crea tante righe `shifts` (`type='volante'`, `user_id=NULL`, `requirement_id`
valorizzato) quante ne mancano per coprire il fabbisogno di quella specifica occorrenza — stesso
pattern di INSERT già collaudato in `cancellationController.approveRequest`. **Idempotente**:
rieseguito dopo che alcuni posti sono stati accettati, genera solo la differenza residua (il
conteggio delle Sostituzioni già aperte e non reclamate, collegate via `requirement_id`, evita
duplicati). Una volta create, queste Sostituzioni entrano nel flusso già esistente e **invariato**
di `SubstitutionsPanel`/`listAvailableShifts`/`claimShift`: nessuna logica di claim separata per
il fabbisogno.

### Prevenzione fabbisogni duplicati

Non si possono creare due regole (fisse o singole) con fascia oraria **esattamente identica**
sulla stessa area/data-o-giorno (`findConflictingRequirement`): due fasce diverse anche se si
sovrappongono (es. 08:00-14:00 e 10:00-12:00) restano sempre legittime. In caso di conflitto
l'endpoint risponde `409` senza scrivere nulla; il frontend mostra `window.confirm` con il
dettaglio e, se confermato, ripete la chiamata con `confirmDuplicate: true`. Stesso meccanismo per
`upsertWeeklySchedule` (per giorno) e `createSingleRequirement`/`updateSingleRequirement`.

### Turni sovrapposti affiancati nel calendario

Conseguenza diretta del fabbisogno: più dipendenti assegnati alla stessa area/fascia oraria sono
ora un caso normale (prima raro). `CalendarGrid.jsx`/`ShiftBlock.jsx` riusano **invariato**
l'algoritmo di layout a corsie già usato per i corsi (`utils/courseLayout.layoutCourses`, generico
su `startTime`/`endTime`): turni sovrapposti si affiancano invece di nascondersi a vicenda
(prima: `left:3px;right:3px` fisso, un turno copriva l'altro). Con un solo turno per fascia
(`laneCount=1`) la larghezza resta 100%, identica al comportamento storico: nessuna regressione
per l'uso esistente. Nessuna modifica a `courseLayout.js`/`CoursesGrid.jsx`/`CourseBlock.jsx`.

### Copertura integrata direttamente nel calendario turni (non più un pannello separato)

Evoluzione richiesta esplicitamente dall'utente: inizialmente la copertura viveva solo in
`StaffingPanel.jsx`, un pannello riepilogativo montato sotto al calendario. **Rimosso**: il
dirigente deve vedere "quanto serve / quanto è coperto / chi manca" direttamente nella stessa
vista calendario, senza aprire pannelli secondari. Nessuna modifica al backend: l'integrazione è
puramente frontend, riusa `GET /api/staffing/coverage` e `GET /api/staffing/requirements` così
come già utilizzati dal vecchio pannello.

**Dove vive nel codice**: `CalendarPage.jsx` (solo `mode='admin'`, le rotte `/staffing/*` sono
`requireManager`) carica `coverage` in parallelo a `shifts` nello stesso `loadCalendar`/polling a
5s (prima il pannello aveva un polling separato a 10s, unificato per semplicità — nessun impatto
di carico atteso, la query riusa `getExpandedShifts` già ottimizzato). `CalendarGrid.jsx` riceve
`coverageByDate` (raggruppato per data, come `shiftsByDate`) e inserisce una riga aggiuntiva nella
griglia CSS, tra l'header giorni e la griglia oraria, con un chip (`StaffingChip.jsx`) per ogni
occorrenza del giorno — **mai accorpati**, un'area può avere più fasce indipendenti lo stesso
giorno (es. mattina+sera), ognuna il proprio chip.

**Design deliberato: chip in riga, non overlay sull'asse del tempo.** Si è scelto di non
posizionare gli indicatori di copertura sovrapposti alla griglia oraria (come fa `layoutCourses`
per i turni) per due motivi: (1) evitare collisioni visive con gli `ShiftBlock` sottostanti quando
più fasce di fabbisogno si sovrappongono nello stesso orario/area (caso già noto e legittimo, vedi
"Limite noto" sopra); (2) rinforzare la gerarchia di lettura richiesta esplicitamente dall'utente
— **sopra = quanto personale serve (pianificazione)**, **sotto = chi lavora davvero (turni
assegnati, invariati)**. Per questo il chip usa uno stile "badge/etichetta" (bordo sottile, sfondo
chiaro, indicatore di stato a barra laterale verde/ambra) deliberatamente diverso dal rettangolo
pieno colorato di `ShiftBlock`, per non essere confuso con un turno; la riga chip ha inoltre uno
sfondo neutro proprio con un bordo di separazione dalla griglia sottostante. Non fondere i due
stili in una futura modifica: la distinzione visiva è un requisito esplicito, non un dettaglio
estetico.

**Chip compatto di default, dettaglio a richiesta**: mostra sempre orario + `copertura/richiesto`
+ bottone "Genera" (se `missingSlots > 0`, l'azione più frequente). Click sul corpo del chip
espande inline (stato locale del componente, nessun modale) l'elenco nominale di `assignedUsers` e
il conteggio `openSlots`, più un bottone "Modifica" che apre `StaffingOccurrenceModal` (regola
fissa) o `StaffingSingleModal` (fabbisogno singolo) — stesso routing per `reqType` che prima era in
`StaffingPanel.handleOccurrenceClick`, ora in `CalendarPage.handleEditOccurrence`. I nomi degli
assegnati restano comunque visibili anche senza espandere il chip, guardando gli `ShiftBlock`
nella stessa fascia oraria sottostante: nessuna duplicazione obbligatoria delle informazioni.

**Gestione del fabbisogno** (creazione/modifica piano settimanale, nuovo fabbisogno singolo): i
bottoni "Gestisci fabbisogno settimanale" e "+ Fabbisogno singolo", prima nell'header di
`StaffingPanel`, sono ora nella toolbar di `CalendarPage` (solo `isAdmin`), accanto a "+ Nuovo
turno". Aprono gli stessi `StaffingScheduleModal`/`StaffingSingleModal` riusati invariati.

## Sistema avanzato di sostituzioni (in costruzione, per fasi)

Estensione del sistema di copertura dei turni scoperti: le due modalità **non si sostituiscono, si
integrano** — (1) autonomia dei dipendenti sulle Sostituzioni disponibili (già esistente, vedi
"Logica delle Sostituzioni"), (2) supporto intelligente al responsabile con classifica dei migliori
candidati interni + proposte mirate + notifiche + escalation. **Ambito esclusivamente interno**: il
pool di candidati è sempre e solo `users` della società (mai candidati esterni). Costruito come
livello **additivo** sopra i turni, riusando tutto ciò che esiste (`user_areas` come "ruolo
compatibile", `getExpandedShifts`/`hasOverlappingShift`, il claim atomico di `claimShift`, il
polling `usePolling`), senza modificare la logica di
`claimShift`/`listAvailableShifts`/`approveRequest` (solo aggiunte in coda).

**Piano a fasi** (ognuna testabile e deployabile da sola; migrazioni idempotenti, produzione solo
dopo conferma esplicita dell'utente):
1. **Contratti dei dipendenti** ✅ *completata (2026-07-08)* — vedi sotto.
2. **Disponibilità dichiarate** ✅ *completata (2026-07-08)* — vedi sotto.
3. **Notifiche in-app** ✅ *completata (2026-07-08)* — vedi sotto.
4. **Motore di compatibilità + "Trova sostituzione"** ✅ *completata (2026-07-08)* — vedi sotto.
5. **Proposte mirate** ✅ *completata (2026-07-08)* — vedi sotto.
6. **Opt-out "Non partecipare" + storico per il motore** ✅ *completata (2026-07-08)* — vedi sotto.
7. **Escalation lazy** (rilevamento "nessuno ha accettato" al polling notifiche, **senza cron**:
   vincolo hosting serverless, tempo configurabile per società `substitution_escalation_hours`) ✅
   *completata (2026-07-08)* — vedi sotto. **Piano a 7 fasi completato.**

**Decisioni prese con l'utente all'avvio**:
- *Destinatari notifiche responsabili*: struttura predisposta per collegare in futuro responsabili
  specifici alle aree; in v1, in mancanza di quel legame, prioritariamente i responsabili dell'area
  coinvolta se individuabili, altrimenti tutti gli `admin`/`dirigente` della società.
- *Contratti*: testo libero + preset suggeriti, struttura estendibile (`custom_config` JSONB, campi
  di audit) per future evoluzioni (storico modifiche, configurazioni personalizzate).
- *Escalation*: rilevamento lazy tramite polling notifiche, nessun cron/infrastruttura aggiuntiva.

### Fase 1 — Contratti dei dipendenti ✅

Configurazione contrattuale per dipendente (tabella `user_contracts`, vedi "Tabelle principali").
Additivo puro: nessuna modifica a tabelle/flussi esistenti, nessun backfill.
- **Backend**: `controllers/contractController.js` (dominio separato, coerente con la modularità
  richiesta) — `getUserContract` + `upsertUserContract` (INSERT … ON CONFLICT `(user_id)`), con
  verifica società (404 fuori società, non si rivela l'esistenza) e ruolo `user` (400 altrimenti:
  il contratto ha senso solo per chi lavora i turni, stessa restrizione delle aree), validazione
  dei massimali (numeri ≥ 0, tutti opzionali; vuoto → `null`). Route `GET`/`PUT
  /api/users/:id/contract` in `routes/users.js` (`requireManager`).
- **Frontend**: `components/management/ContractModal.jsx` (form: tipo con `<datalist>` di preset,
  6 massimali in griglia a due colonne, note/vincoli; carica il contratto esistente e fa upsert);
  bottone "Contratto" per riga dipendente in `UserManagementSection.jsx`; `api.getUserContract`/
  `api.saveUserContract` in `client.js`; classi `.modal-card-wide`/`.contract-grid` in `styles.css`.
- **Perché estendibile**: `contract_type` testo libero (nuove tipologie senza toccare lo schema),
  `custom_config` JSONB per vincoli aziendali futuri, campi di audit che permettono di aggiungere
  in seguito una `user_contract_history` come modifica puramente additiva.
- Verificato in locale: migrazione idempotente (2×), endpoint via curl (creazione/lettura/upsert,
  numerici tornati come `Number`, campi vuoti → `null`, `customConfig` persistito; errori 400 su
  negativi/non-numerici e su ruolo non-`user`, 404 su utente inesistente/altra società, 401 senza
  token) e flusso UI end-to-end nel browser (apertura modale, precaricamento del contratto salvato,
  modifica e salvataggio persistito con `updated_by` corretto). Nessuna migrazione produzione ancora
  eseguita.

### Fase 2 — Disponibilità dichiarate ✅

Disponibilità ricorrenti per giorno della settimana (tabella `user_availability`, vedi "Tabelle
principali"), dichiarate dal dipendente e lette dal responsabile. Additivo puro.
- **Backend**: `controllers/availabilityController.js` (dominio separato) — `getUserAvailability`
  (leggibile dal dipendente stesso **o** da un responsabile/dirigente della stessa società: 403 se
  un dipendente prova a leggere un altro, 404 se un manager legge un utente di altra società) e
  `replaceUserAvailability` (solo il dipendente stesso, ruolo `user`; valida tutte le fasce poi
  DELETE + INSERT multi-riga, stesso pattern di `userController.setUserAreas`). Route `GET`/`PUT
  /api/users/:id/availability` in `routes/users.js` con **solo `authenticate`** (unica eccezione al
  pattern "tutto `requireManager`" di quel file: anche il dipendente accede ai propri dati,
  l'autorizzazione fine è nel controller).
- **Frontend**: `components/profile/AvailabilityEditor.jsx` (editor self-service montato in
  `MyProfile`: righe giorno+inizio+fine, aggiungi/rimuovi, salva; esporta `WEEKDAYS` riusato dalla
  vista manager); `components/management/AvailabilityModal.jsx` (vista **sola lettura** per il
  responsabile, fasce raggruppate per giorno) aperta dal bottone "Disponibilità" per riga dipendente
  in `UserManagementSection.jsx`; `api.getUserAvailability`/`api.saveUserAvailability` in
  `client.js`; classi `.availability-*` in `styles.css`.
- **Semantica chiave**: **assenza di dichiarazioni = disponibilità "ignota"**, non incompatibile —
  in Fase 4 il candidato senza fasce dichiarate resterà in classifica con "necessaria verifica
  disponibilità", non escluso. Il dipendente **possiede** le proprie disponibilità (le modifica solo
  lui); il responsabile le consulta soltanto. Più fasce lo stesso giorno sono ammesse.
- Verificato in locale: migrazione idempotente (2×), endpoint via curl (lettura self/manager,
  replace con ordinamento lun→dom, replace vuoto che azzera; errori 400 su giorno/orari non validi e
  `slots` non-array, 403 su PUT del manager e su lettura incrociata tra dipendenti, 404 su utente di
  altra società, 401 senza token; CHECK a DB su `end<start`), e flusso UI end-to-end (vista manager
  read-only raggruppata per giorno; editor dipendente con aggiunta di una fascia e salvataggio
  persistito). Nessuna migrazione produzione ancora eseguita.

### Fase 3 — Notifiche in-app ✅

Notifiche per utente in campanella (header di tutte le dashboard), generate **in coda** ai flussi
esistenti in modo **best-effort** (un errore di invio non fa mai fallire l'azione che le innesca).
Tabella `notifications` (vedi "Tabelle principali"). Additivo puro.
- **Backend**: `services/notificationService.js` (dominio separato) risolve i destinatari e inserisce
  in blocco. `resolveManagerRecipients(companyId, areaId)` restituisce i responsabili **collegati
  all'area** se presenti, altrimenti **tutti gli admin/dirigente della società** (fallback v1): la
  query per area è già pronta e sfrutta `user_areas`, così collegare in futuro responsabili specifici
  alle aree non richiederà di toccare i call site (struttura predisposta, decisione dell'utente).
  `createNotifications` è best-effort (cattura/logga, non lancia; dedup via `ON CONFLICT` sull'indice
  parziale). Le funzioni `notify*` (una per evento) sono chiamate **in coda** — senza modificarne la
  logica — da: `shiftController.createShift` (Sostituzione creata → dipendenti area + responsabili),
  `.claimShift` (accettata → responsabili), `.deleteShiftSelf` (richiesta cancellazione →
  responsabili); `cancellationController.approveRequest` (→ richiedente "approvata" + nuova
  Sostituzione disponibile), `.rejectRequest` (→ richiedente "rifiutata");
  `staffingController.generateGapShifts` (→ disponibili, notifica riassuntiva con conteggio).
  `controllers/notificationController.js` + `routes/notifications.js` (`authenticate`, montato su
  `/api/notifications`): elenco (ultime 50 + `unreadCount`), segna-letta (404 se non propria),
  segna-tutte-lette. L'**autore** di un'azione è escluso dalle proprie notifiche.
- **Frontend**: `components/notifications/NotificationsBell.jsx` (campanella + badge non lette +
  pannello con elenco/tempo relativo/evidenza non lette/"segna tutte"/segna-letta ottimistico/
  chiusura al click esterno), polling 10s con `usePolling` aggiornando in place (nessuno stato di
  caricamento che nasconda contenuto → nessuno sfarfallio). Montata nell'header (`.topbar-actions`)
  di `AdminDashboard`/`DirigenteDashboard`/`EmployeeDashboard`. `api.listNotifications`/
  `markNotificationRead`/`markAllNotificationsRead` in `client.js`; stili `.notif-*` in `styles.css`.
- **Deep-link (limite v1 dichiarato)**: il `payload` porta i riferimenti (`shiftId`/`areaId`/...) per
  una navigazione ricca futura; oggi il click marca come letta ma non naviga alla tab specifica (le
  aree sono tab, non rotte) — affinamento previsto, non un bug.
- Verificato in locale: migrazione idempotente (2×), flusso completo via curl (disponibile/accettata/
  richiesta-cancellazione/approvata con nuova Sostituzione; mark-read/mark-all; 404 su notifica non
  propria; 401 senza token; tutte le azioni restano 2xx con notifiche attive), flusso UI end-to-end
  nel browser (badge lato dipendente e dirigente, pannello, "segna tutte" che azzera badge e DB,
  chiusura/riapertura). Dati di test rimossi. Nessuna migrazione produzione ancora eseguita.

### Fase 4 — Motore di compatibilità + "Trova sostituzione" ✅

Motore di suggerimento **sola lettura** (nessuna modifica allo schema/ai dati): data una Sostituzione
scoperta, produce una **classifica 0–100 con motivazioni** dei dipendenti interni compatibili
dell'area. Solo suggerimento, mai assegnazione automatica.
- **Backend**: `services/substitutionMatcher.js` (motore isolato) — `rankCandidates({ shift,
  companyId })`. Pool = dipendenti (`user_areas`, ruolo `user`) dell'area del turno; batch di
  disponibilità/contratti/storico + **una** `getExpandedShifts` sulla finestra che copre settimana e
  mese della data (raggruppata per dipendente in memoria, stesso spirito del fix N+1 di
  `listAvailableShifts`). Punteggio su 4 dimensioni con **pesi in `CONFIG`** (punto di aggancio per
  futuri algoritmi AI): disponibilità (fascia coperta/parziale/fuori/ignota), contratto (proiezione
  ore settimana/mese/giorno e giorni consecutivi vs massimali di `user_contracts`), bilanciamento
  carico (relativo al min/max ore settimanali del pool), storico (Sostituzioni già accettate).
  **Unica esclusione rigida: la sovrapposizione oraria** (stesso vincolo di `claimShift` — chi si
  sovrappone non potrebbe comunque accettare). Le **violazioni contrattuali NON escludono**:
  azzerano la dimensione contratto e aggiungono una motivazione rossa (il candidato retrocede ma
  resta visibile, la decisione è del responsabile). Disponibilità non dichiarata = neutra ("da
  verificare"). Motivazioni tipizzate `{ text, kind: positive|neutral|negative }`.
  `shiftController.getShiftCandidates` valida che la Sostituzione sia aperta e della società (404
  altrimenti) e chiama il motore; route `GET /api/shifts/:id/candidates` (`requireManager`).
- **Frontend**: `components/shifts/FindReplacementModal.jsx` (classifica: rank, nome, % con colore
  alto/medio/basso, chip motivazioni verde/grigio/rosso; stati loading/vuoto/errore) aperto dal
  bottone "Trova sostituzione" in `SubstitutionsPanel` (**solo vista `manage`**); `api.getShiftCandidates`
  in `client.js`; classi `.candidate-*`/`.reason-*`/`.shift-item-actions` in `styles.css`.
- **Perché sola lettura**: la Fase 4 suggerisce soltanto; l'invio di una proposta mirata ai candidati
  selezionati (che scriverà) è la Fase 5.
- Verificato in locale: endpoint via curl con dipendenti di prova ad attributi diversi (disponibile
  in fascia in cima, disponibilità ignota/fuori-fascia a scendere, violazione contrattuale retrocessa
  con motivo rosso, sovrapposizione oraria esclusa del tutto; punteggi coerenti con i pesi); errori
  404 (shift inesistente/non-volante/assegnato), 403 (dipendente su rotta `requireManager`), 401
  (senza token). Flusso UI end-to-end nel browser (classifica renderizzata con percentuali e
  motivazioni colorate). Dati di test rimossi. Nessuna migrazione (fase sola lettura).

### Fase 5 — Proposte mirate ✅

Terzo livello di copertura dei turni scoperti: dalla classifica di "Trova sostituzione" (Fase 4) il
responsabile **invia una proposta solo ai candidati che sceglie**; il dipendente la vede in "Le mie
proposte" e decide (Accetta/Rifiuta). Convive con l'autonomia esistente — la stessa Sostituzione resta
accettabile anche dal pannello "Sostituzioni disponibili": nessuna esclusiva, nessuna assegnazione
automatica. Additivo puro.
- **Riuso del claim atomico (helper condiviso)**: il cuore dell'assegnazione di una Sostituzione
  (doppi controlli area+sovrapposizione + UPDATE condizionale) è stato estratto da `claimShift` in
  `shiftController.assignVolanteToUser({ shiftRow, user })`, **unica fonte di verità** riusata sia dal
  claim autonomo sia dall'accettazione di una proposta. `claimShift` resta un wrapper a comportamento
  osservabile **invariato** (verificato: 403/200/409 identici). Questa è la "necessità documentata"
  che il vincolo "non modificare `claimShift`" ammette: garantisce che i due percorsi non divergano.
- **Backend**: `substitutionProposalController.js` — `createProposals` (POST
  `/api/shifts/:id/proposals`, `requireManager`: snapshot `score`/`reasons` da `rankCandidates`,
  propone solo ai candidati **validi**; chi ha sovrapposizione oraria finisce in `skipped`, non gli si
  propone un turno che non potrebbe accettare; UPSERT su `(shift_id,user_id)` per ri-proporre dopo un
  rifiuto), `listShiftProposals` (GET stessa rotta: annota "Trova sostituzione" con lo stato delle
  proposte già inviate), `listMyProposals` (GET `/api/proposals/mine`: solo `pending` su turni
  **ancora aperti** — una proposta superata sparisce senza toccare `claimShift`), `acceptProposal`
  (POST `/api/proposals/:id/accept`: riusa `assignVolanteToUser`, segna `accepted`, porta le proposte
  **gemelle** dello stesso turno a `expired`, notifica i responsabili con `notifySubstitutionClaimed`;
  se il turno è già coperto → `expired` + 409), `declineProposal` (POST `.../decline`: segna
  `declined`, notifica i responsabili). Rotte `/api/proposals/*` con `authenticate` (autorizzazione
  fine nel controller, azioni sempre sulle proprie proposte). Notifiche nuove:
  `notifySubstitutionProposal` (al singolo dipendente), `notifyProposalDeclined` (ai responsabili),
  entrambe best-effort come le altre.
- **Frontend**: `FindReplacementModal` esteso con checkbox per candidato + "Invia proposta (N)" e
  badge di stato delle proposte già inviate; nuovo `MyProposalsPanel.jsx` (card dipendente con
  Accetta/Rifiuta + polling 5s, nascosta se non ci sono proposte), montato in `EmployeeDashboard`
  sopra le Sostituzioni disponibili. `api.createProposals`/`listShiftProposals`/`listMyProposals`/
  `acceptProposal`/`declineProposal` in `client.js`; classi `.candidate-check`/`.proposal-badge*`/
  `.proposal-item`/`.proposal-info` in `styles.css`.
- **Perché lo snapshot `score`/`reasons`**: la motivazione mostrata a dipendente e responsabile resta
  stabile anche se turni/disponibilità cambiano dopo l'invio; è la stessa forma tipizzata del motore.
- Verificato in locale: migrazione idempotente (2×); script e2e via HTTP con JWT firmati, **30/30
  asserzioni** (invio, viste manager/dipendente, accept con assegnazione + gemella `expired` + accept
  scaduta 409, notifiche dei 3 nuovi/riusati tipi, rifiuto, ri-proposta UPSERT→pending; errori
  400/401/403/404; isolamento società); **test di regressione dedicato su `claimShift`** (claim
  autonomo 403/200/409 invariato); nessun ciclo di require; build frontend OK; dati di test rimossi
  (CASCADE). Migrazione produzione ancora da eseguire.

### Fase 6 — Opt-out "Non partecipare" + storico per il motore ✅

Due parti additive. **(A) Opt-out**: il dipendente dichiara periodi in cui non vuole essere
considerato per le sostituzioni (tabella `substitution_optouts`, vedi "Tabelle principali").
**(B) Storico nel motore**: `rankCandidates` inizia a usare opt-out e rifiuti per ordinare i candidati.
- **Opt-out "blocca + retrocede"** (decisione dell'utente): a chi ha un opt-out attivo sulla data (1)
  il motore assegna una forte penalità (`CONFIG.optOutPenalty`, score a 0) + motivo rosso e lo mette in
  fondo con flag `optedOut`; (2) `substitutionProposalController.createProposals` **non gli invia la
  proposta** (finisce in `skipped`, visibile); (3) `notificationService` **non** gli manda il broadcast
  "nuova sostituzione disponibile" (`excludeOptedOut`). **Nessuna esclusione silenziosa**: resta sempre
  visibile in classifica, e `listAvailableShifts` è invariato — può ancora reclamare autonomamente se
  cambia idea ("non sollecitarmi", non "non posso").
- **Storico rifiuti**: la dimensione "storico" del motore, oltre alle Sostituzioni accettate, considera
  i **rifiuti** di proposte mirate (`substitution_proposals.status='declined'`) come leggero segnale
  negativo (`CONFIG.declinePenaltyRatio`, motivo neutro). Le proposte **accettate** non si ricontano:
  diventano turni `volante` con `user_id`, già conteggiati — dai record delle proposte si prende solo il
  numero di rifiuti.
- **Backend**: `optOutController.js` (self-service come le disponibilità: il dipendente gestisce i
  propri opt-out, il responsabile li legge; date TZ-safe con `toDateOnly`, validazione su componenti
  UTC); rotte `GET/POST /api/users/:id/optouts` + `DELETE .../optouts/:optoutId`. Modifiche di sola
  lettura a `substitutionMatcher.js`; guardia in `createProposals`; `excludeOptedOut` in
  `notificationService.js`.
- **Frontend**: `OptOutEditor.jsx` (nuovo) in `MyProfile` (aggiungi periodo/elenco/rimuovi; esporta
  `formatOptOutPeriod`); `AvailabilityModal.jsx` esteso con la sezione read-only "Periodi 'non
  partecipa'" per il responsabile; 3 metodi in `client.js`; classi `.optout-*` in `styles.css`.
- Verificato in locale: migrazione idempotente (2×); e2e via HTTP **24/24** (CRUD opt-out +
  errori/isolamento; motore che retrocede l'opt-out con motivo rosso e score 0; blocco dell'invio
  proposta; storico rifiuti; soppressione broadcast); **regressione Fasi 5/claim 30/30 + 4/4**; smoke
  test browser (editor dipendente con date corrette senza slittamento fuso, vista manager read-only).
  Migrazione produzione ancora da eseguire.

### Fase 7 — Escalation lazy (senza cron) ✅

Ultimo livello del sistema: se una Sostituzione resta scoperta oltre le ore configurate dal Dirigente
(`companies.substitution_escalation_hours`), i **responsabili** vengono avvisati. Additivo puro,
nessuna assegnazione automatica (l'escalation *avvisa*, non riassegna).
- **Nessun cron** (vincolo hosting serverless Vercel): il rilevamento è **lazy**, agganciato al polling
  già esistente delle notifiche. In `notificationController.listNotifications`, **solo se chi carica è
  un responsabile**, si esegue `escalationService.escalateOverdueSubstitutions(companyId)` (best-effort:
  cattura i propri errori, non fa mai fallire il caricamento). Il gating ai manager limita il costo
  (pochi manager vs molti dipendenti) e l'escalation è comunque destinata a loro. **Idempotente**: la
  notifica usa `dedupe_key='escalation:<shiftId>'` (indice unico parziale già predisposto in Fase 3),
  quindi scatta una sola volta per turno anche se la passata gira a ogni poll.
- **Criterio "scoperta da troppo"**: `type='volante'` non assegnato, `status='active'`, `date` ancora
  futura (c'è tempo per intervenire), e `created_at <= NOW() - N ore` (misurato da quando è stata
  pubblicata). `N = substitution_escalation_hours`; NULL/≤0 → escalation disattivata (opt-in per società).
- **Configurazione riservata al Dirigente**: nuovo endpoint scoped `GET/PUT /api/company/settings`
  (`requireDirigente`), diverso da `/api/companies/*` (anagrafica di piattaforma, solo Super Admin). È
  la separazione di ruoli richiesta esplicitamente dall'utente: **Super Admin = piattaforma, Dirigente
  = regole aziendali, Responsabile = operatività** (il Responsabile non modifica le regole). La risposta
  `settings` è un oggetto estendibile (comportamento/livelli successivi in futuro senza cambiare l'impianto).
- **Frontend**: `SubstitutionSettingsCard.jsx` (nuovo) in `DirigenteDashboard` (campo ore + salva, vuoto
  = disattivata); `notifySubstitutionEscalated` (tipo `substitution_escalated`) resa dalla campanella
  già esistente (`NotificationsBell`), nessuna UI dipendente nuova. `api.getCompanySettings`/
  `saveCompanySettings` in `client.js`; classe `.settings-row` in `styles.css`.
- **Limite noto** (accettato per la v1): senza cron l'escalation è generata solo quando un responsabile
  è attivo e carica le notifiche — cioè esattamente quando può agire; se nessuno è online, compare al
  primo accesso successivo. Non è un bug: è la conseguenza diretta del vincolo "niente cron".
- Verificato in locale: migrazione idempotente (2×); e2e via HTTP **19/19** (impostazioni + permessi
  `requireDirigente`, gating del poll, escalation solo per il turno scaduto e solo ai manager,
  idempotenza, disattivazione); **regressione Fasi 5/6/claim 30/30 + 24/24 + 4/4**; smoke test browser
  (card Dirigente + escalation reale nella campanella del dirigente). Migrazione produzione ancora da eseguire.

## Aggiornamenti quasi in tempo reale (polling leggero)

Problema: quando un utente crea/modifica un turno o accetta una Sostituzione, gli altri utenti
collegati contemporaneamente non vedevano l'aggiornamento finché non ricaricavano manualmente la
pagina. Causa: ogni componente con dati condivisi caricava i dati **solo** in un `useEffect` al
mount/cambio di dipendenze — nessun meccanismo avvisava le sessioni degli altri utenti.

**Soluzione**: `frontend/src/hooks/usePolling.js`, hook riutilizzabile che affianca (non
sostituisce) l'`useEffect` di fetch già esistente in ogni componente:
- Polling a intervallo configurabile, **solo quando `document.visibilityState === 'visible'`**
  (nessuna richiesta per tab in background).
- **Refetch immediato** su `visibilitychange` quando la tab torna visibile, così chi torna su una
  finestra già aperta non aspetta il prossimo tick.
- `enabled` opzionale per sospendere il polling quando un modale di modifica è aperto sullo stesso
  componente (evita ridisegni della griglia sotto al modale); alla chiusura del modale (sia
  salvando sia annullando) il componente chiama comunque subito la propria `load()`, così eventuali
  modifiche di altri utenti fatte nel frattempo (quando il polling era sospeso) sono recuperate
  senza aspettare il tick successivo.
- Cambi di contesto che già in precedenza causavano un refetch immediato (cambio area/settimana/
  utente selezionato, sono nell'array di dipendenze dell'`useEffect` esistente) **non sono stati
  toccati**: restano il meccanismo primario, il polling è solo un complemento per gli aggiornamenti
  generati da altri utenti.

**Perché polling e non WebSocket**: il backend gira su Vercel come funzioni serverless (non un
server Node persistente), quindi un vero WebSocket richiederebbe un'infrastruttura terza
(Pusher/Ably o simili) — sproporzionato per la scala di questa applicazione (poche decine di utenti
per società) e in contrasto con l'istruzione esplicita di non introdurre complessità/dipendenze
inutili. Nessun jitter randomico sul periodo: con questo numero di utenti concorrenti non c'è un
rischio reale di sovraccarico da sincronizzazione accidentale dei timer.

**Componenti con polling attivo e intervalli** (solo dati condivisi tra utenti; pannelli di
amministrazione a bassa concorrenza come `UserManagementSection`/`AreasManagement`/`SediManagement`
non lo hanno, deliberatamente):

| Componente | Intervallo |
|---|---|
| `CalendarPage` (turni, incluso il fabbisogno integrato per `mode='admin'`), `CoursesCalendar` (corsi) | 5s |
| `SubstitutionsPanel`, `CoursesAvailablePanel` | 5s |
| `CancellationRequestsPanel`, `MyCancellationRequests` | 10s |
| `HoursStats` | 60s |

**Ottimizzazioni query collegate** (stesso intervento, per ridurre il carico generato dal polling
più frequente): `shiftExpansion.getExpandedShifts`/`courseExpansion.getExpandedCourses` eseguono
ora le due query indipendenti (istanze singole/Sostituzioni vs turni fissi) in parallelo
(`Promise.all`) invece che in sequenza — stesso output, una round-trip DB in meno per chiamata.
`shiftController.listAvailableShifts` non itera più con una `hasOverlappingShift` sequenziale per
ogni Sostituzione candidata (N query): carica una sola volta i turni espansi del dipendente
sull'intervallo di date coperto dalle righe candidate e fa il confronto di sovrapposizione in
memoria, con lo stesso identico predicato — verificato che il comportamento resti bit-per-bit
equivalente (stesso filtro "in qualunque area", non solo quella corrente). Aggiunto anche
l'indice mancante `idx_cancellation_requests_shift_id`.

## Struttura dell'interfaccia: navigazione a sezioni con sidebar (2026-07-08)

Riorganizzazione **solo strutturale** dell'interfaccia (nessun restyling grafico, nessuna modifica
al backend, nessuna funzionalità rimossa): le tre dashboard monolitiche a scorrimento
(AdminDashboard/DirigenteDashboard/EmployeeDashboard, tutte le card impilate in un'unica pagina)
sono state sostituite da un layout con **sidebar di navigazione sempre visibile** e una **pagina
dedicata per sezione**, con rotte annidate di react-router (`<Outlet />`).

### Architettura del layout

- `components/layout/AppLayout.jsx`: guscio comune (sidebar + topbar con campanella/logout +
  Outlet), **senza logica di dominio**. Le voci di navigazione arrivano dal layout di ruolo.
- Un layout per ruolo: `ManagerLayout` (usato sia da /dirigente sia da /admin, con prop `base`),
  `EmployeeLayout`, `SuperAdminLayout`. Aggiungere una sezione = una voce nell'elenco del layout +
  una rotta figlia in `App.jsx`: la struttura non va ritoccata.
- `context/ManagerWorkspaceContext.jsx`: sede selezionata (riusa `useSedeSelection`, persistita in
  localStorage) + aree della sede + `timeWindow`, condivisi da tutte le sezioni manager. Il
  **selettore sede è nella sidebar** (una sola sede → solo etichetta, più sedi → select) e vale per
  tutte le sezioni.
- Stili in coda a `styles.css` (`.app-shell`, `.sidebar*`, `.dash-grid`, `.stat-card`): stessa
  palette preesistente (#1f2430 / #2f6f4f), nessun colore nuovo di rilievo. Sotto i 900px la
  sidebar diventa una barra orizzontale scorrevole in testa (tutte le sezioni sempre raggiungibili,
  nessun menu a scomparsa/JS).

### Sezioni per ruolo

| Sezione | Dirigente (/dirigente/*) | Responsabile (/admin/*) | Dipendente (/dashboard/*) |
|---|---|---|---|
| Dashboard | panoramica riassuntiva (sostituzioni aperte, richieste pendenti, fabbisogno scoperto oggi, notifiche + tabella copertura del giorno) | idem | panoramica (proposte da rispondere, disponibili nelle proprie aree, proprie richieste, notifiche) |
| Calendario | tab per area della sede attiva (turni con fabbisogno integrato / corsi), creazione e modifica | idem | tab dalle proprie aree (user.areas) |
| Turni | richieste di cancellazione da approvare | idem | stato delle proprie richieste |
| Personale | Responsabili + Dipendenti (contratti/disponibilità/aree per riga); `personale/nuovo` = CreateUser | solo Dipendenti | — |
| Sostituzioni | pannelli manage per area (+ Trova sostituzione/proposte) | idem | proposte ricevute + disponibili per area |
| Fabbisogno | regole per area (modali settimanale/singolo riusati; la copertura resta nel Calendario) | idem | — |
| Comunicazioni | elenco notifiche completo (pagina condivisa) | idem | idem |
| Report | analisi operativa del personale: griglia schede dipendente (ore/contratto/turni/richieste) con filtri periodo/sede/area/dipendente + scheda dettaglio (confronto periodi, alert informativi, storico) | idem | vista self-service (solo propri dati) |
| Impostazioni | account + Sedi + Aree operative + escalation sostituzioni | solo account (struttura riservata al Dirigente) | MyProfile (profilo/disponibilità/opt-out) |

Super Admin (/superadmin/*): solo **Dashboard** (statistiche piattaforma) e **Società** — coerente
col vincolo "il Super Admin non gestisce dati operativi". Senza campanella (le notifiche sono
interne alle società).

### Principi da mantenere

- **La Dashboard è solo riassuntiva**: indicatori e link alle sezioni, **nessuna operazione**
  (niente form/approvazioni/creazioni dentro la Dashboard). Le nuove funzionalità operative vanno
  nella loro sezione, non ri-accumulate nella home.
- **Le dashboard riassuntive riusano solo endpoint esistenti** (listAvailableShifts, coverage,
  cancellation-requests, notifications): nessuna rotta backend dedicata. Se i conteggi diventassero
  pesanti, valutare un endpoint di riepilogo dedicato invece di appesantire il polling (oggi 30s).
- **Compatibilità URL**: i vecchi percorsi `/admin/users/new` e `/dirigente/users/new` reindirizzano
  a `/…/personale/nuovo`; le home per ruolo (`ROLE_HOME`) sono invariate.
- La pagina Fabbisogno gestisce le **regole**; la **copertura** resta integrata nel Calendario
  (decisione preesistente, non reintrodurre un pannello copertura separato).

### Suggerimenti per il futuro restyling grafico (non ancora fatto, solo appunti)

- Introdurre variabili CSS (`:root { --color-primary: … }`) al posto dei colori hardcoded ripetuti
  (#2f6f4f, #1f2430, #6b7280) prima di toccare la palette.
- Icone nelle voci della sidebar (oggi solo testo) e stati hover/focus più curati.
- Migliorare `.dash-grid`/`.stat-card` con trend/sparkline quando arriveranno statistiche avanzate.
- Valutare una topbar sticky (attenzione agli z-index dei modali `.modal-overlay` e del pannello
  campanella) e un tema scuro coerente con la sidebar.
- Le tabelle (`.table`) sono il candidato principale per un refresh (densità, righe alternate,
  ordinamento).

## Funzionalità già completate

- Autenticazione JWT con primo accesso via codice iniziale + impostazione password personale.
- Gestione utenti gerarchica con permessi differenziati per ruolo (`canManageTargetRole`).
- **Aggiornamenti quasi in tempo reale** su calendario turni/corsi, Sostituzioni/Corsi disponibili,
  Fabbisogno e richieste di cancellazione: polling leggero (`hooks/usePolling.js`) con pausa su tab
  non visibile e refetch immediato al ritorno di focus/chiusura modali, vedi sezione dedicata.
- **Fabbisogno di personale per area operativa** (solo aree Turni): regole fisse (ricorrenti per
  giorno della settimana, con le 4 modalità di modifica per singola occorrenza) e singole
  (esigenza straordinaria per una data), calcolo automatico della copertura confrontando il
  fabbisogno con i turni già assegnati (sovrapposizione oraria), generazione manuale delle
  Sostituzioni mancanti (riusa il flusso Sostituzioni esistente), prevenzione di fabbisogni
  duplicati con conferma esplicita. Turni sovrapposti nello stesso orario/area ora si affiancano
  nel calendario invece di nascondersi (layout a corsie riusato dai corsi). **Copertura integrata
  direttamente nel calendario turni** (chip per occorrenza in una riga dedicata sopra la griglia
  oraria, stile visivo distinto dai turni, espandibile per vedere gli assegnati ed accedere alla
  modifica): non più un pannello separato, vedi sezione dedicata.
- **Sedi e aree operative configurabili dal Dirigente**: CRUD sedi (con orari calendario
  personalizzati), CRUD aree operative per sede (con motore di calendario a scelta, riordino),
  assegnazione dipendenti a una o più aree, dashboard dipendente/manager costruite dinamicamente
  dalle aree esistenti (nessuna dashboard hardcoded per "tipo di dipendente").
- Calendario turni: fissi ricorrenti (regola settimanale o giornaliera), singoli, Sostituzioni
  (pubblicate senza dipendente, primo dipendente compatibile dell'area che accetta se le
  aggiudica — claim atomico via `UPDATE ... WHERE user_id IS NULL`, vedi sezione dedicata),
  scoped per area operativa, con intervallo orario personalizzabile per sede.
- Cancellazione turno: **sempre** su richiesta con approvazione di responsabile/dirigente
  (nessuna cancellazione automatica, qualunque sia il tipo o quanto manchi alla data). Per un
  turno fisso ricorrente si cancella solo la singola occorrenza richiesta (tabella
  `shift_exceptions`), la serie resta intatta; per un turno singolo/Sostituzione la riga resta in
  tabella con `status='cancelled_approved'` invece di essere eliminata. L'approvazione genera
  sempre automaticamente una nuova Sostituzione collegata, nella stessa area (vedi sezione dedicata).
- Calendario Corsi: stessa logica fisso/singolo/disponibile dei turni, ma con supporto a corsi
  sovrapposti nello stesso orario mostrati **affiancati** (algoritmo di layout a "corsie" in
  `frontend/src/utils/courseLayout.js`), non nascosti l'uno sull'altro. Gestione CRUD completa
  lato dirigente/responsabile, incluso drag & drop per spostare un corso su un altro giorno
  (nativo HTML5, nessuna libreria). I corsi fissi ricorrenti **non** sono trascinabili
  (l'occorrenza non è una riga a sé: si modificano dal modulo, che agisce sull'intera serie).
  "Corsi disponibili" con claim riservato a chi è assegnato all'area (verificato a DB, non nel
  JWT), scoped per area come i turni.
- Calendario unificato a tab (`TabbedCalendar.jsx`, componente generico riutilizzabile): le tab
  si costruiscono dinamicamente dalle aree operative disponibili (una per area), non più
  hardcoded turni/corsi.
- Statistiche ore lavorate: vista aggregata per manager, vista self-service per il dipendente
  (stesso componente `HoursStats.jsx`, backend forza `filterUserId = req.user.id` quando
  `role==='user'`).
- Multi-azienda (SaaS): Super Admin, entità Società, isolamento dati completo, migrazione
  automatica e non distruttiva dei dati "single-tenant" preesistenti verso una società di
  default.
- `PROJECT_CONTEXT.md` (questo file) come memoria persistente di progetto.

## Funzionalità in sviluppo

**Sistema avanzato di sostituzioni** (vedi sezione dedicata per il piano completo a 7 fasi). Stato:
- **Fase 1 — Contratti dei dipendenti**: ✅ completata e testata in locale (2026-07-08). Migrazione
  produzione della tabella `user_contracts` da eseguire dopo conferma esplicita dell'utente.
- **Fase 2 — Disponibilità dichiarate**: ✅ completata e testata in locale (2026-07-08). Migrazione
  produzione della tabella `user_availability` da eseguire (con quella di `user_contracts`) dopo
  conferma esplicita dell'utente.
- **Fase 3 — Notifiche in-app**: ✅ completata e testata in locale (2026-07-08). Migrazione
  produzione della tabella `notifications` da eseguire (con le due precedenti) dopo conferma
  esplicita dell'utente.
- **Fase 4 — Motore di compatibilità + "Trova sostituzione"**: ✅ completata e testata in locale
  (2026-07-08). Nessuna migrazione (fase sola lettura).
- **Fase 5 — Proposte mirate**: ✅ completata e testata in locale (2026-07-08). Migrazione produzione
  della tabella `substitution_proposals` da eseguire (con quelle delle Fasi 1–3) dopo conferma
  esplicita dell'utente.
- **Fase 6 — Opt-out "Non partecipare" + storico per il motore**: ✅ completata e testata in locale
  (2026-07-08). Migrazione produzione della tabella `substitution_optouts` da eseguire (con le altre
  pendenti) dopo conferma esplicita dell'utente.
- **Fase 7 — Escalation lazy (senza cron)**: ✅ completata e testata in locale (2026-07-08). Migrazione
  produzione della colonna `companies.substitution_escalation_hours` da eseguire (con le tabelle
  pendenti) dopo conferma esplicita dell'utente. **Piano a 7 fasi completato.**

## Funzionalità future previste

- **Abbonamenti/piani per società**: ✅ **infrastruttura costruita** (Step 0–1 dell'iniziativa
  Multi-tenant SaaS, vedi sezione "Layer SaaS: piani commerciali ed entitlements"). Tabelle `plans`/
  `company_subscriptions` + `services/entitlements.js` + CRUD Super Admin. Restano da fare:
  enforcement dei limiti, feature gating, RBAC granulare (Step 2–7).
- **Gestione pagamenti** legata agli abbonamenti (Step 8 — billing Stripe, iniziativa separata dopo
  validazione commerciale; `company_subscriptions.external_ref`/`current_period_end` già predisposti).
- **Limiti per piano** (es. numero massimo di dipendenti/società/sedi, funzionalità premium):
  struttura pronta (`plans.limits`/`features` JSONB, configurabili dal Super Admin), enforcement nei
  punti di creazione ancora da agganciare (Step 2–3).
- **Statistiche di utilizzo** della piattaforma (oltre ai conteggi aggregati già presenti in
  `getPlatformStats`).
- **UI di storico** per i turni con `status='cancelled_approved'`: oggi il dato persiste nel DB
  ma è consultabile solo via query diretta, non da una schermata dedicata.
- **Vista calendario multi-area simultanea**: oggi `TabbedCalendar` mostra un'area per volta;
  si potrebbe aggiungere una tab "Tutte le aree" che impila le viste (idea già annotata in
  `EmployeeDashboard.jsx` come possibile estensione, non ancora implementata per le dashboard
  manager).
- Possibile evoluzione: permettere al Super Admin di eliminare (non solo disattivare) una
  società — oggi non esiste un endpoint DELETE per `companies`, la disattivazione è l'unico
  meccanismo "soft" previsto, deliberatamente (coerente con l'assenza di hard-delete altrove nel
  sistema).
- **Assegnazione esclusiva della copertura del fabbisogno**: oggi un turno può coprire più
  fabbisogni sovrapposti contemporaneamente (vedi sezione "Fabbisogno di personale", limite noto
  accettato deliberatamente). Se emergono casi reali problematici, introdurre una logica di
  assegnazione esclusiva con priorità alla fascia più ristretta (già progettata, non implementata).
- **Fabbisogno di personale anche per aree Corsi**: oggi limitato alle aree `calendar_mode='shifts'`
  (nessun caso d'uso richiesto per gli istruttori). Estendibile in futuro se richiesto.

## Decisioni architetturali prese

- **Aggiornamenti tra utenti via polling leggero, non WebSocket**: scelta deliberata dato l'hosting
  Vercel serverless (nessun server Node persistente su cui appoggiare un vero WebSocket senza un
  servizio terzo tipo Pusher/Ably). Hook unico e riutilizzabile (`hooks/usePolling.js`) applicato
  solo ai componenti con dati condivisi tra utenti, con pausa su tab non visibile e refetch
  immediato su focus/chiusura modali — vedi sezione dedicata "Aggiornamenti quasi in tempo reale".
  Non introdurre un vero canale realtime senza discuterne: cambierebbe l'infrastruttura di hosting.
- **Niente ORM**: query SQL dirette con `pg`, parametrizzate. Ogni controller ha le proprie query,
  niente layer di astrazione condiviso tra domini (turni e corsi hanno controller/service
  *paralleli ma separati*, non un modulo generico condiviso — scelta deliberata per permettere
  alle due logiche di divergere in futuro senza intaccarsi a vicenda).
- **Due motori di calendario riusati, non fusi, per le aree operative**: ogni area sceglie tra
  `calendar_mode='shifts'` o `'courses'` invece di un terzo motore generico. Scelta deliberata:
  molto meno rischiosa di una fusione completa, riusa integralmente la logica Sostituzioni/
  cancellazioni già costruita su `shifts`. Non introdurre un modello di dati unificato per
  turni+corsi senza ripensare da zero cancellazioni/Sostituzioni/storico.
- **L'area operativa sostituisce il concetto di "ruolo richiesto"**: da quando ogni turno
  appartiene sempre a un'area, non serve più un campo separato per "chi può accettare una
  Sostituzione" (vedi sezione dedicata). Non reintrodurre un campo `requiredCategory`/
  `requiredArea` esplicito: sarebbe ridondante con `area_id`.
- **Fabbisogno di personale come livello puramente additivo sopra i turni**: `staffing_requirements`/
  `staffing_requirement_exceptions` sono tabelle nuove e isolate, `shifts.requirement_id` è
  nullable senza alcun vincolo NOT NULL/backfill. Nessuna modifica al comportamento di
  `createShift`/`updateShift`/`claimShift`/`listAvailableShifts`/`approveRequest`: il fabbisogno
  *legge* la copertura riusando `getExpandedShifts` e *scrive* nuove Sostituzioni riusando lo
  stesso pattern di INSERT già in `cancellationController.approveRequest`, non introduce percorsi
  di scrittura alternativi sui turni.
- **Algoritmo di layout a corsie (`utils/courseLayout.layoutCourses`) riusato invariato tra corsi e
  turni**: era già generico (opera solo su `startTime`/`endTime`), non è stato duplicato né
  modificato. Se serve un domani differenziare il comportamento tra i due domini, valutare prima
  se estendere la funzione con parametri opzionali piuttosto che biforcarla.
- **JWT stateless, nessuna verifica a DB ad ogni richiesta**: `role`, `companyId` (e per i
  session token anche `username`) sono presi per buoni dal JWT in ogni middleware/controller.
  Le eccezioni deliberate sono verifiche puntuali dove il dato non può stare nel JWT (es.
  appartenenza a un'area per il claim di turno/corso, verificata a DB ad ogni richiesta perché
  cambierebbe raramente ma con conseguenze di sicurezza se stale).
- **Frontend "dumb", scoping lato backend**: la UI non sa nulla di società/isolamento dati; ogni
  filtro è applicato dal backend tramite `req.user.companyId` (e ora anche `areaId`/`sedeId`
  verificati contro la società di chi opera). Questo ha permesso di aggiungere sia il multi-tenant
  sia le aree operative **senza logica di autorizzazione duplicata lato client**.
- **Pattern "type-aware" ripetuto per turni e corsi**: entrambi usano lo stesso schema di tipi
  (`fixed`/`mobile`/`volante`), la stessa funzione di espansione ricorrenze
  (`expandRecurrenceDates` in `utils/recurrence.js`, condivisa), e la stessa struttura di
  controller (`validateTypeFields`, CRUD, `available` + `claim`, ora entrambi scoped per
  `area_id`). Se si modifica la logica di un tipo in uno dei due domini, valutare se la modifica
  ha senso anche nell'altro (ma non sono automaticamente sincronizzati: sono file separati per
  design, vedi sopra).
- **Autenticazione unica per primo accesso e login standard**: stesso endpoint
  `POST /api/auth/login`, il backend distingue in base a `must_change_password`.
- **`toSafeUser` duplicata** in `authController.js` e `userController.js` (non condivisa): due
  fonti di verità per la stessa proiezione dati. **Fonte già nota di bug** (vedi sotto): quando si
  aggiunge un campo a un utente che deve arrivare al frontend, va aggiunto **in entrambe le
  copie** — per il campo `areas[]` si è invece introdotta `services/userAreas.js` come unica
  fonte di verità per quella specifica proiezione, chiamata da entrambi i controller, proprio per
  non ripetere lo stesso errore.

## Logiche importanti che non devono essere modificate senza motivo

- **Cancellazione turno sempre con approvazione**: nessun turno si cancella automaticamente,
  indipendentemente dal preavviso. Questo è stato un cambio di requisito esplicito dell'utente
  (in precedenza esisteva una soglia di giorni), non tornare alla logica precedente.
- **Approvazione cancellazione non elimina più il turno originale** (turni singolo/Sostituzione):
  passa a `status='cancelled_approved'` e resta in tabella come storico; solo `getExpandedShifts`
  lo nasconde dal calendario attivo. Non tornare a un `DELETE` diretto: romperebbe lo storico
  richiesto esplicitamente dall'utente. Per i turni fissi resta invariato l'uso di
  `shift_exceptions` (la serie non viene mai toccata).
- **`type='volante'` a DB resta invariato per le Sostituzioni**: la UI non usa più il termine
  "turno volante", ma il valore nel database non cambia (stessa convenzione già adottata per
  "Turno mobile" → "Turno singolo": si rinomina solo l'etichetta, mai il dato salvato).
- **`shifts.area_id`/`courses.area_id` obbligatori e mai dedotti**: ogni turno/corso appartiene
  sempre a un'area fin dalla creazione, esattamente come `company_id` non si deduce da
  `user_id`/`instructor_id` (stesso motivo: un turno/corso "disponibile" non ha ancora un
  dipendente da cui risalire). Non rimuovere questi campi per "semplificare".
- **Il "ruolo richiesto" di una Sostituzione è l'area, non un campo separato**: non reintrodurre
  `requiredCategory`/un nuovo `requiredArea` esplicito nella UI — sarebbe ridondante e
  incoerente col modello (vedi sezione "Gerarchia Sedi → Aree operative").
- **Il filtro di disponibilità delle Sostituzioni (area + sovrapposizione) è solo UX**:
  `claimShift`/`claimCourse` devono sempre riverificare entrambi i controlli lato server prima di
  assegnare. Non rimuovere questo doppio controllo per "semplificare".
- **Generazione delle Sostituzioni da un buco di fabbisogno è sempre manuale**: nessuna creazione
  automatica al solo apparire di uno scoperto, decisione esplicita dell'utente. Non aggiungere un
  cron/trigger automatico senza riconferma.
- **Copertura del fabbisogno non esclusiva tra regole sovrapposte** (decisione esplicita
  dell'utente per questa versione): un turno può contare come copertura di più fabbisogni
  sovrapposti nello stesso orario/area. Non introdurre "di nascosto" un'assegnazione esclusiva in
  una modifica futura: cambierebbe il significato dei numeri già mostrati al dirigente, va
  discusso prima.
- **Fabbisogni duplicati (stessa area/data-o-giorno/orario esatto) bloccati salvo conferma
  esplicita**: non rimuovere questo controllo per "semplificare" la creazione — è un requisito
  esplicito dell'utente per evitare fabbisogni doppi creati per errore.
- **Gestione sedi/aree riservata al Dirigente**: i Responsabili possono selezionare/leggere ma
  non creare/modificare/eliminare sedi o aree. Non allargare questo permesso senza riconferma
  esplicita (decisione presa insieme all'utente durante la progettazione).
- **Nessun hard-delete di sedi/aree con dati collegati**: coerente con l'assenza di hard-delete
  distruttivi altrove nel sistema (companies, cancellation_requests). Usare `isActive=false`.
- **Cambio di `calendar_mode` di un'area bloccato se ha già turni/corsi**: altrimenti i dati
  esistenti diventerebbero incoerenti con il nuovo motore di calendario.
- **`company_id` diretto su `shifts`/`courses`/`cancellation_requests`**: vedi spiegazione sopra,
  non derivarlo per JOIN da `user_id`/`instructor_id` (si romperebbero i turni/corsi
  "disponibili").
- **Username/email univoci a livello di piattaforma**, non per società: necessario per il login
  senza selettore azienda.
- **Piani ed entitlements letti a DB, MAI nel JWT** (layer SaaS): un cambio di piano/limite/feature
  deve valere subito, non alla scadenza del token (8h). Non spostare le entitlements nel JWT "per
  performance" — la cache TTL in `services/entitlements.js` è il compromesso previsto. Eccezione
  puntuale e motivata al modello "fidati del JWT", analoga a quella già ammessa per l'appartenenza
  alle aree nel claim.
- **Zero valori commerciali hardcoded** (layer SaaS, vincolo esplicito dell'utente): limiti e feature
  dei piani vivono in `plans`/`company_subscriptions` (JSONB), modificabili dal Super Admin a runtime.
  Il codice conosce solo la *semantica* (assente/null = illimitato; feature assente/true = abilitata),
  mai i valori. Non reintrodurre soglie/limiti fissi nel codice.
- **Isolamento dati = `company_id`, non i piani**: il gating dei piani è un confine commerciale
  (fail-open a "illimitato" se manca la subscription). La sicurezza multi-tenant resta l'isolamento
  per `company_id` (404 cross-tenant). Non confondere i due livelli: un errore di feature-gating
  espone al più una funzione non pagata, mai i dati di un'altra società.
- **`npm run test:isolation` / `test:saas` sono reti di regressione, non decorative**: ogni nuovo
  endpoint scoped per società va aggiunto ai probe cross-tenant; ogni nuovo limite/feature/permesso al
  relativo harness. Non rimuoverle né lasciarle marcire quando si aggiungono rotte.
- **RBAC: comportamento invariato per default, matrice = gate storico**: la matrice default in
  `config/permissions.js` DEVE replicare il gate della rotta che sostituisce (es. `cancellations.approve`
  default = admin+dirigente, come il vecchio `requireManager`). Non cambiare un default "per comodità":
  cambierebbe silenziosamente chi può fare cosa in tutte le società senza override.
- **Dirigente e Super Admin non sono soggetti a override permessi** (pavimento di sicurezza in
  `requirePermission`): non permettere di revocare al Dirigente i propri poteri sulla società.
- **Niente ruoli custom per società in V1** (vincolo esplicito): la personalizzazione passa da
  permessi + override sui 4 ruoli esistenti. Non introdurre una tabella di ruoli per tenant senza
  riconferma.
- **Feature gating solo lato manager per il motore sostituzioni**: le rotte lato dipendente
  (`/api/proposals/*`, `available`/`claim`) NON vanno gated con `substitutionEngine`, per non
  intrappolare proposte già inviate se la feature venisse disattivata. Gate solo su candidates/
  proposals lato manager.
- **Billing spento di default e senza prezzi hardcoded** (Step 8): `BILLING_ENABLED=false` di
  default; il prezzo vive nel provider e si mappa via `plans.external_price_ref`. Non introdurre
  prezzi/importi nel codice, non attivare il billing reale senza conferma esplicita (env di
  produzione + chiavi Stripe + webhook registrato). Il webhook muta lo stato **solo** dopo verifica
  della firma HMAC.
- **Il corpo grezzo del webhook billing è intenzionale**: `express.raw` sul solo
  `/api/billing/webhook` prima di `express.json` serve alla verifica della firma. Non rimuoverlo né
  spostare il parsing JSON prima di esso.
- **`npm run db:reset` non va mai eseguito contro il database di produzione**: cancella utenti e
  dati applicativi (tranne dirigente "di bootstrap" e super admin). Va usato solo in locale/dev.
  `npm run setup` (che lo include) è anch'esso solo per bootstrap locale.
- **Migrazioni sempre idempotenti in `schema.sql`**, mai riscritte da zero: deve poter girare
  ripetutamente sia su DB vuoti sia sul DB di produzione già popolato, senza perdita dati. Ordine:
  aggiungi colonna nullable → backfill → vincoli NOT NULL/CHECK → indici.
- **Super Admin non gestisce dati operativi di una società specifica** (decisione esplicita
  dell'utente): non aggiungere endpoint che permettano al super admin di modificare
  sedi/aree/turni/corsi/dipendenti di una singola società senza prima riconfermare che questo
  vincolo debba cambiare.
- **Corsi fissi ricorrenti non trascinabili** (drag & drop) nel Calendario Corsi: l'occorrenza
  condivide la riga con tutta la serie, uno spostamento via drag interpretato come "sposta solo
  questa occorrenza" sarebbe fuorviante. Si modificano solo dal modulo di modifica.
- **Password/segreti non vanno mai scritti in file versionati** (schema.sql, questo file, commit):
  le credenziali reali (dirigente, super admin, `JWT_SECRET`, connection string del DB di
  produzione) vivono solo in variabili d'ambiente (`.env` locale, dashboard Vercel) o vengono
  comunicate all'utente in chat, mai salvate nel repository.

### Sistema avanzato di sostituzioni (Fasi 1–4) — invarianti da non modificare senza motivo

- **Il motore di compatibilità NON assegna mai automaticamente** (`substitutionMatcher.js`/
  `GET /api/shifts/:id/candidates` sono di sola lettura): produce solo una classifica di
  suggerimento. La decisione resta del responsabile. Non trasformarlo in un assegnatore automatico.
- **Unica esclusione rigida dal ranking = la sovrapposizione oraria** (stesso vincolo di
  `claimShift`). Tutto il resto (contratto, disponibilità, carico, storico) è *punteggio*. In
  particolare, **le violazioni contrattuali RETROCEDONO il candidato con motivazione rossa, non lo
  escludono**: non trasformarle in un'esclusione senza discuterne (il responsabile deve poter
  decidere in deroga).
- **Assenza di disponibilità dichiarata = "ignota", non incompatibile**: un candidato senza fasce in
  `user_availability` resta in classifica con motivazione neutra "da verificare". Non trattarla come
  indisponibilità.
- **Le notifiche sono best-effort e non bloccanti**: ogni `notify*` di `notificationService.js`
  cattura i propri errori e non li propaga — un problema di invio non deve MAI far fallire l'azione
  che le innesca (claim, approvazione, creazione turno...). Non spostare le chiamate `notify*` in un
  punto in cui un loro errore possa interrompere il flusso principale.
- **Destinatari "responsabili" delle notifiche**: `resolveManagerRecipients` prova prima i manager
  collegati all'area (`user_areas`) e in mancanza ricade su tutti gli `admin`/`dirigente` della
  società. Questa struttura è predisposta per un futuro legame area↔responsabile: non sostituirla con
  un invio indiscriminato a tutti "per semplificare".
- **Il dipendente possiede le proprie disponibilità**: solo lui le modifica (`PUT
  /api/users/:id/availability` è self-only); il responsabile è in sola lettura. Non permettere al
  manager di editarle senza riconferma.
- **`user_contracts`/`user_availability` senza `company_id`** (a differenza di `notifications`):
  `user_id` è sempre valorizzato, la società si ricava per JOIN e l'isolamento è nel controller. Non
  aggiungere `company_id` a queste due "per coerenza": è ridondante (vedi ragionamento su
  `shifts`/`courses`, che invece lo hanno perché `user_id` può essere NULL).
- **Ogni fase del sistema di sostituzioni è additiva**: non ha modificato la logica di
  `claimShift`/`listAvailableShifts`/`approveRequest`/`createShift` — solo aggiunte in coda
  (notifiche best-effort) o nuovi endpoint di sola lettura. Mantenere questa proprietà nelle fasi
  successive (6–7).
- **Claim atomico = un'unica funzione condivisa** (`shiftController.assignVolanteToUser`): sia il
  claim autonomo (`claimShift`) sia l'accettazione di una proposta mirata (Fase 5) passano di qui —
  identici doppi controlli (appartenenza area + assenza sovrapposizione) e stessa UPDATE condizionale
  atomica. **Non duplicare né divergere**: qualunque nuovo percorso che assegni una Sostituzione a un
  dipendente deve riusare questo helper, non reimplementare la logica. `claimShift` è ora un wrapper a
  comportamento invariato: non "ottimizzarlo" reintroducendo la logica inline.
- **Le proposte mirate NON sono esclusive e NON assegnano**: sono un canale aggiuntivo sopra
  l'autonomia dei dipendenti. La stessa Sostituzione resta accettabile dal pannello "Sostituzioni
  disponibili"; una proposta si concretizza solo quando il dipendente la accetta (mai in automatico).
  Non trasformare l'invio di una proposta in un'assegnazione diretta del turno.
- **L'opt-out "Non partecipare" NON è un divieto di lavorare**: blocca proposte e notifiche broadcast
  e retrocede il candidato nel motore (motivo rosso, **resta visibile**), ma NON tocca
  `listAvailableShifts` — il dipendente può sempre reclamare autonomamente una Sostituzione se cambia
  idea. Significa "non sollecitarmi", non "non posso". Non trasformarlo in un filtro rigido né in
  un'esclusione silenziosa dalla classifica.
- **Lo storico del motore non riconta le accettazioni**: le proposte accettate diventano turni
  `volante` con `user_id` (già contati come "accettate"); da `substitution_proposals` il motore prende
  solo i **rifiuti**. Non sommare `substitution_proposals.status='accepted'` alle accettazioni: sarebbe
  un doppio conteggio.
- **Escalation SENZA cron, lazy e idempotente**: il rilevamento vive dentro
  `notificationController.listNotifications` (gated ai manager, best-effort) — **non** introdurre cron,
  WebSocket o servizi terzi (vincolo hosting serverless, decisione architetturale). L'idempotenza dipende
  dal `dedupe_key='escalation:<shiftId>'` + indice unico parziale: non generare escalation con
  `dedupe_key` nullo (creerebbe duplicati a ogni poll). L'escalation **avvisa i responsabili, non
  riassegna** il turno.
- **Regole aziendali = Dirigente, non Super Admin né Responsabile**: `substitution_escalation_hours`
  (e future regole di escalation) si configurano da `/api/company/settings` (`requireDirigente`). Il
  Super Admin resta sull'anagrafica di piattaforma (`/api/companies/*`), il Responsabile gestisce
  l'operatività ma non modifica le regole. Non spostare questa configurazione sotto il Super Admin "per
  comodità": è una separazione di ruoli richiesta esplicitamente dall'utente.

### Email Automation (E1–E7) — invarianti da non modificare senza motivo

- **Il canale email è best-effort e non bloccante**, come le notifiche in-app: `emailChannel` e le
  `notify*` catturano i propri errori e non li propagano. Un problema di invio non deve MAI far fallire
  l'azione che lo genera (creazione turno, approvazione, claim...). Non spostare gli invii in un punto
  dove un loro errore possa interrompere il flusso principale.
- **Evento separato dal canale**: `notificationService` è il livello eventi; i canali (in-app,
  `emailChannel`, e in futuro WhatsApp/SMS/Push) sono moduli intercambiabili. Aggiungere un canale =
  un modulo fratello + una riga di aggancio negli eventi, senza toccare la logica di evento.
- **Solo email mirate, non broadcast**: `notifySubstitutionAvailable` (nuova Sostituzione a tutta
  l'area) resta **solo in-app**. Non trasformarlo in email di massa: sarebbe spam e brucerebbe quota.
- **Email di verifica/reset = transazionali, non filtrate**: `deliverTransactionalEmail`
  (`gated=false`) bypassa sia il gate "solo verificate" sia le preferenze utente — devono partire anche
  verso indirizzi non verificati (è ciò che li verifica). La **demo resta soppressa** anche per queste.
- **Demo: pipeline identica, invio soppresso** (`is_demo` → `email_log` `suppressed`). Nessun codice
  email separato per la demo. Non aggiungere invii reali per società demo (bounce su indirizzi fittizi).
- **Email Actions: mutazione SOLO via POST dopo conferma**. Il link nell'email è un GET a una pagina
  che descrive l'azione; l'esecuzione è un POST esplicito che consuma un token monouso. Non introdurre
  endpoint che eseguano l'azione su GET: i client email prefetchano i link e la innescerebbero. Stesso
  principio di `verify-email`. Ri-verificare sempre stato entità + autorizzazione all'esecuzione.
- **Riuso dei core, nessuna divergenza**: le Email Actions passano dagli stessi core del percorso HTTP
  (`acceptProposalForUser`/`declineProposalForUser`/`approveRequestCore`/`rejectRequestCore`), come già
  per `assignVolanteToUser`. Qualunque nuovo percorso che accetti/approvi deve riusare questi core.
- **Le preferenze notifiche riguardano solo il canale email di evento**, non le notifiche in-app
  (registro completo) né le transazionali. Default (assenza di riga) = "tutte" (retrocompatibile).

## Problemi risolti e problemi ancora aperti

### Risolti
- **Login in produzione falliva silenziosamente**: causa combinata di `CORS_ORIGIN` mal
  configurato (con un path `/login` incluso per errore) e migrazione del DB di produzione mai
  eseguita dopo il primo deploy. Risolto correggendo `CORS_ORIGIN` e lanciando `npm run migrate`
  + `npm run setup` contro il DB di produzione. **Da ricordare**: dopo ogni modifica a
  `schema.sql`, la migrazione va sempre rilanciata anche in produzione (mai automatica al
  deploy).
- **Dashboard istruttore mostrava sempre "Bagnino"**: `authController.js` aveva una propria
  `toSafeUser` che non includeva `category` (poi anche `companyId`), diversa da quella di
  `userController.js`. Causa risolta strutturalmente introducendo `services/userAreas.js` come
  unica fonte di verità per la proiezione "aree di un utente", condivisa da entrambi i
  controller — vedi decisione architetturale dedicata.
- **Migrazioni schema fallite per ordine errato delle istruzioni**: capitato più volte durante lo
  sviluppo del multi-tenant e delle Sedi/Aree (indice creato prima della colonna, vincolo CHECK
  aggiunto prima del backfill). Vedi la regola sull'ordine delle migrazioni sopra.
- **`CoursesCalendar` chiamava `GET /api/users` anche in modalità sola lettura** (dipendente):
  regressione introdotta durante il refactor per le aree operative (rimossa per errore la
  guardia `if (isManage)`), causava 403 per i dipendenti. Risolta ripristinando la guardia:
  `listUsers` (riservato a `requireManager`) va chiamato solo in `mode='manage'`.

### Aperti
- **Nessuna UI di storico** per i turni con `status='cancelled_approved'`: il dato persiste nel
  DB (non viene più eliminato) ma oggi è consultabile solo via query diretta, non da una schermata
  dedicata. Possibile estensione futura se il cliente lo richiede esplicitamente.
- **Sostituzione generata da cancellazione approvata non collegata a `requirement_id`**: trovato
  durante lo smoke test in produzione del fabbisogno. Se un dipendente il cui turno copriva un
  fabbisogno cancella (approvato) e il fabbisogno di quell'occorrenza aveva già delle Sostituzioni
  generate via "genera sostituzioni" (`openSlots`), la nuova Sostituzione creata da
  `cancellationController.approveRequest` (collegata via `origin_shift_id`, non `requirement_id`)
  **non** viene conteggiata in `openSlots`: `missingSlots` risulta quindi sovrastimato di 1 in
  questo scenario specifico (occorrenza con sia una copertura da fabbisogno sia una cancellazione
  sulla stessa occorrenza). Cliccare di nuovo "Genera sostituzioni" in quel caso crea un posto in
  più del reale necessario (nessuna perdita dati, solo un'eventuale Sostituzione in eccesso che il
  dirigente può eliminare manualmente). Non collegato di proposito in questa versione per non
  accoppiare `cancellationController` alla logica di fabbisogno senza discuterne prima con
  l'utente; da valutare se longevo/frequente nell'uso reale.

## Come continuare lo sviluppo

1. Leggi questo file per intero.
2. Verifica lo stato reale del codice per i punti rilevanti alla modifica richiesta (questo file
   riassume le decisioni e l'architettura, ma il codice sorgente resta l'unica fonte di verità
   sul comportamento esatto — non fidarti ciecamente di un dettaglio qui se il codice dice altro:
   in quel caso aggiorna questo file).
3. Per modifiche allo schema DB: segui il pattern idempotente esistente in `schema.sql`, testa in
   locale (`npm run migrate` due volte di fila, deve essere no-op la seconda), poi in produzione
   con la stessa connection string usata finora (mai `db:reset` in produzione).
4. Per nuove aree operative o nuovi tipi di calendario: usa i punti di estendibilità già pensati
   (il Dirigente crea aree via UI, nessun codice nuovo richiesto per una nuova "categoria" di
   dipendente; per un terzo motore di calendario oltre a `shifts`/`courses`, valuta prima se è
   davvero necessario — i due esistenti coprono la stragrande maggioranza dei casi).
5. Dopo la modifica: aggiorna la sezione [Changelog](#changelog--aggiornamenti) qui sotto.

## Sicurezza: classificazione dati e cifratura (predisposizione)

Introdotta con l'**iniziativa Sicurezza** (fasi S1–S7, vedi `IMPLEMENTATION_PROGRESS.md`). Questa
sezione classifica i dati gestiti e definisce l'approccio alla cifratura at-rest.

**Classificazione**:
- **Dati operativi** (non sensibili di per sé): turni, corsi, aree, sedi, fabbisogni, disponibilità,
  orari, ruoli. Restano in chiaro: servono a query, filtri e calcoli continui.
- **Credenziali/segreti**: `password_hash` (bcrypt, mai reversibile), `initial_code` (codice
  monouso di primo accesso), `auth_tokens.token_hash` (solo hash SHA-256). **Già protetti** per
  costruzione, non richiedono cifratura reversibile.
- **Dati personali sensibili**: `users.email`, `users.phone`, `companies.email/phone/address`,
  `user_contracts.note`/`custom_config` (note libere che possono contenere informazioni riservate).

**Approccio alla cifratura** (modulo `backend/src/utils/crypto.js`, AES-256-GCM, chiave da env):
- **`email` resta in chiaro** — scelta funzionale, **non** dimenticanza: è usata per il lookup di
  login (unicità globale) e per la futura verifica email; cifrarla romperebbe vincoli `UNIQUE` e
  ricerche. È protetta da TLS in transito, controllo accessi e isolamento multi-tenant.
- **Candidati primari alla cifratura**: `phone` e le note contrattuali (free-text, nessuna ricerca
  su di essi). Il modulo supporta l'adozione **graduale** (decrypt restituisce invariati i valori
  ancora in chiaro) e la **rotazione delle chiavi** (ID chiave nel formato del valore cifrato).
- **Stato attuale (S6)**: il modulo è **predisposto e testato ma NON ancora applicato** ad alcun
  campo — decisione esplicita dell'utente (l'applicazione tocca dati reali e va fatta in una fase
  dedicata, su conferma). La chiave (`DATA_ENCRYPTION_KEY`) è gestita **solo via env**, mai nel
  codice. Non applicare la cifratura a un campo "di nascosto" in una modifica futura senza
  discuterne: cambia il modo in cui quel dato va letto/scritto ovunque.

## Demo Framework (completato, fasi D1–D6)

Funzionalità **permanente** dell'architettura: Planivo può generare ambienti dimostrativi
realistici per qualsiasi settore. Filosofia: il software resta unico, **cambiano solo i dati
caricati, mai la logica** — il Demo Framework è un layer sopra il gestionale esistente.
Piano a 6 fasi **completato** (2026-07-10, tutto verificato in locale; migrazione produzione di
`is_demo`/`demo_state`/`personas` da eseguire su conferma). Dettaglio fase per fase e riepilogo
finale in `IMPLEMENTATION_PROGRESS.md` → "Iniziativa: Demo Framework".

Architettura: **Framework → Scenario → Dataset → Tour guidato → Software (invariato)**.

- **Isolamento (decisione vincolante)**: le società demo vivono nello **stesso database** delle
  reali, flaggate con `companies.is_demo` (default FALSE). Riusano integralmente l'isolamento
  multi-tenant per `company_id`: una sessione demo è un normale utente di una società demo.
  Guardia unica `demo/framework/guard.js:assertDemoCompany` = **chokepoint anti-dati-reali**,
  prima istruzione di OGNI percorso di scrittura del framework (loader, reset, azioni simulate);
  il reset cancella solo con predicato ridondante `AND is_demo=TRUE`. Non aggiungere percorsi di
  scrittura demo che aggirino questa guardia.
- **Framework generico, zero logica di settore** (`backend/src/demo/framework/`): config (env
  `DEMO_MODE`/`DEMO_RESEED_AFTER_DAYS`/`DEMO_PERSONA_PASSWORD`), guard, rng deterministico seedato,
  anchor (date come offset dal "giorno 0"), registry, loader, reset. Tutta la conoscenza specifica
  (ristorante, hotel, RSA, ...) vive nei moduli scenario (`backend/src/demo/scenarios/<id>/`):
  **aggiungere uno scenario = una cartella + una riga in `registry.js`**, il framework non si tocca.
- **Contratto scenario**: `{ id, name, version, personas[], logoPlaceholder, tours[], build() }`;
  `build({ anchorDate, rng, helpers })` è una funzione PURA che restituisce un dataset a sezioni
  generiche con ref simbolici e date a offset (documentato per esteso in testa a
  `demo/framework/loader.js`). Version bump dello scenario ⇒ ri-caricamento lazy.
- **Caricamento in transazione unica** (`pool.connect()` + BEGIN/COMMIT + `pg_advisory_xact_lock`
  per scenario): o l'ambiente demo è completo, o non esiste. È il **primo uso di transazioni nel
  progetto**, deliberatamente confinato al loader demo — i controller esistenti restano a query
  autonome, non estendere le transazioni altrove senza discuterne.
- **Re-anchoring lazy senza cron** (coerente col vincolo serverless, stesso principio
  dell'escalation Fase 7): stato in tabella `demo_state` (`anchor_date`, `dataset_version`,
  `tour_context` coi ganci dei tour risolti in id reali); al demo-login, ambiente stantio
  (`DEMO_RESEED_AFTER_DAYS`, default 7) o versione superata ⇒ reset + reload con ancora = oggi.
- **Demo = dominio proprio** (`/api/demo/*`), attivato da env `DEMO_MODE=true`, **non legato al
  Super Admin** (che per vincolo non gestisce dati operativi): il framework si auto-amministra.
  Default sicuro: demo spenta ⇒ rotte demo rispondono 404, il bottone "Prova la demo" non compare.
- **Utenti demo**: username con prefisso obbligatorio `demo-` (validato dal loader — username/email
  sono UNIQUE di piattaforma, il namespace riservato evita collisioni con account reali),
  `must_change_password=FALSE`, un'unica password bcrypt per load (casuale in produzione, mai
  comunicata: si entra solo via demo-login; `DEMO_PERSONA_PASSWORD` per ispezione in locale).
- **Voci demo senza funzionalità corrispondente nel software** (decisione con l'utente): ferie →
  richieste di cancellazione + opt-out con nota "Ferie"; logo aziendale → placeholder solo frontend
  nel metadata dello scenario (nessuna colonna DB); gestione documenti esclusa dalla v1.

## Sezione Report (analisi operativa del personale)

Strumento di analisi del personale per il titolare/responsabile: dà una fotografia immediata di
ciascun dipendente (ore, rispetto del contratto, turni, richieste). **Livello puramente additivo,
sola lettura**: non introduce tabelle/colonne nuove, non modifica alcun flusso esistente — aggrega
dati già presenti riusando le stesse logiche del resto del sistema. **Non è una valutazione del
dipendente**: mostra solo dati oggettivi + alert informativi; nessuna classifica, nessun giudizio,
nessuna decisione HR (disclaimer esplicito in UI: "la valutazione finale spetta sempre al responsabile").

### Riuso dei dati esistenti (nessun sistema parallelo)

- **Ore lavorate/pianificate**: `services/shiftExpansion.getExpandedShifts` + `shiftDurationHours`
  (stesse funzioni di `statsController`). `plannedHours` = tutti i turni assegnati nel periodo;
  `workedHours` = solo quelli con data ≤ oggi.
- **Rispetto del contratto**: tabella `user_contracts` (Fase 1). Il "monte ore previsto" per il
  periodo è **proporzionato** dal massimale settimanale (preferito) o mensile alla durata del periodo
  (`expectedHoursForPeriod`). `difference = plannedHours − expectedHours` (null se nessun massimale).
- **Richieste di cancellazione**: `cancellation_requests` raggruppate per stato (tot/approvate/
  rifiutate/in attesa), filtrate per `created_at` nel periodo.
- **Proposte di sostituzione ricevute**: `substitution_proposals` (Fase 5) per stato; scoping società
  via JOIN su `shifts` (la tabella non ha `company_id`, vedi "Tabelle principali").
- **Sostituzioni prese**: turni `type='volante'` assegnati al dipendente (claim o proposta accettata).
- **Aree = "ruolo/reparto"**: nel modello dati il "ruolo" operativo di un dipendente è l'area/e a cui
  è assegnato (`user_areas`), usate come etichetta e come filtro.

### Backend (`services/reportService.js` + `controllers/reportController.js` + `routes/reports.js`)

- `buildOverview({companyId,start,end,areaId,sedeId,userId})` → vista generale: una scheda per
  dipendente. `buildDetail({companyId,userId,start,end})` → scheda dettaglio + **confronto col periodo
  immediatamente precedente della stessa durata** (`previousPeriod`) + storico turni.
- **Nessun N+1**: una sola `getExpandedShifts` sull'intera società + due query aggregate (cancellazioni,
  proposte) raggruppate per utente — stesso spirito del fix di `listAvailableShifts`.
- **Alert informativi** (soglie in `ALERT_THRESHOLDS`, costanti nel service): ore pianificate molto
  sopra/sotto il monte previsto; ≥5 richieste di cancellazione nel periodo. **Solo di supporto**, mai
  un giudizio. **Stato operativo** (`no_contract`/`on_track`/`over`/`under`): descrizione oggettiva
  delle ore vs contratto (tolleranza `STATUS_TOLERANCE_HOURS`).
- **Rotte**: `GET /api/reports/employees` (`requireManager`); `GET /api/reports/employees/:id`
  (solo `authenticate`, autorizzazione fine nel controller: un dipendente vede **solo i propri**
  dati → 403 su altri; manager qualunque dipendente della società → 404 fuori società). Stesso
  pattern di `/api/users/:id/availability`. Periodo default = mese corrente; validazione `start`/`end`.

### Frontend (`components/reports/`)

- `ReportPage` istrada per ruolo: manager → `ManagerReport`, dipendente → `EmployeeReport`.
- `ManagerReport`: `ReportFilters` (preset periodo/personalizzato + sede/area/dipendente, opzioni aree
  caricate da `listAreas` per tutte le sedi della società) + griglia `EmployeeReportCard`; click su una
  scheda → `EmployeeReportDetail` **inline** (nessuna rotta nuova, "Torna all'elenco"). Polling 60s
  solo sull'elenco (sospeso mentre si consulta un dettaglio). L'ancora `data-tour="hours-stats"` è
  **spostata** sulla card filtri del Report (il tour commerciale `tourCommerciale.js` la cerca su
  `{base}/report`): non rimuoverla o il passo "statistiche" del tour perde il target.
- `EmployeeReport`: selettore periodo + `EmployeeReportDetail` sui **propri** dati (nessun filtro
  sede/area/dipendente, nessun "torna all'elenco").
- `HoursStats.jsx` resta nel codice/statsController invariato (endpoint `/api/stats/hours` ancora
  attivo), ma non è più montato nella pagina Report: il nuovo Report copre e amplia quelle statistiche.
- Stili `.report-*` in coda a `styles.css`, palette esistente (nessun colore nuovo di rilievo).

### Cosa NON fa (vincoli da mantenere)

- Non valuta i dipendenti, non crea classifiche/graduatorie, non suggerisce decisioni HR. Se in futuro
  si aggiungono metriche, restano **dati oggettivi** con lo stesso disclaimer.
- Non scrive nulla: è sola lettura. Nessuna nuova tabella/colonna è stata creata per il Report.

## Changelog / aggiornamenti

Ogni voce: data, cosa è cambiato, file principali toccati, nuove decisioni, cosa ricordare.

- **2026-07-11** — **Migrazione produzione ESEGUITA (layer SaaS)**. `npm run migrate` lanciato sul DB
  Neon di produzione: create `plans`, `company_subscriptions`, `user_permission_overrides` +
  `plans.external_price_ref`; seed dei 4 piani; backfill del piano `legacy` (illimitato) a tutte le 5
  società di produzione. Idempotente (2ª passata no-op), **zero cambi di comportamento**. Il billing
  resta **spento** in produzione (`BILLING_ENABLED` non impostata su Vercel) finché non attivato.
  **Sicurezza: ruotare la password del DB di produzione** (condivisa in chat per la migrazione).
- **2026-07-11** — **Iniziativa Multi-tenant SaaS — Step 7–8 (audit SaaS + billing predisposto)**.
  **Step 7 (hardening/audit)**: audit `plan.limit_reached` (best-effort) in `userController`/
  `sedeController` quando un limite blocca una creazione; pannello "Registro attività" nella sezione
  Organizzazione del Dirigente (`GET /api/audit-logs`, etichette leggibili). **Step 8 (billing,
  predisposizione SPENTA di default)**: nuova `plans.external_price_ref` (mappatura prezzo
  configurabile, nessun prezzo nel codice); `config/billing.js`; `services/billing/` (stripeProvider
  con checkout via fetch + verifica firma webhook HMAC, billingService per la sync di
  `company_subscriptions` + invalidazione entitlements); `controllers/billingController.js` +
  `routes/billing.js` (`status`/`plans`/`checkout` requireDirigente/`webhook` pubblico-firmato);
  `app.js` monta `express.raw` sul solo webhook prima di `express.json`; frontend card "Abbonamento"
  gated su `/billing/status` + campo prezzo nell'editor piani. **Decisioni**: nessun addebito reale
  finché non attivato via env (BILLING_ENABLED + chiavi Stripe + webhook secret); senza chiave il
  checkout è un URL segnaposto; webhook muta solo dopo verifica firma; nessuna dipendenza nuova
  (fetch + crypto). Verificato in locale: migrazione idempotente 2×, `npm run test:billing` **15/15**,
  regressione `test:isolation` 25/25 + `test:saas` 28/28, billing spento sul server (status
  enabled=false, checkout 404), build frontend + registro attività/card gated verificati nel browser.
  Dati di test rimossi. **Attivazione reale + migrazione produzione (`external_price_ref` con le altre
  tabelle SaaS) in sospeso, su conferma esplicita.**
- **2026-07-11** — **Iniziativa Multi-tenant SaaS — Step 6 (frontend: piani, Organizzazione, sidebar
  condizionale)**. UI del layer SaaS, nessuna modifica backend. **Super Admin**: nuova sezione "Piani"
  (`pages/superadmin/PianiPage.jsx`, CRUD con editor limiti/feature guidato da `GET /api/plans/catalog`)
  + "Società" estesa con colonna Piano e modale di assegnazione (piano/override/consumi). **Dirigente**:
  nuova sezione "Organizzazione" (`pages/manager/OrganizzazionePage.jsx`, piano/utilizzo/funzioni +
  matrice permessi per responsabile con override tri-state). **Sidebar condizionale** alle feature
  (`AuthContext` carica gli entitlements ed espone `hasFeature`; Report nascosto se non nel piano,
  Organizzazione solo al Dirigente). Nuovi metodi in `client.js`; classi `.modal-subhead`/`.org-features`
  in `styles.css`. **Decisioni**: editor guidato dal catalogo backend (nessuna chiave replicata nel
  frontend → aggiungere una feature/limite lato server la rende configurabile senza toccare la UI);
  frontend "dumb" (enforcement autoritativo lato backend, la UI è solo adattamento); piano in sola
  lettura per il Dirigente (lo governa il Super Admin), permessi del team gestiti dal Dirigente.
  Verificato nel browser end-to-end (configurazione piano Starter con limite+feature → assegnazione a
  una società → sidebar/consumi/permessi lato Dirigente riflettono tutto), build frontend OK,
  regressione backend `test:isolation` 25/25 + `test:saas` 28/28, dati/stato di test ripristinati.
- **2026-07-10** — **Iniziativa Multi-tenant SaaS — Step 2–5 (sistema configurabile: limiti,
  feature, permessi)**. Costruiti i **meccanismi** di enforcement/gating/RBAC, con i **valori sempre
  configurabili dal Super Admin a runtime** (nessun limite/feature commerciale nel codice) e
  **comportamento invariato di default**. **Step 2 (limiti)**: `config/planCatalog.js` (vocabolario
  chiavi) + enforcement in `userController.createUser` (maxEmployees/maxManagers) e
  `sedeController.createSede` (maxSedi) → `403 PLAN_LIMIT` al tetto, no-op se non configurato. **Step
  3 (feature gating)**: `middleware/requireFeature.js` applicato a `routes/reports.js` (`reports`),
  `routes/shifts.js` (candidates/proposals lato manager → `substitutionEngine`), `routes/emailLog.js`
  (`emailAutomation`) → `403 PLAN_FEATURE`, default abilitato; rotte dipendente non gated. **Step 4–5
  (RBAC)**: `config/permissions.js` (catalogo + matrice default = gate storico),
  `middleware/requirePermission.js`, tabella `user_permission_overrides`,
  `controllers/permissionController.js` + rotte `GET/PUT /api/users/:id/permissions`
  (`requireDirigente`), agganciato a approva/rifiuta cancellazioni (era `requireManager`, default
  invariato). `GET /api/plans/catalog` per la UI Super Admin. **Decisioni**: zero valori commerciali
  nel codice (solo chiavi + semantica); matrice permessi replica i gate esistenti (invariato al
  rilascio); Dirigente/Super Admin non soggetti a override (pavimento di sicurezza); niente ruoli
  custom (vincolo). Verificato in locale: migrazione idempotente 2×, `npm run test:saas` **28/28**,
  `npm run test:isolation` **25/25** (nessuna regressione), dati di test rimossi. **Migrazione
  produzione di `user_permission_overrides` in sospeso** (tabella vuota = invariato). **Manca il
  frontend** (Step 6: UI Super Admin piani + sezione "Organizzazione" del Dirigente + sidebar
  condizionale).
- **2026-07-10** — **Iniziativa Multi-tenant SaaS — Step 0–1 (fondamenta piani + sicurezza)**. Avvio
  del layer SaaS commerciale, **additivo** sopra l'isolamento `company_id` esistente (piano operativo
  approvato dall'utente). Vedi sezione "Layer SaaS: piani commerciali ed entitlements" e
  `IMPLEMENTATION_PROGRESS.md` → "Iniziativa: Multi-tenant SaaS" (roadmap step 0–8). **Step 0
  (sicurezza per prima)**: nuovo `backend/scripts/testTenantIsolation.js` (`npm run test:isolation`,
  prima suite di regressione automatica del progetto: 25 asserzioni cross-tenant + entitlements) e
  helper condiviso `utils/tenantScope.js`. **Step 1 (fondamenta piani)**: tabelle `plans` +
  `company_subscriptions` in `schema.sql` (seed di *contenitori vuoti*, backfill del piano `legacy`
  illimitato a tutte le società, demo comprese → zero cambi di comportamento); nuovo
  `services/entitlements.js` (unica fonte di verità, letto a DB, mai nel JWT); nuovo
  `controllers/planController.js` + `routes/plans.js` (CRUD piani + get/set subscription con usage,
  Super Admin); `GET /api/company/entitlements` in `companySettingsController.js`/`routes/company.js`;
  `listCompanies` espone il piano. **Decisioni**: zero valori commerciali hardcoded (limiti/feature
  configurabili a runtime dal Super Admin); semantica limite-assente=illimitato / feature-assente=
  abilitata (retrocompatibile); gating piani = confine commerciale (fail-open), isolamento dati resta
  `company_id`; entitlements con cache TTL 60s + invalidazione, mai nel token. **Nessun enforcement
  ancora** (Step 2–3): questo è puro layer infrastrutturale, comportamento invariato. Verificato in
  locale: migrazione idempotente 2×, seed 4 piani + backfill 3 società, `test:isolation` **25/25**,
  dati di test rimossi (DB pulito). **Migrazione produzione di `plans`/`company_subscriptions` in
  sospeso**, su conferma esplicita (backfill = solo assegnazione piano legacy, nessun impatto).
- **2026-07-10** — **Sezione Report (analisi operativa del personale)**. Nuova sezione, sola lettura e
  puramente additiva, per titolare/responsabile: vista generale con scheda per dipendente (ore lavorate/
  pianificate, monte ore da contratto proporzionato, differenza, turni, richieste di cancellazione,
  sostituzioni prese, stato operativo, alert informativi) con filtri periodo/sede/area/dipendente, e
  scheda dettaglio (analisi ore, analisi richieste, statistiche operative, **confronto col periodo
  precedente**, alert, storico turni). Il dipendente vede **solo i propri dati**. **Nessuna nuova
  tabella/colonna**: aggrega `shifts`(getExpandedShifts)/`user_contracts`/`cancellation_requests`/
  `substitution_proposals`/`user_areas` riusando le logiche esistenti; **nessun sistema parallelo**.
  **File**: backend `services/reportService.js`, `controllers/reportController.js`, `routes/reports.js`
  (+ registrazione in `app.js`); frontend `pages/sections/ReportPage.jsx` (riscritta), nuova cartella
  `components/reports/` (ManagerReport, EmployeeReport, EmployeeReportCard, EmployeeReportDetail,
  ReportFilters, reportPeriods.js, reportFormat.jsx), `api/client.js` (+`getReportOverview`/
  `getEmployeeReport`), stili `.report-*` in `styles.css`. **Tour**: l'ancora `data-tour="hours-stats"`
  è stata spostata sulla card filtri del Report (il passo "statistiche" di `tourCommerciale.js` naviga a
  `{base}/report`). **Decisioni**: Report = raccolta/organizzazione di dati oggettivi, **mai** valutazione
  automatica dei dipendenti (disclaimer esplicito in UI); "ruolo/reparto" del report = area operativa
  (`user_areas`); il monte ore previsto è proporzionato dal massimale contrattuale settimanale/mensile
  alla durata del periodo. **Nessuna migrazione DB.** Verificato in locale su scenario demo "ristorante"
  (32 dipendenti): service (overview/detail/confronto), HTTP 200/400/401/403/404 (permessi self vs
  manager, isolamento società), UI end-to-end (griglia, filtro area, dettaglio con tutte le sezioni,
  vista dipendente self), build frontend OK.

- **2026-07-10** — **Brand "Planivo" + migrazione produzione ESEGUITA**. (1) Rinominato il brand da
  "PoolShift" a **Planivo** ovunque (default `EMAIL_BRAND_NAME` in `templates/layout.js`, `EMAIL_FROM`,
  `scripts/testEmail.js`, tour demo `constants/tours/*`, `.env.example`, documentazione). Il prodotto è
  **Planivo**; l'UI interna resta "Gestione Turni". (2) **Migrazione produzione eseguita** sul DB Neon:
  `npm run migrate` applica l'INTERO `schema.sql` (cumulativo), quindi ha creato le strutture Email
  (`email_log`/`email_action_tokens`/`notification_preferences`/`users.pending_email`) **e** tutte le
  migrazioni additive rimaste in sospeso da Sicurezza/Sostituzioni/Demo. Idempotente (no-op alla 2ª
  esecuzione), nessuna perdita dati. **Restano da impostare le env email su Vercel** (backend) +
  redeploy. **Sicurezza: ruotare la password del DB di produzione** (condivisa in chat per la migrazione).
- **2026-07-10** — **Email Automation — Fase E7 (storico comunicazioni + demo) + chiusura E1–E7**.
  Vista di consultazione dello storico email per responsabile/dirigente: `controllers/emailLogController.js`
  + `GET /api/email-log` (`requireManager`, scoped società) + sezione "Email inviate" in
  `ComunicazioniPage` (tabella con stato Inviata/Non inviata/Fallita). **Demo**: nessun codice separato —
  gli eventi in demo passano dagli stessi controller, per `is_demo` l'invio è soppresso (`email_log`
  `suppressed`) e lo storico li mostra comunque. **Piano E1–E7 completato** (parte software) + **E8
  completata** (provider Resend, dominio `planivo.it` verificato con DKIM/SPF su Aruba,
  `EMAIL_FROM=Planivo <no-reply@planivo.it>`, invio reale verso esterni riuscito). Riepilogo finale, migrazioni in
  sospeso ed env di produzione in `IMPLEMENTATION_PROGRESS.md` → "Riepilogo finale — Iniziativa Email
  Automation". Verificato: test E7 9/9 + regressione completa E1–E7 (147 asserzioni), migrazione
  idempotente 2×, build frontend. **Migrazioni produzione (`email_log`, `pending_email`,
  `email_action_tokens`, `notification_preferences`) in sospeso.**
- **2026-07-10** — **Email Automation — Fase E6 (preferenze notifiche)**. Ogni utente sceglie quali
  email di EVENTO ricevere (tutte / solo importanti / nessuna + disattivazione di singole categorie).
  **Schema**: tabella `notification_preferences` (1:1 con users, `email_mode` + `disabled_categories`
  JSONB; assenza di riga = default "tutte", retrocompatibile). **Backend**:
  `services/notificationPreferencesService.js` (catalogo `EMAIL_CATEGORIES` + `isEmailAllowed`),
  `emailChannel` filtra nel percorso gated (LEFT JOIN preferenze → riga `suppressed` "preferenze
  notifiche utente"), controller + rotte `GET/PUT /api/notifications/preferences` (self). **Frontend**:
  `NotificationPreferences.jsx` in `MyProfile` e `ImpostazioniPage` (che ora monta anche `EmailManager`,
  così i responsabili gestiscono/verificano la propria email). **Decisioni**: le preferenze riguardano
  **solo** il canale email di evento — le notifiche in-app (registro completo) e le email transazionali
  di verifica/reset non sono mai filtrate (passano `gated=false`). Verificato: test 12/12 + build frontend.
  **Migrazione produzione di `notification_preferences` in sospeso.**
- **2026-07-10** — **Email Automation — Fase E5 (Email Actions)**. Azioni direttamente dai bottoni
  dell'email senza aprire il portale: accetta/rifiuta proposta di sostituzione, approva/rifiuta
  richiesta di cancellazione. **Schema**: tabella `email_action_tokens` (token dedicati hash-only,
  monouso, a scadenza, vincolati a utente+azione+entità). **Backend**: `services/emailActionService.js`
  (create/peek/consume atomico), `controllers/emailActionController.js` (`describeAction` GET pubblico
  che NON muta + `executeAction` POST pubblico che consuma e agisce), rotte `/api/email-actions/:token`.
  **Estrazioni core riusate** (nessuna divergenza col percorso HTTP, stesso principio di
  `assignVolanteToUser`): `declineProposalForUser`, `approveRequestCore`/`rejectRequestCore`
  (+`loadPendingRequest`); gli handler HTTP restano wrapper invariati. `emailChannel` supporta
  `buildData` async (token per-destinatario). `notifySubstitutionProposal`/`notifyCancellationRequested`
  generano i token e li passano ai template (`buttonRow`, E4). **Frontend**: pagina pubblica
  `/azione-email` (describe→conferma→execute). **SICUREZZA (requisito esplicito)**: mutazione **solo via
  POST dopo conferma** (i link GET non modificano nulla → i prefetch dei client email non innescano
  l'azione, come `verify-email`); token monouso atomico + scadenza; ri-verifica di stato entità +
  autorizzazione (cancellazioni: solo responsabile della società) al momento dell'esecuzione. Verificato:
  test backend 21/21 + smoke browser end-to-end (proposta accettata dalla mail, token consumato).
  **Migrazione produzione di `email_action_tokens` in sospeso.**
- **2026-07-10** — **Email Automation — Fase E4 (template email professionali)**. Layout HTML email
  condiviso, responsive e brandizzato (`services/email/templates/layout.js`: `renderLayout` + helper
  `paragraph`/`button`/`buttonRow`/`detailBox`/`highlightBox`), applicato a **tutti** i template in
  `templates/index.js` (subject/text invariati, firme dati invariate → chiamanti E1–E3 non toccati).
  Vincoli email rispettati: tabelle + stili inline + nessuna risorsa esterna (brand a testo, max
  600px, responsive). `buttonRow` (varianti primary/danger/neutral) è **predisposto per le Email
  Actions di E5** (bottoni Accetta/Rifiuta nelle email). Brand configurabile via `EMAIL_BRAND_NAME`.
  Verificato: render 55/55 + anteprima visiva nel browser. Nessuna migrazione.
- **2026-07-10** — **Email Automation — Fase E3 (email assegnazione e modifica turno)**. Nuovi eventi
  (finora senza notifica): assegnazione di un turno a un dipendente e modifica di un turno assegnato.
  Additivo puro in coda a `createShift`/`updateShift`, nessuna modifica di schema. **Backend**: template
  `shift_assigned`/`shift_modified`; `notifyShiftAssigned`/`notifyShiftModified` in `notificationService`
  (in-app + email, best-effort, escludono l'attore, risolvono nomi azienda/area/sede); helper
  `describeShiftWhen` in `shiftController` (data per singoli/volante, etichetta ricorrenza per i fissi).
  `updateShift` accetta un `reason` opzionale (non persistito, solo per la comunicazione). **Decisioni**:
  assegnazione diretta ≠ Sostituzione (il volante resta sul flusso broadcast esistente); riassegnazione
  a un altro dipendente = assegnazione per il nuovo (nessun evento "rimosso" per il vecchio in v1).
  Verificato: test controller 15/15 (assegnazione/modifica/riassegnazione/fisso/volante-escluso). Nessuna
  migrazione.
- **2026-07-10** — **Email Automation — Fase E2 (verifica e cambio email)**. Sistema completo di
  conferma email + cambio email self-service, sopra le predisposizioni S4 (`auth_tokens`,
  `email_verified`). **Schema**: `users.pending_email` (nuovo indirizzo in attesa di conferma; `email`
  attivo resta invariato finché non si conferma). **Backend**: `emailChannel.deliverTransactionalEmail`
  (invio NON gated a un indirizzo esplicito — le email di verifica devono partire anche verso indirizzi
  non verificati — con soppressione demo + logging), `services/emailVerificationService.js`,
  `controllers/emailVerificationController.js` (`sendVerification`/`changeEmail`/`verifyEmail`), rotte
  `POST /auth/verify-email` (pubblico), `/auth/send-verification`, `/auth/change-email`. `createUser`
  invia il link alla creazione (best-effort). `emailVerified`/`pendingEmail` in **entrambe** le copie di
  `toSafeUser`. **Frontend**: pagina pubblica `/verifica-email` (POST del token, guard StrictMode),
  banner "verifica la tua email" in `AppLayout`, scheda Email in `MyProfile` (`EmailManager`),
  `AuthContext.refreshUser`. **Decisioni**: cambio email con `pending_email` (l'indirizzo attivo non
  cambia finché non si conferma il nuovo, via link al nuovo); `verify-email` pubblico e **via POST**
  (non con la sola apertura del link — i client email prefetchano in GET; stesso principio che userà
  E5). Verificato: migrazione 2×, test backend 22/22, build frontend, smoke browser della pagina di
  verifica (successo + errore monouso). **Migrazione produzione di `pending_email` in sospeso.**
- **2026-07-10** — **Email Automation — Fase E1 (canale email + storico)**. Prima fase della nuova
  iniziativa "Email Automation, Notification Center e Email Actions" (piano E1–E8 in
  `IMPLEMENTATION_PROGRESS.md`). Introduce il **canale email** come secondo canale delle notifiche,
  fratello del canale in-app: la stessa logica di evento (`services/notificationService.js`, `notify*`
  invariate nei call site) alimenta entrambi. **Nuovi**: tabella `email_log` (storico invii,
  idempotente in `schema.sql`), `services/notificationChannels/emailChannel.js`
  (`deliverEventEmail`, best-effort, gate "solo verificate" + soppressione demo + log dell'esito
  `sent`/`failed`/`suppressed`), `services/email/providers/resendProvider.js` (API Resend via `fetch`
  nativo, **zero dipendenze**, registrato in `providers/index.js`). **Modifiche additive**:
  `emailService.deliver` estratto (unico punto verso il provider), 4 template testuali nuovi
  (`cancellation_requested`/`_approved`/`_rejected`, `substitution_proposal_declined`), aggancio email
  in coda a 4 `notify*` (proposta sostituzione, richiesta/esito cancellazione, proposta rifiutata),
  `.env.example`. **Decisioni**: solo eventi **mirati** via email (il broadcast "nuova sostituzione
  disponibile" resta solo in-app); gate `EMAIL_REQUIRE_VERIFIED` (default true, tutti gli account
  esistenti sono non verificati ⇒ nessun invio reale fino a E2); demo con pipeline identica ma invio
  soppresso (precedenza sul gate); provider Resend reversibile via astrazione. **Best-effort come le
  notifiche in-app**: un errore di invio non fa mai fallire l'azione. Verificato: migrazione 2×,
  test canale 13/13, integrazione 4 eventi 10/10, percorso `failed` non bloccante, boot app; dati di
  test rimossi. **Migrazione produzione di `email_log` in sospeso**, su conferma esplicita.
- **2026-07-10** — **Demo Framework — Fasi D2–D5**. **D2**: primo scenario `ristorante`
  (`backend/src/demo/scenarios/ristorante/`, ~35 persone hand-authored, contratti/disponibilità
  differenziati, 55 turni fissi ancorati a −90gg, 48 fabbisogni, 4 corsi, storico + stati pendenti
  generati con RNG deterministico; invariante ore fail-fast), loader generico completo con
  transazione + advisory lock, `npm run demo:load`/`demo:reset`. **D3**: `POST /api/demo/login`
  (lazy load/re-anchor, JWT di sessione della persona, forma identica a `/auth/login`) +
  `/api/demo/reset`; `isDemo` in **entrambe** le copie di `toSafeUser` (via JOIN `companies.is_demo`);
  bottone "Prova la demo" + persona picker in `Login.jsx`, `DemoBanner` in `AppLayout` (Demo Libera
  completa). **D4**: engine Tour Guidato scenario-agnostico (`frontend/src/tour/*`,
  `constants/tours/*`) — state machine + sessionStorage, overlay spotlight z-index 70, `data-tour`
  sulle nav, criteri `next`/`route`/`click`. **D5**: **tour commerciale** (12 step, una giornata
  lavorativa) + azioni simulate lato server (`demo/framework/simulations.js`) che riusano
  `acceptProposalForUser` (estratto da `acceptProposal`, wrapper invariato) — l'altro attore
  (dipendente che accetta) è simulato senza duplicare logica; endpoint `/api/demo/tour/actions|checks/:name`
  (guardati `requireDemoCompany`, 403 su società reale); criteri `poll`/`action` nell'engine.
  Nuova colonna `demo_state.personas`. Tutto verificato (e2e backend 13/13 + regressione accept, tour
  end-to-end nel browser). **Migrazione produzione** (is_demo/demo_state/personas) su conferma.
- **2026-07-10** — **Demo Framework — Fase D1 (fondamenta)**. Nuova iniziativa permanente (vedi
  sezione "Demo Framework" sopra e `IMPLEMENTATION_PROGRESS.md`). **Schema** (idempotente):
  `companies.is_demo` + indice parziale; tabella `demo_state` (una istanza per scenario in v1,
  UNIQUE su `scenario_id`). **Nuovo dominio** `backend/src/demo/framework/` (config/guard/rng/
  anchor/registry/loader/reset — motore generico completo, contratto scenario documentato in
  `loader.js`), `controllers/demoController.js` + `routes/demo.js` (`GET /api/demo/status`
  pubblico), 2 righe in `app.js`, sezione demo in `.env.example`. **Decisioni**: società demo nello
  stesso DB isolate da `is_demo` + chokepoint `assertDemoCompany`; transazione unica + advisory
  lock nel loader (primo uso di transazioni, confinato lì); re-anchoring lazy senza cron; dominio
  demo non legato al Super Admin; default spento (404). Verificato: migrazione 2×, guardie,
  status nei due stati, regressione login/health. **Migrazione produzione in sospeso** con le altre.

- **2026-07-08** — **Riorganizzazione struttura interfaccia: sidebar + pagine per sezione** (solo
  frontend, nessuna modifica backend/schema, nessuna funzionalità rimossa). Le dashboard
  monolitiche `AdminDashboard`/`DirigenteDashboard`/`EmployeeDashboard`/`SuperAdminDashboard` sono
  state **sostituite** da: layout comuni (`components/layout/AppLayout|ManagerLayout|EmployeeLayout|
  SuperAdminLayout`), contesto `context/ManagerWorkspaceContext.jsx` (sede+aree condivise tra le
  sezioni manager, selettore sede nella sidebar), pagine di sezione in `pages/manager/*`,
  `pages/employee/*`, `pages/sections/*` (Comunicazioni/Report condivise), `pages/superadmin/*`;
  rotte annidate in `App.jsx` con redirect di compatibilità (`/…/users/new` → `/…/personale/nuovo`);
  `CreateUser.jsx` resa pagina figlia di Personale (niente topbar propria); `relativeTime` esportata
  da `NotificationsBell`; stili layout in coda a `styles.css` (palette invariata). Le Dashboard sono
  ora **solo riassuntive** (indicatori + link, riusano esclusivamente endpoint esistenti). Dettagli,
  tabella sezioni-per-ruolo, principi e suggerimenti per il futuro restyling nella nuova sezione
  **"Struttura dell'interfaccia: navigazione a sezioni con sidebar"**. Verificato nel browser per
  tutti e 4 i ruoli (navigazione completa, calendario con fabbisogno, sostituzioni, personale,
  impostazioni, redirect legacy); build Vite OK.
- **2026-07-08** — **Iniziativa Sicurezza — Fase S7 (Backup, affidabilità, ambienti) + chiusura piano
  S1–S7**. Nuovo `utils/envGuard.js` (`assertDestructiveAllowed`): `db:reset`/`seed:dirigente`/
  `restore` si rifiutano di girare con `NODE_ENV=production` salvo `ALLOW_DESTRUCTIVE=true`
  (`seed:superadmin` **non** bloccato, bootstrap legittimo). Nuovi `scripts/backup.sh` (`pg_dump`→
  `.sql.gz`) e `scripts/restore.sh` (`psql`) + npm `db:backup`/`db:restore`; `backups/` in
  `.gitignore`. `.env.example` completato con tutte le env S1–S6 + `NODE_ENV`/`ALLOW_DESTRUCTIVE`.
  Verificato: guardia (exit 1 in prod, opt-in supera, dev non blocca), backup reale, migrazione
  idempotente completa 2×, app + build frontend OK. **Riepilogo completo del piano sicurezza in
  `IMPLEMENTATION_PROGRESS.md` → "Riepilogo finale"** (implementato / predisposto / migrazioni
  produzione in sospeso / migliorie consigliate). **Le migrazioni DB delle fasi S2/S3/S4 vanno
  applicate in produzione con `npm run migrate` solo su conferma esplicita.**
- **2026-07-08** — **Iniziativa Sicurezza — Fase S6 (Modulo cifratura dati sensibili)**. SOLO modulo
  + predisposizione, **nessuna applicazione ai dati** (decisione esplicita dell'utente). Nuovo
  `backend/src/utils/crypto.js`: AES-256-GCM, chiave 32 byte da env (`DATA_ENCRYPTION_KEY`, mai nel
  codice), formato `enc:<keyId>:<iv>:<tag>:<ciphertext>` con **rotazione chiavi** (keyring primaria +
  ritirate); `encrypt`/`decrypt` null-safe, `decrypt` pass-through sui valori non cifrati (adozione
  graduale). Aggiunta sezione **"Sicurezza: classificazione dati e cifratura"** in questo file
  (email in chiaro per motivi funzionali; candidati: `phone`, note contrattuali). Nessuna dipendenza,
  nessuna modifica di schema. Verificato (8/8, incl. integrità GCM e rotazione). **Applicazione ai
  dati rimandata** a una fase dedicata su conferma esplicita.
- **2026-07-08** — **Iniziativa Sicurezza — Fase S5 (Predisposizione sistema email modulare)**.
  Base per invii email futuri, **nessun invio reale attivo**. Nuovo modulo
  `backend/src/services/email/`: `emailService.sendEmail({to,template,data})` (astrazione su template
  + provider), `providers/` (selezione via `EMAIL_PROVIDER`, default **no-op** che logga soltanto;
  provider ignoto → fallback no-op), `templates/` (email_verification, password_reset,
  two_factor_code, substitution_proposal, generic_notification; link da `APP_BASE_URL`, escape HTML).
  Nessuna dipendenza (`nodemailer` solo in futuro con SMTP reale). Email = canale **aggiuntivo** alle
  notifiche in-app. Nessun chiamante ancora agganciato. Verificato (7/7). Nessuna modifica di schema.
- **2026-07-08** — **Iniziativa Sicurezza — Fase S4 (Predisposizione verifica email + token auth)**.
  SOLO STRUTTURA, nessun invio email attivo. **Schema** (idempotente): `users.email_verified` +
  `users.two_factor_enabled` (BOOLEAN DEFAULT FALSE, non ancora consultati dai flussi); tabella
  generica `auth_tokens` (`purpose` in email_verification/password_reset/two_factor, `token_hash`,
  `expires_at`, `used_at`) che copre in un'unica struttura i tre scopi futuri. Nuovo
  `services/authTokenService.js` (`createToken`/`consumeToken`): salva **solo l'hash SHA-256** del
  token (chiaro restituito una volta), TTL per scopo via env, **monouso atomico** e scadenza. Usa
  `crypto` di Node, nessuna dipendenza. **Nessun endpoint agganciato** (attivazione rimandata a dopo
  S5 + wiring dedicato). Verificato con DB reale (7/7). **Migrazione produzione in sospeso.**
- **2026-07-08** — **Iniziativa Sicurezza — Fase S3 (Audit trail)**. Registro delle operazioni
  importanti. **Schema** (idempotente): tabella `audit_logs` (company_id/actor_user_id entrambi
  `ON DELETE SET NULL`, action, entity_type/id, metadata JSONB, ip, created_at; 2 indici). Nuovo
  `services/auditService.js` (`logAction`/`logFromReq`/`ipFromReq`, **best-effort non bloccante**,
  stesso principio delle notifiche). Strumentati: login riuscito/fallito, CRUD utenti/turni/corsi,
  approva/rifiuta cancellazioni, azioni società del super admin. Nuovo endpoint di lettura
  `GET /api/audit-logs` (`auditController.js` + `routes/audit.js`), riservato a dirigente (propria
  società) / super admin (tutte, filtro `?companyId`), **predisposto** per futura UI. **Decisioni**:
  audit awaitato ma che non propaga errori; `admin`/responsabile escluso dalla lettura; metadata
  senza dati sensibili. Verificato con DB reale (E2E login→audit→lettura, 403 dipendente, 401 senza
  token; corretto in verifica un `company_id` ambiguo nella JOIN). **Migrazione produzione di
  `audit_logs` in sospeso**, su conferma esplicita.
- **2026-07-08** — **Iniziativa Sicurezza — Fase S2 (Protezione brute-force)**. Blocco temporaneo
  dell'account dopo troppi tentativi di login falliti. **Schema** (migrazione idempotente):
  `users.failed_login_attempts` + `users.locked_until`. **`authController.login`**: check lockout
  prima della verifica credenziali (429 se attivo), `registerFailedAttempt`/`resetFailedAttempts`
  su fallimento/successo (copre anche il primo accesso via codice). Soglia/durata via env
  (`LOGIN_MAX_ATTEMPTS`/`LOGIN_LOCKOUT_MINUTES`, in `config/security.js`). **Decisione**: stato su DB
  e non in memoria perché su Vercel serverless le istanze non la condividono; nessun job di pulizia
  (blocco scaduto valutato al volo). File: `schema.sql`, `authController.js`, `.env.example`.
  Verificato con DB reale (migrazione idempotente 2×, E2E lockout→429→reset). **Migrazione
  produzione delle 2 colonne in sospeso**, su conferma esplicita.
- **2026-07-08** — **Iniziativa Sicurezza — Fase S1 (Politica password + hardening base)**.
  Prima fase del piano di rafforzamento sicurezza (vedi `IMPLEMENTATION_PROGRESS.md` → "Iniziativa:
  Sicurezza e predisposizioni"). Additiva, nessuna modifica di schema, nessuna regressione.
  **Novità**: (1) politica password robusta e configurabile via env, single-source backend↔frontend
  — nuovo `backend/src/config/security.js` (lettura centralizzata env di sicurezza) e
  `backend/src/utils/passwordPolicy.js` (`validatePassword`/`describePolicy`: lunghezza min,
  maiuscola/minuscola/numero/speciale disattivabili, blocklist password comuni, no-username),
  applicata in `authController.firstLoginSetup` e `userController.resetPassword` (prima solo
  `length>=8`); nuovo endpoint pubblico `GET /api/auth/password-policy`; frontend
  `utils/passwordPolicy.js` + `components/auth/PasswordRequirements.jsx` (checklist live) in
  `FirstAccessSetup.jsx`. (2) Hardening `app.js`: **Helmet** (scelto dall'utente come standard
  Express; CSP off perché API solo-JSON), boot check `JWT_SECRET` (fail-fast se assente / placeholder
  in produzione), `express.json({ limit:'100kb' })`, `x-powered-by` disabilitato, 404 handler JSON,
  error handler che non logga il corpo (niente password nei log) e gestisce JSON malformato/troppo
  grande. `BCRYPT_ROUNDS` configurabile (default 10 invariato). **Decisioni**: seed dev non passano
  dalla policy (hash diretto, invariati); vulnerabilità `npm audit` su `tar`/`node-pre-gyp` sono
  pre-esistenti (transitive di `bcrypt`, build-time), non introdotte qui. Verificato: boot check,
  `validatePassword` (8 casi), HTTP live (header Helmet, endpoint policy, 404, no x-powered-by),
  build frontend OK. **Nessuna migrazione DB** in questa fase.
- **2026-07-07** — Creazione di questo file (`PROJECT_CONTEXT.md`), a valle del completamento
  della trasformazione multi-azienda (Super Admin + Società). Nessun codice applicativo
  modificato in questo passaggio, solo documentazione.
- **2026-07-07** — Trasformazione dei turni "volanti" in "Sostituzioni": rinominato solo il testo
  UI (`type='volante'` invariato a DB, stessa convenzione del rename "Turno mobile" → "Turno
  singolo"). Nuova logica: creazione manuale con ruolo richiesto obbligatorio
  (`required_category`, poi superato dalle aree operative nella modifica successiva), creazione
  automatica alla cancellazione approvata di un turno esistente (che ora non viene più eliminato
  ma passa a `status='cancelled_approved'`, storico), filtro di disponibilità per ruolo + assenza
  di sovrapposizione oraria (`hasOverlappingShift`), doppio controllo server-side anche al momento
  del claim. File principali: `backend/src/db/schema.sql`, `shiftExpansion.js`,
  `shiftController.js`, `cancellationController.js`,
  `frontend/src/components/shifts/SubstitutionsPanel.jsx`, `ShiftFormModal.jsx`,
  `CalendarPage.jsx`. Verificato via curl e nel browser, sia in locale sia in produzione.
- **2026-07-07** — **Sedi e Aree operative configurabili**: trasformazione più ampia della
  sessione. Nuove tabelle `sedi`/`operational_areas`/`user_areas`; `shifts`/`courses` ricevono
  `area_id`/`sede_id` obbligatori; `required_category` superata dal concetto di area (vedi
  sezione dedicata "Gerarchia Sedi → Aree operative" e decisione architettuale correlata); nuovo
  `sedeController.js`/`areaController.js` + routes `sedi.js`/`areas.js`; `userController.js`
  sostituisce `category` con `areaIds[]` (endpoint `PUT /api/users/:id/areas` per riassegnare in
  qualsiasi momento); `shiftController.js`/`courseController.js` scoped per `areaId` con
  validazione oraria dinamica per sede (`isWithinDailyWindow` ora parametrica);
  `cancellationController.js` eredita `area_id`/`sede_id` dal turno originale. Frontend: nuovo
  `hooks/useSedeSelection.js`, `pages/dirigente/SediManagement.jsx`,
  `components/areas/AreasManagement.jsx`, `pages/employee/EmployeeDashboard.jsx` (sostituisce
  `EmployeeDashboardRouter`/`BagninoDashboard`/`IstruttoreDashboard`, rimossi insieme a
  `constants/employeeCategories.js` frontend e backend, verificati non più referenziati prima
  della rimozione); `AdminDashboard.jsx`/`DirigenteDashboard.jsx` riscritte con selettore sede +
  tab calendario dinamiche; `CreateUser.jsx`/`UserManagementSection.jsx` con multi-select aree
  invece di categoria singola; `utils/timeWindow.js` da costanti fisse a
  `createTimeWindow(start,end)`; `CalendarGrid`/`ShiftBlock`/`CoursesGrid`/`CourseBlock` ricevono
  la finestra oraria come prop. Migrazione idempotente con backfill automatico (Sede Principale +
  aree Bagnino/Istruttore per compatibilità dati storici; nessuna area predefinita per società
  create dopo questa migrazione). Bug trovato e risolto durante la verifica: `CoursesCalendar`
  chiamava `/api/users` anche per dipendenti in sola lettura (403), mancava la guardia
  `if (isManage)` persa nel refactor. Verificato a fondo via curl (isolamento per area, guardie
  su calendar_mode/delete, validazione orari per sede) e nel browser end-to-end (creazione sedi/
  aree, dipendente multi-area con dashboard dinamica a due tab, creazione e claim di una
  Sostituzione). Migrazione produzione ed eventuale smoke test: vedi voce successiva se già
  eseguiti al momento della lettura.
- **2026-07-07** — **Fabbisogno di personale per area operativa**: nuovo livello sopra i turni,
  puramente additivo (vedi sezione dedicata "Fabbisogno di personale per area operativa" per il
  dettaglio completo). Nuove tabelle `staffing_requirements` (regole fisse per giorno della
  settimana o singole per data, con split "chiudi e ricrea" per le modifiche "questa occorrenza e
  le future") e `staffing_requirement_exceptions` (override/esclusione di una singola occorrenza);
  nuova colonna nullable `shifts.requirement_id` (nessun backfill, nessun vincolo NOT NULL). Nuovi
  `backend/src/utils/staffingOccurrences.js` (espansione occorrenze), `services/staffingCoverage.js`
  (calcolo copertura riusando `getExpandedShifts` invariato + guardia duplicati
  `findConflictingRequirement`), `controllers/staffingController.js` + `routes/staffing.js` (tutte
  le rotte `requireManager`, nessun endpoint per il dipendente). `shiftExpansion.js`: aggiunto solo
  il campo additivo `requirementId` a `toSafeShift`/`getExpandedShifts`; **nessuna modifica** a
  `createShift`/`updateShift`/`claimShift`/`listAvailableShifts`/`approveRequest`. Frontend: nuovo
  `components/staffing/` (`StaffingPanel.jsx`, pannello riepilogativo separato dal calendario;
  `StaffingScheduleModal.jsx`, editor settimanale; `StaffingSingleModal.jsx`; `StaffingOccurrenceModal.jsx`,
  le 4 modalità di modifica occorrenza), innestato in `DirigenteDashboard.jsx`/`AdminDashboard.jsx`
  accanto a `SubstitutionsPanel`. Cambio collaterale richiesto esplicitamente dall'utente:
  `CalendarGrid.jsx`/`ShiftBlock.jsx` riusano invariato l'algoritmo di layout a corsie già usato
  per i corsi (`utils/courseLayout.layoutCourses`, generico), così turni sovrapposti nello stesso
  orario/area (ora un caso comune, prima raro) si affiancano invece di nascondersi — nessuna
  modifica a `courseLayout.js`/`CoursesGrid.jsx`/`CourseBlock.jsx`, verificato che il caso "un
  solo turno" resti a larghezza 100% (nessuna regressione). Decisioni prese esplicitamente con
  l'utente durante l'implementazione (non nella pianificazione iniziale): niente assegnazione
  esclusiva della copertura tra fabbisogni sovrapposti (un turno può coprire più fabbisogni
  contemporaneamente, scelta deliberata per semplicità); blocco di fabbisogni duplicati (stessa
  area/data-o-giorno/orario esatto) con conferma esplicita richiesta (`409` + `confirmDuplicate`).
  Verificato a fondo via curl (creazione regola settimanale con split corretto per data, tutte e 4
  le modalità di modifica occorrenza, copertura calcolata correttamente su turni fissi/Sostituzioni
  assegnate, generazione slot mancanti idempotente, guardia duplicati con e senza conferma,
  isolamento per area `calendar_mode`, accesso negato al ruolo `user`) e nel browser end-to-end
  (pannello fabbisogno, generazione e claim di una Sostituzione da un buco, verifica visiva di
  turni sovrapposti affiancati nel calendario). Migrazione produzione: da eseguire solo dopo
  conferma esplicita dell'utente (stesso protocollo delle feature precedenti).
- **2026-07-07** — **Ottimizzazione: aggiornamenti quasi in tempo reale + query più veloci**.
  Causa individuata: ogni componente con dati condivisi caricava i dati solo in un `useEffect` al
  mount/cambio dipendenze, nessun meccanismo avvisava le sessioni degli altri utenti di una
  modifica (dettaglio completo in "Aggiornamenti quasi in tempo reale (polling leggero)"). Nuovo
  `frontend/src/hooks/usePolling.js` (polling con pausa su tab non visibile, refetch immediato su
  focus/chiusura modali), applicato a `CalendarPage.jsx`, `CoursesCalendar.jsx`,
  `SubstitutionsPanel.jsx`, `CoursesAvailablePanel.jsx` (5s), `StaffingPanel.jsx`,
  `CancellationRequestsPanel.jsx`, `MyCancellationRequests.jsx` (10s), `HoursStats.jsx` (60s) —
  nessuna modifica alla logica di fetch/mutazione già esistente in questi componenti, solo
  aggiunta della chiamata al nuovo hook accanto all'`useEffect` già presente. Backend:
  `shiftExpansion.getExpandedShifts`/`courseExpansion.getExpandedCourses` parallelizzano con
  `Promise.all` le due query indipendenti (istanze vs turni/corsi fissi, prima sequenziali);
  `shiftController.listAvailableShifts` non itera più con una query di sovrapposizione sequenziale
  per ogni Sostituzione candidata (N+1), batchata in un'unica `getExpandedShifts` sull'intervallo
  di date coperto + confronto in memoria, stesso identico predicato/output di prima (verificato
  esplicitamente che continui a controllare la sovrapposizione su tutte le aree del dipendente, non
  solo quella del turno). Aggiunto indice mancante `idx_cancellation_requests_shift_id`. Verificato
  in locale via curl/browser: migrazione idempotente (2x), polling osservato nel traffico di rete
  (richieste periodiche 200 OK), pausa del polling confermata mentre un modale è aperto (nessuna
  nuova richiesta `/api/calendar` per 7s con modale aperto) e refetch immediato confermato alla
  chiusura (nuova richiesta entro 400ms), aggiornamento automatico in tab già aperta di una
  modifica fatta "da un altro utente" (chiamata API diretta, non passata dalla UI) rilevato entro
  un tick di polling senza alcun refresh manuale, fix N+1 verificato con un dipendente di prova
  (Sostituzione sovrapposta a un turno assegnato correttamente esclusa, una libera correttamente
  mostrata) — dati di test rimossi al termine. Nessuna regressione riscontrata sui flussi esistenti.
  Migrazione produzione (solo l'indice): da eseguire solo dopo conferma esplicita dell'utente.
- **2026-07-07** — **Fix regressione post-deploy: sfarfallio del calendario durante il polling**.
  Segnalato dall'utente in produzione subito dopo il deploy della modifica precedente: la griglia
  del calendario turni/corsi si ridisegnava visibilmente ogni pochi secondi. Causa:
  `CalendarPage.loadCalendar`/`CoursesCalendar.loadCourses` impostavano `loading=true` ad ogni
  chiamata, comprese quelle silenziose innescate dal polling — la griglia veniva quindi sostituita
  dal messaggio "Caricamento..." e poi ridisegnata ad ogni tick. Fix: entrambe le funzioni
  accettano ora un parametro `{ silent }`; `usePolling` le richiama sempre con `silent: true`, così
  il polling aggiorna i dati senza toggling di `loading` (il fetch iniziale e i cambi di area/data/
  utente selezionato, che devono restare visibili come caricamento reale, non sono stati toccati).
  Verificato in locale osservando ~190 richieste di polling consecutive senza mai vedere ricomparire
  il messaggio di caricamento. **Attenzione per il futuro**: qualunque nuovo componente che riceva
  polling e usi uno stato `loading` per nascondere il contenuto deve seguire lo stesso pattern
  `{ silent }`, altrimenti si ripresenta lo stesso sfarfallio.
- **2026-07-08** — **Fabbisogno integrato direttamente nel calendario turni** (non più un pannello
  separato). Richiesta esplicita dell'utente: il dirigente deve vedere quanto personale serve,
  quanto è coperto e chi manca senza aprire pannelli secondari, con ogni fascia oraria sempre
  visibile e mai accorpata — vedi la sezione dedicata "Copertura integrata direttamente nel
  calendario turni" dentro "Fabbisogno di personale per area operativa" per il dettaglio completo
  di design e motivazioni. **Nessuna modifica al backend**: l'infrastruttura del fabbisogno
  (`staffing_requirements`/`staffing_requirement_exceptions`, calcolo copertura, generazione
  Sostituzioni) era già completa e corrispondeva quasi 1:1 a quanto richiesto; il lavoro è stato
  interamente di rewiring frontend. File principali: nuovo
  `frontend/src/components/calendar/StaffingChip.jsx` (chip di copertura per occorrenza, compatto
  con dettaglio espandibile a richiesta — nomi assegnati, `openSlots`, bottone "Modifica"); esteso
  `CalendarGrid.jsx` (nuova riga `.calendar-staffing-row` tra header giorni e griglia oraria, uno
  stile deliberatamente "badge/etichetta" e non un rettangolo pieno come `.shift-block`, per
  rinforzare la gerarchia "sopra = fabbisogno pianificato, sotto = turni assegnati" richiesta
  esplicitamente dall'utente); esteso `CalendarPage.jsx` (fetch di `coverage`/`requirements` in
  parallelo a `shifts` solo per `mode='admin'`, tre modali fabbisogno riusati **invariati**
  `StaffingScheduleModal`/`StaffingSingleModal`/`StaffingOccurrenceModal`, due nuovi bottoni in
  toolbar "Gestisci fabbisogno settimanale"/"+ Fabbisogno singolo"); rimosso
  `frontend/src/components/staffing/StaffingPanel.jsx` e i suoi montaggi in
  `DirigenteDashboard.jsx`/`AdminDashboard.jsx` — rimozione fatta **solo dopo** aver verificato in
  browser che la nuova integrazione funzionasse end-to-end (richiesta esplicita dell'utente
  durante la pianificazione, per non perdere la possibilità di gestire il fabbisogno se qualcosa
  non avesse funzionato subito). Nuove classi CSS in `styles.css` (`.calendar-staffing-*`,
  `.staffing-chip*`), nessuna modifica a `.shift-block*`/`.calendar-grid`/`.legend-*` esistenti.
  Polling della copertura unificato nel ciclo a 5s già usato da `CalendarPage` per i turni (prima
  10s in `StaffingPanel`, ora assorbito: query già ottimizzata, nessun impatto atteso). Verificato
  a fondo in locale via browser: chip corretti per giorno/fascia con copertura live (assegnati +
  Sostituzioni pubblicate), espansione con nomi corretti, generazione Sostituzioni da un chip
  scoperto (nuovi blocchi turno visibili subito nella stessa colonna), tutti e 4 i modali fabbisogno
  (settimanale, singolo, le 4 modalità di modifica occorrenza) aperti e funzionanti dalla toolbar/
  dal chip espanso, **nessuna chiamata a `/api/staffing/*` per un account Dipendente** (`mode='user'`,
  verificato via network tab), dashboard Dirigente e Responsabile entrambe funzionanti dopo la
  rimozione di `StaffingPanel.jsx` (grep di conferma: nessun import residuo). Migrazione DB: non
  necessaria, nessuna modifica allo schema.
- **2026-07-08** — **Migrazione produzione eseguita** (tabelle `staffing_requirements`/
  `staffing_requirement_exceptions` + indice `idx_cancellation_requests_shift_id`, pendenti dalle
  sessioni precedenti) e primo deploy in produzione dell'integrazione fabbisogno-calendario. Subito
  dopo il deploy l'utente ha segnalato due problemi in produzione:
  1. **Chip di copertura illeggibili**: font troppo piccolo (10px). Fix immediato in `styles.css`
     (font-size, padding e spaziatura aumentati per chip, corner label, bottone "Genera", dettaglio
     espanso) — nessuna modifica strutturale.
  2. **"Viene visualizzato solo un fabbisogno, non tutti quelli della giornata"**: non era un bug
     di rendering (verificato: fabbisogno fisso + singolo sullo stesso giorno si mostravano già
     entrambi correttamente), ma un limite architetturale reale del modello precedente — vedi il
     dettaglio ora corretto in "Fabbisogno di personale per area operativa" → "Fabbisogno fisso".
     In sintesi: `upsertWeeklySchedule` chiudeva **tutte** le regole fisse aperte dell'area ad ogni
     salvataggio (non solo quelle della fascia in modifica), quindi creare una seconda fascia fissa
     con orario diverso cancellava silenziosamente la prima. Root cause isolata riproducendo il
     caso in locale (creazione di una fascia 18:00-22:00 dopo una già esistente 08:00-14:00,
     osservata la sostituzione tramite query dirette sul DB locale). Deciso con l'utente di
     risolvere subito estendendo il modello a fasce fisse multiple indipendenti per area (coerente
     con gli esempi ristorante/magazzino della richiesta originale), non di limitarsi ad
     aggirare il problema con "Fabbisogno singolo" ripetuto. File toccati:
     `backend/src/controllers/staffingController.js` (`upsertWeeklySchedule` accetta ora
     `originalStartTime`/`originalEndTime` opzionali per scopare chiusura/sostituzione alla sola
     fascia in modifica, chiusura vuota per una fascia nuova — nessuna modifica a schema/migrazioni,
     nessun'altra funzione del controller toccata); nuovo
     `frontend/src/components/staffing/StaffingWeeklySlotsModal.jsx` (lista fasce esistenti,
     raggruppate per `(startTime,endTime)` solo lato frontend, con "+ Nuova fascia fissa" e
     "Modifica" per fascia); `StaffingScheduleModal.jsx` esteso con prop opzionale `slot` (form
     riusato identico per creazione/modifica di una fascia, più bottone "Elimina fascia" quando in
     modifica — equivalente a salvare con tutti i giorni a 0); `CalendarPage.jsx` aggiornata per
     montare `StaffingWeeklySlotsModal` al posto del vecchio `StaffingScheduleModal` diretto.
     Verificato a fondo in locale: due fasce fisse indipendenti (08-14 e 18-22) sullo stesso
     giorno/area coesistono ed entrambe visibili come chip separati nel calendario; modifica di una
     fascia (conteggio persone, aggiunta di un nuovo giorno) non altera l'altra (verificato via
     lista "Fasce fisse settimanali" prima/dopo); prevenzione duplicati (`findConflictingRequirement`)
     ancora attiva correttamente tra fasce diverse (tentativo di ricreare una fascia identica a
     un'altra esistente risponde `409` come atteso, verificato via chiamata diretta all'API).
     Nessuna migrazione DB necessaria (nessuna modifica a schema.sql). Deploy: push su `origin/main`
     dopo la verifica locale, stesso protocollo delle modifiche precedenti.
- **2026-07-08** — **Sistema avanzato di sostituzioni — Fase 1: Contratti dei dipendenti**. Avvio
  del nuovo sistema di copertura turni scoperti (piano completo a 7 fasi, vedi sezione dedicata
  "Sistema avanzato di sostituzioni"), integrato con — non sostitutivo di — le Sostituzioni
  esistenti. Prima fase interamente additiva: nuova tabella `user_contracts` (1:1 con `users`,
  massimali nullable, `custom_config` JSONB + campi di audit per estendibilità futura), nuovo
  `backend/src/controllers/contractController.js` (`getUserContract`/`upsertUserContract` con
  isolamento società + restrizione ruolo `user` + validazione numerici), route `GET`/`PUT
  /api/users/:id/contract` in `routes/users.js` (`requireManager`), nuovo
  `frontend/src/components/management/ContractModal.jsx`, bottone "Contratto" per riga dipendente in
  `UserManagementSection.jsx`, `api.getUserContract`/`api.saveUserContract` in `client.js`, classi
  `.modal-card-wide`/`.contract-grid` in `styles.css`. **Nessuna modifica a tabelle/flussi
  esistenti** (`shifts`/`claimShift`/`listAvailableShifts`/`approveRequest` intatti). Decisioni
  concordate con l'utente all'avvio: destinatari notifiche responsabili con struttura predisposta
  per un futuro legame responsabile↔area (in v1 fallback su admin/dirigente di società); contratti
  a testo libero + preset ed estendibili; escalation lazy via polling senza cron. Verificato in
  locale (migrazione idempotente 2×, endpoint via curl con happy path + tutti i casi d'errore e
  l'isolamento, flusso UI end-to-end nel browser: apertura/precaricamento/salvataggio persistito);
  dati di test rimossi al termine. **Migrazione produzione di `user_contracts`: da eseguire solo
  dopo conferma esplicita dell'utente** (stesso protocollo delle feature precedenti).
- **2026-07-08** — **Sistema avanzato di sostituzioni — Fase 2: Disponibilità dichiarate**. Fasce di
  disponibilità ricorrenti per giorno della settimana, dichiarate dal dipendente e lette (sola
  lettura) dal responsabile. Interamente additiva: nuova tabella `user_availability` (righe multiple
  per utente, `weekday` MON..SUN, `start_time`/`end_time`, CHECK orari; niente `company_id`), nuovo
  `backend/src/controllers/availabilityController.js` (`getUserAvailability` self-o-manager,
  `replaceUserAvailability` self-only con validazione + replace in blocco), route `GET`/`PUT
  /api/users/:id/availability` con solo `authenticate` (autorizzazione fine nel controller — unica
  eccezione al pattern "tutto requireManager" di `routes/users.js`), nuovo
  `frontend/src/components/profile/AvailabilityEditor.jsx` (editor self-service in `MyProfile`, con
  `WEEKDAYS` esportato), nuovo `frontend/src/components/management/AvailabilityModal.jsx` (vista
  manager read-only), bottone "Disponibilità" per riga dipendente in `UserManagementSection.jsx`,
  `api.getUserAvailability`/`api.saveUserAvailability` in `client.js`, classi `.availability-*` in
  `styles.css`. **Semantica chiave concordata**: assenza di dichiarazioni = disponibilità "ignota"
  (non incompatibile), sfruttata dal motore di compatibilità in Fase 4; il dipendente possiede le
  proprie disponibilità (le modifica solo lui). Nessuna modifica a tabelle/flussi esistenti.
  Verificato in locale (migrazione idempotente 2×, endpoint via curl con happy path + validazioni +
  isolamento self/manager/altra-società + CHECK a DB, flusso UI end-to-end sia lato dipendente sia
  lato responsabile); dati di test rimossi al termine. **Migrazione produzione di `user_availability`
  (con `user_contracts`): da eseguire solo dopo conferma esplicita dell'utente.**
- **2026-07-08** — **Sistema avanzato di sostituzioni — Fase 3: Notifiche in-app**. Notifiche per
  utente in campanella (header di tutte le dashboard), generate **in coda** ai flussi esistenti in
  modo **best-effort** (un errore di invio non fa mai fallire l'azione che le innesca). Additiva:
  nuova tabella `notifications` (destinatario `user_id`, `type`, `message`, `payload` JSONB per il
  deep-link, `is_read`, `dedupe_key` per l'escalation idempotente della Fase 7; `company_id` diretto)
  + 3 indici; nuovo `backend/src/services/notificationService.js` (risoluzione destinatari con
  priorità ai responsabili dell'area — query già pronta, fallback su admin/dirigente di società — e
  `createNotifications` best-effort con dedup `ON CONFLICT`); nuovo
  `backend/src/controllers/notificationController.js` + `routes/notifications.js` (montato in
  `app.js`); agganci `notify*` **in coda** in `shiftController` (createShift/claimShift/
  deleteShiftSelf), `cancellationController` (approve/reject), `staffingController` (generateGap) —
  nessuna modifica alla loro logica; nuovo `frontend/src/components/notifications/NotificationsBell.jsx`
  (badge non lette + pannello, polling 10s con `usePolling` in place, nessuno sfarfallio), montata in
  `.topbar-actions` nelle tre dashboard; `api.listNotifications`/`markNotificationRead`/
  `markAllNotificationsRead` in `client.js`; stili `.notif-*` in `styles.css`. Decisioni: best-effort
  (mai bloccante), destinatari responsabili con struttura predisposta per il futuro legame
  area↔responsabile (fallback v1 su tutti i manager), autore escluso dalle proprie notifiche,
  deep-link `payload` salvato ma navigazione alla tab specifica rinviata (limite v1 dichiarato, le
  aree sono tab non rotte). Verificato in locale (migrazione idempotente 2×, flusso completo via curl
  con tutti gli eventi + mark-read/mark-all + 404/401 + azioni sempre 2xx, flusso UI end-to-end con
  badge/pannello/segna-tutte/chiusura lato dipendente e dirigente); dati di test rimossi al termine.
  **Migrazione produzione di `notifications` (con `user_contracts`/`user_availability`): da eseguire
  solo dopo conferma esplicita dell'utente.**
- **2026-07-08** — **Sistema avanzato di sostituzioni — Fase 4: Motore di compatibilità + "Trova
  sostituzione"**. Motore di suggerimento **sola lettura** (nessuna migrazione DB): per una
  Sostituzione scoperta produce una classifica 0–100 con motivazioni dei dipendenti interni dell'area.
  Nuovo `backend/src/services/substitutionMatcher.js` (`rankCandidates`: pool da `user_areas`, batch
  disponibilità/contratti/storico + una `getExpandedShifts` su settimana+mese, 4 dimensioni con pesi
  in `CONFIG`, unica esclusione rigida = sovrapposizione oraria, violazioni contrattuali che
  **retrocedono** con motivazione rossa senza escludere, disponibilità ignota = neutra); nuovo
  `shiftController.getShiftCandidates` + route `GET /api/shifts/:id/candidates` (`requireManager`);
  nuovo `frontend/src/components/shifts/FindReplacementModal.jsx` (classifica con % colorate e chip
  motivazioni verde/grigio/rosso) aperto dal bottone "Trova sostituzione" in `SubstitutionsPanel`
  (solo vista `manage`); `api.getShiftCandidates` in `client.js`; classi `.candidate-*`/`.reason-*`
  in `styles.css`. Nessuna modifica a tabelle/flussi esistenti (solo lettura). Verificato in locale
  (endpoint via curl con più candidati ad attributi diversi: ranking corretto, sovrapposizione
  esclusa, violazione contratto retrocessa; errori 404/403/401; flusso UI end-to-end con classifica
  colorata nel browser); dati di test rimossi. **Nessuna migrazione**; restano pendenti solo quelle
  delle Fasi 1–3.
- **2026-07-08** — **Sistema avanzato di sostituzioni — Fase 5: Proposte mirate**. Dalla classifica di
  "Trova sostituzione" il responsabile invia una proposta solo ai candidati scelti; il dipendente la
  vede in "Le mie proposte" e Accetta/Rifiuta. **Canale aggiuntivo, non esclusivo** (la Sostituzione
  resta accettabile anche dal pannello autonomo) e **nessuna assegnazione automatica**. Nuova tabella
  `substitution_proposals` (snapshot `score`/`reasons`, `UNIQUE (shift_id,user_id)`, niente
  `company_id`). **Refactor a comportamento invariato di `claimShift`**: estratto il claim atomico in
  `shiftController.assignVolanteToUser`, unica fonte di verità riusata anche dall'accettazione delle
  proposte (la "necessità documentata" ammessa dal vincolo su `claimShift`; regressione verificata
  403/200/409). Nuovo `substitutionProposalController.js` (create/list/accept/decline), route
  `POST`/`GET /api/shifts/:id/proposals` (`requireManager`) + `routes/substitutionProposals.js`
  (`/api/proposals/*`, `authenticate`); notifiche `notifySubstitutionProposal`/`notifyProposalDeclined`
  (+ riuso `notifySubstitutionClaimed`). Frontend: `FindReplacementModal` con checkbox + invio +
  badge stato, nuovo `MyProposalsPanel.jsx` in `EmployeeDashboard`, 5 metodi in `client.js`, classi
  `.candidate-check`/`.proposal-*` in `styles.css`. Verificato in locale: migrazione idempotente 2×,
  script e2e 30/30 (invio/accept/decline/ri-proposta, gemelle `expired`, notifiche, errori
  400/401/403/404, isolamento società) + test di regressione su `claimShift`; build frontend OK; dati
  di test rimossi (CASCADE). **Migrazione produzione di `substitution_proposals` ancora da eseguire**,
  con quelle delle Fasi 1–3, su conferma dell'utente.
- **2026-07-08** — **Sistema avanzato di sostituzioni — Fase 6: Opt-out "Non partecipare" + storico
  per il motore**. (A) Il dipendente dichiara periodi di opt-out (nuova tabella `substitution_optouts`,
  `end_date` nullable = a tempo indeterminato); (B) il motore usa opt-out e rifiuti per ordinare.
  **Opt-out "blocca + retrocede"** (scelta dell'utente): non gli si invia la proposta (→ `skipped`),
  non riceve il broadcast, ed è retrocesso in fondo alla classifica con motivo rosso — ma resta
  visibile e `listAvailableShifts` è invariato (può ancora reclamare da sé). Lo storico usa i **soli
  rifiuti** da `substitution_proposals` (le accettazioni sono già i turni `volante`, niente doppio
  conteggio). Nuovo `optOutController.js` + rotte `/api/users/:id/optouts`; modifiche sola-lettura a
  `substitutionMatcher.js` (pesi `optOutPenalty`/`declinePenaltyRatio` in `CONFIG`); guardia in
  `createProposals`; `excludeOptedOut` in `notificationService.js`. Frontend: nuovo `OptOutEditor.jsx`
  in `MyProfile`, sezione read-only in `AvailabilityModal.jsx`, 3 metodi in `client.js`, classi
  `.optout-*` in `styles.css`. **Attenzione fuso orario**: date DATE formattate/validate TZ-safe (no
  `toISOString()`). Verificato in locale: migrazione idempotente 2×, e2e HTTP 24/24 + regressione Fasi
  5/claim (30/30 + 4/4) + smoke test browser; dati di test rimossi. **Migrazione produzione di
  `substitution_optouts` ancora da eseguire**, con le altre pendenti, su conferma dell'utente.
- **2026-07-08** — **Sistema avanzato di sostituzioni — Fase 7: Escalation lazy (senza cron)**. Se una
  Sostituzione resta scoperta oltre le ore configurate dal Dirigente
  (`companies.substitution_escalation_hours`, nullable = disattivata), i responsabili vengono avvisati.
  **Rilevamento lazy** dentro `notificationController.listNotifications` (gated ai manager, best-effort,
  senza cron per il vincolo serverless) e **idempotente** via `dedupe_key='escalation:<shiftId>'`. Nuovo
  `escalationService.js` + `notifySubstitutionEscalated` in `notificationService.js`. Configurazione
  riservata al **Dirigente**: nuovo `companySettingsController.js` + rotte `GET/PUT /api/company/settings`
  (`requireDirigente`) — separazione di ruoli richiesta dall'utente (Super Admin = piattaforma, Dirigente
  = regole, Responsabile = operatività). Frontend: nuovo `SubstitutionSettingsCard.jsx` in
  `DirigenteDashboard`, `getCompanySettings`/`saveCompanySettings` in `client.js`, `.settings-row` in
  `styles.css`; l'escalation è resa dalla campanella esistente. Escalation **solo ai responsabili**
  (scelta dell'utente), **avvisa e non riassegna**. Verificato in locale: migrazione idempotente 2×, e2e
  HTTP 19/19 + regressione Fasi 5/6/claim (30/30 + 24/24 + 4/4) + smoke test browser (escalation reale
  nella campanella); artefatti di test ripristinati. **Migrazione produzione della colonna
  `substitution_escalation_hours` ancora da eseguire**, con le tabelle pendenti, su conferma dell'utente.
  **Con questa fase il piano a 7 fasi del sistema avanzato di sostituzioni è completo.**
