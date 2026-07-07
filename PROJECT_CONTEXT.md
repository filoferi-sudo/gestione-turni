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
      main.jsx, App.jsx        routing (react-router-dom), mappa ruolo -> home
      api/client.js            unico client HTTP, tutte le chiamate API passano da qui
      context/AuthContext.jsx   token + user (con `areas[]`) in localStorage
      hooks/useSedeSelection.js  stato "sede selezionata" per le dashboard manager (elenco sedi
                                della società + sede attiva, persistita in localStorage)
      hooks/usePolling.js       polling leggero riutilizzabile (pausa se tab non visibile, refetch
                                immediato al ritorno di focus) per aggiornamenti quasi in tempo
                                reale sui dati condivisi tra utenti (vedi sezione dedicata)
      components/
        calendar/               CalendarPage (turni, richiede areaId+timeWindow), CalendarGrid
                                (turni sovrapposti affiancati via utils/courseLayout.layoutCourses,
                                riusato invariato), ShiftBlock (lane/laneCount come CourseBlock),
                                ShiftFormModal (senza più "ruolo richiesto"), TabbedCalendar
                                (contenitore generico multi-vista, usato ora per costruire
                                dinamicamente una tab per area)
        courses/                CoursesCalendar (richiede areaId+timeWindow), CoursesGrid,
                                CourseBlock, CourseFormModal, CoursesAvailablePanel
        shifts/SubstitutionsPanel.jsx   "Sostituzioni" (ex "turni volanti"), scoped per area
        staffing/               StaffingPanel.jsx (copertura fabbisogno, pannello separato dal
                                calendario), StaffingScheduleModal.jsx (editor settimanale),
                                StaffingSingleModal.jsx (fabbisogno singolo), StaffingOccurrenceModal.jsx
                                (le 4 modalità di modifica occorrenza)
        cancellation/           CancellationRequestsPanel (manager), MyCancellationRequests (self)
        management/UserManagementSection.jsx   colonna "Aree" + azione "Modifica aree"
        areas/AreasManagement.jsx   CRUD aree operative di una sede (solo Dirigente)
        profile/MyProfile.jsx
        stats/HoursStats.jsx     riusato sia per vista manager (tutti) sia self-service (proprie ore)
      pages/
        Login.jsx, FirstAccessSetup.jsx
        AdminDashboard.jsx (responsabile), DirigenteDashboard.jsx  entrambe: selettore sede +
                                tab calendario dinamiche costruite dalle aree della sede attiva
        dirigente/SediManagement.jsx   CRUD sedi (solo Dirigente), dentro DirigenteDashboard
        employee/EmployeeDashboard.jsx   dashboard unica per qualunque dipendente: le tab e i
                                pannelli "disponibili" si costruiscono dalle aree assegnate
                                (user.areas), non più da una categoria/dashboard hardcoded
        superadmin/SuperAdminDashboard.jsx
        CreateUser.jsx           creazione responsabile/dipendente con multi-select aree operative
                                (raggruppate per sede) al posto della vecchia categoria singola
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
  `created_at`. `created_by` referenzia `users(id)` con FK aggiunta *dopo* la creazione di
  `users` nel file, per evitare dipendenza circolare tra le due `CREATE TABLE`.
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
  riga per giorno (il numero di persone può variare giorno per giorno). L'intera programmazione
  settimanale di un'area si gestisce con un solo editor (`StaffingScheduleModal`,
  `PUT /api/staffing/requirements/weekly`): un orario condiviso da tutti i giorni, un conteggio
  per giorno (0 = nessun fabbisogno quel giorno), una data di decorrenza. **Ogni chiamata
  sostituisce l'intera programmazione precedente dell'area** da quella data in poi (chiude le
  regole aperte esistenti, ne crea di nuove): non esistono pattern settimanali paralleli per la
  stessa area.
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

**Generazione sempre manuale** (bottone "Genera sostituzioni disponibili" nel pannello, mai
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
| `CalendarPage` (turni), `CoursesCalendar` (corsi) | 5s |
| `SubstitutionsPanel`, `CoursesAvailablePanel` | 5s |
| `StaffingPanel` (Fabbisogno) | 10s |
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
  nel calendario invece di nascondersi (layout a corsie riusato dai corsi).
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

Nessuna al momento: l'ultima modifica (ottimizzazione aggiornamenti quasi in tempo reale + query
più veloci) è stata completata, testata in locale e documentata; resta solo la migrazione
dell'indice in produzione, da eseguire dopo conferma esplicita dell'utente.

## Funzionalità future previste

- **Abbonamenti/piani per società**: la tabella `companies` è pensata come punto di aggancio per
  una futura tabella `subscriptions`/`plans` (FK su `companies.id`) — non ancora costruita.
- **Gestione pagamenti** legata agli abbonamenti.
- **Limiti per piano** (es. numero massimo di dipendenti/società/sedi, funzionalità premium).
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

## Changelog / aggiornamenti

Ogni voce: data, cosa è cambiato, file principali toccati, nuove decisioni, cosa ricordare.

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
