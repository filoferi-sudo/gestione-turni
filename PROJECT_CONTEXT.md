# PROJECT_CONTEXT.md — Gestione Turni (SaaS multi-azienda)

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
multi-azienda**: più società possono usare la stessa installazione, ognuna con i propri utenti e
dati completamente isolati dalle altre.

Gestisce: calendario turni dei dipendenti (fissi ricorrenti, singoli, "Sostituzioni" da accettare —
turni pubblicati senza dipendente assegnato, con un ruolo richiesto, creati manualmente o
generati automaticamente da una cancellazione approvata), calendario corsi degli istruttori (con
la stessa logica fisso/singolo/disponibile, ma con possibilità di corsi sovrapposti nello stesso
orario), richieste di cancellazione turno con approvazione del responsabile, statistiche ore
lavorate, gestione utenti a più livelli gerarchici, e amministrazione delle società da parte di un
Super Admin di piattaforma.

## Obiettivo del progetto

Fornire uno strumento semplice e specifico (non un ERP generico) per la programmazione di turni
e corsi in strutture come piscine comunali, con un flusso di lavoro chiaro per ruolo: chi decide
gli orari (dirigente/responsabile), chi li esegue (dipendenti, categorizzati per mansione), e —
dall'introduzione del multi-tenant — chi vende/amministra il software a più clienti (super
admin). L'obiettivo di fondo è restare **rivendibile a più aziende dalla stessa piattaforma**,
mantenendo tutte le funzionalità già costruite per la singola azienda.

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
      controllers/             un controller per dominio (vedi sotto)
      routes/                  un file per dominio, wiring middleware + controller
      services/                 shiftExpansion.js, courseExpansion.js: espansione ricorrenze
      utils/                    helper puri: date/ore, generazione codici, ricorrenza
      db/
        schema.sql              SCHEMA + MIGRAZIONI IDEMPOTENTI, unica fonte di verità del DB
        seedDirigente.js        bootstrap locale/dev: crea società demo + dirigente
        seedSuperAdmin.js       crea/aggiorna l'account super admin (company_id NULL)
        reset.js                wipe dati applicativi — SOLO uso locale/dev (vedi sotto)
      constants/employeeCategories.js   unica fonte di verità categorie dipendente (backend)
  frontend/
    vercel.json                rewrite SPA per il routing lato client
    src/
      main.jsx, App.jsx        routing (react-router-dom), mappa ruolo -> home
      api/client.js            unico client HTTP, tutte le chiamate API passano da qui
      context/AuthContext.jsx   token + user in localStorage, redirect su logout/scadenza
      components/
        calendar/               CalendarPage (turni), CalendarGrid, ShiftBlock, ShiftFormModal,
                                TabbedCalendar (contenitore generico multi-vista)
        courses/                CoursesCalendar, CoursesGrid, CourseBlock, CourseFormModal,
                                CoursesAvailablePanel
        shifts/SubstitutionsPanel.jsx   "Sostituzioni" (ex "turni volanti", solo rinominate in UI)
        cancellation/           CancellationRequestsPanel (manager), MyCancellationRequests (self)
        management/UserManagementSection.jsx
        profile/MyProfile.jsx
        stats/HoursStats.jsx     riusato sia per vista manager (tutti) sia self-service (proprie ore)
      pages/
        Login.jsx, FirstAccessSetup.jsx
        AdminDashboard.jsx (responsabile), DirigenteDashboard.jsx
        employee/               BagninoDashboard.jsx, IstruttoreDashboard.jsx,
                                EmployeeDashboardRouter.jsx (registro categoria -> dashboard)
        superadmin/SuperAdminDashboard.jsx
        CreateUser.jsx           creazione responsabile/dipendente (non crea dirigenti: quelli
                                si creano solo dal pannello Super Admin)
      constants/employeeCategories.js   unica fonte di verità categorie dipendente (frontend)
      utils/                    dates.js, timeWindow.js (griglia oraria), courseLayout.js
                                (algoritmo "lane" per corsi sovrapposti)
      styles.css                unico foglio di stile, classi riusate ovunque (.card, .table,
                                .segmented, .modal-*, .badge, ecc.)
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
- `users` — `role` (`admin` | `user` | `dirigente` | `superadmin`), `category` (solo per
  `role='user'`: `bagnino` | `istruttore`, NULL altrimenti), `company_id` (NULL solo per
  `superadmin`, obbligatorio per tutti gli altri ruoli — CHECK `users_company_check`).
- `shifts` — turni: `type` (`fixed` ricorrente | `mobile` singolo | `volante` = "Sostituzione" in
  UI, disponibile), `user_id` (NULL per `volante` non ancora accettato), `company_id` **diretto**
  (non dedotto da `user_id`, vedi sotto), `recurrence_rule` (solo per `fixed`), `date` (per
  `mobile`/`volante`). Colonne aggiunte per le Sostituzioni (vedi sezione dedicata più sotto):
  `status` (`active` | `cancelled_approved`), `required_category` (ruolo richiesto, NULL = nessun
  vincolo), `origin_shift_id` (turno originale sostituito, NULL per creazione manuale).
- `shift_exceptions` — singole occorrenze escluse da un turno `fixed` ricorrente (quando una
  richiesta di cancellazione per quella data viene approvata). Non ha `company_id`: si accede
  sempre tramite `shift_id` (mai NULL), la società si eredita per JOIN.
- `cancellation_requests` — richieste di cancellazione turno, sempre da approvare (nessuna
  cancellazione automatica). `company_id` diretto (il turno collegato può essere già stato
  eliminato in seguito ad approvazione).
- `courses` — corsi, stessa logica di `shifts` ma con `instructor_id` al posto di `user_id` e
  **nessun vincolo di esclusività sull'orario** (più corsi possono sovrapporsi, istruttori/spazi
  diversi). `company_id` diretto.

**Perché `company_id` è diretto su `shifts`/`courses`/`cancellation_requests` e non dedotto da
`user_id`/`instructor_id`**: un turno o corso `volante`/disponibile nasce **senza** utente
assegnato (`user_id`/`instructor_id` NULL). Se la società si potesse dedurre solo tramite
l'utente assegnato, un turno/corso non ancora accettato non avrebbe modo di sapere a quale
società appartiene. Questo è un vincolo strutturale, non una scelta arbitraria — non
"semplificare" rimuovendo la colonna e facendo un JOIN.

## Ruoli presenti nel sistema

Gerarchia: **Super Admin → Società → Dirigente → Responsabili → Dipendenti**.

- **Super Admin** (`role='superadmin'`, `company_id` sempre NULL): non appartiene a nessuna
  società, le amministra tutte. Può creare/modificare/disattivare società, creare il primo
  dirigente di ciascuna, vedere statistiche aggregate di piattaforma. **Non entra mai** nei dati
  operativi (turni/corsi/dipendenti specifici) di una società: resta un ruolo di supervisione a
  livello di anagrafica società, non di gestione quotidiana (decisione esplicita dell'utente, non
  cambiare senza riconferma). Pannello dedicato: `/superadmin`.
- **Dirigente** (`role='dirigente'`): uno o più per società (in pratica di solito uno, ma il
  Super Admin può crearne altri). Gestisce responsabili e dipendenti della propria società,
  calendario turni/corsi, richieste di cancellazione, statistiche. Creato **solo** dal pannello
  Super Admin (`POST /api/companies/:id/dirigente`), mai da `CreateUser.jsx`/`POST /api/users`.
- **Responsabile** (`role='admin'`, in UI "Responsabile"): creato dal dirigente, stesse
  funzionalità gestionali del dirigente sul calendario/dipendenti, ma non può creare altri
  responsabili né gestire l'account dirigente.
- **Dipendente** (`role='user'`): categoria obbligatoria che determina dashboard e
  funzionalità visibili. Categorie attuali:
  - **Bagnino** — calendario turni, turni singoli/volanti, ore lavorate proprie, profilo.
  - **Istruttore** — stesse funzioni comuni + **Calendario Corsi** (sola lettura: vede tutti i
    corsi della struttura, non solo i propri) + pannello "Corsi disponibili" per accettare corsi
    pubblicati senza istruttore assegnato.
  - Nuove categorie future (Reception, Segreteria, Personal Trainer, Addetti pulizie...): si
    aggiungono in `EMPLOYEE_CATEGORIES` (backend `constants/employeeCategories.js` e frontend
    `constants/employeeCategories.js`, tenerli allineati), si aggiorna il CHECK
    `users_category_check` in `schema.sql`, si crea la dashboard dedicata e la si registra in
    `frontend/src/pages/employee/EmployeeDashboardRouter.jsx`. Nessun'altra parte del sistema
    (routing, permessi, calendario turni) va toccata: è il punto di estendibilità pensato
    apposta per questo.
  - Account dipendente creati **prima** dell'introduzione delle categorie (`category` NULL)
    ricadono automaticamente su `BagninoDashboard` (fallback in `EmployeeDashboardRouter.jsx`):
    nessuna regressione per dati storici.

## Gestione delle società/piscine

Ogni società (`companies`) ha dirigente/responsabili/dipendenti/turni/corsi/richieste
completamente isolati dalle altre tramite `company_id`. Punti chiave:

- Il **login non chiede la società**: username ed email sono **univoci a livello globale di
  piattaforma** (vincolo `UNIQUE` su `users.username`/`users.email`, non composito con
  `company_id`) — scelta deliberata, necessaria perché il login è per solo username, senza
  selettore azienda. Non renderlo unico-per-società senza ripensare anche il flusso di login.
- Il JWT di sessione include `companyId` (oltre a `id`, `username`, `role`). Ogni controller
  esistente filtra le proprie query con `req.user.companyId`, e le operazioni di
  update/delete verificano esplicitamente che la riga appartenga alla stessa società prima di
  agire (altrimenti 404, per non rivelare l'esistenza di risorse di altre società).
- **Disattivare una società** (`is_active=false`) blocca solo i **nuovi login** (controllo in
  `authController.login()`). Le sessioni già aperte (JWT, max 8h) restano valide fino a scadenza
  naturale — **scelta deliberata**, coerente con il fatto che in nessun altro punto del sistema
  si fa un controllo a DB ad ogni richiesta autenticata (si fida sempre del JWT). Non aggiungere
  un controllo DB per-request "per sicurezza" senza discuterne: sarebbe un cambio di modello
  architetturale, non un bugfix.

## Logica delle Sostituzioni (ex "turni volanti")

Evoluzione del vecchio meccanismo "turno volante": in UI il termine non esiste più, è sempre
"Sostituzione" (bottoni, legenda calendario, pannelli). **Il valore interno a DB `type='volante'`
non è cambiato** — stessa convenzione già usata per il rename "Turno mobile" → "Turno singolo":
si rinomina solo l'etichetta mostrata, mai il dato, per evitare una migrazione di dati rischiosa
e non necessaria.

Una Sostituzione nasce in due modi:
1. **Creazione manuale** (responsabile/dirigente, da `ShiftFormModal`): data, orario, note e un
   **ruolo richiesto obbligatorio** (`required_category`, stessi valori di `users.category`:
   `bagnino`/`istruttore`). Endpoint invariati (`POST/PUT /api/shifts`), solo il nuovo campo
   `requiredCategory` nel body.
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
   `origin_shift_id` = id del turno originale, `required_category` ereditata dalla categoria del
   dipendente titolare del turno cancellato (NULL se l'utente non ne ha una — sostituzione aperta
   a tutti, non un errore).

**Disponibilità e claim** (`shiftController.listAvailableShifts`/`claimShift`,
`shiftExpansion.hasOverlappingShift`):
- Un responsabile/dirigente vede **tutte** le Sostituzioni pendenti della società (vista
  "manage", invariata, può solo eliminarle).
- Un dipendente vede solo le Sostituzioni **compatibili**: `required_category` combacia con la
  propria categoria (o è NULL) *e* non ha già, in quella data/orario, un turno attivo che si
  sovrappone (fisso espanso o singolo/Sostituzione già accettata). La sovrapposizione si calcola
  riusando `getExpandedShifts` sul solo giorno interessato, stessa funzione del calendario.
- Il filtro lato lista è solo un aiuto UX: `claimShift` **ripete sempre** entrambi i controlli
  (ruolo + sovrapposizione) prima di assegnare, per non fidarsi di chi chiama l'endpoint
  direttamente bypassando la UI.

## Funzionalità già completate

- Autenticazione JWT con primo accesso via codice iniziale + impostazione password personale.
- Gestione utenti gerarchica con permessi differenziati per ruolo (`canManageTargetRole`).
- Calendario turni: fissi ricorrenti (regola settimanale o giornaliera), singoli, Sostituzioni
  (pubblicate senza dipendente, con ruolo richiesto, primo dipendente compatibile che accetta se
  le aggiudica — claim atomico via `UPDATE ... WHERE user_id IS NULL`, vedi sezione dedicata).
- Cancellazione turno: **sempre** su richiesta con approvazione di responsabile/dirigente
  (nessuna cancellazione automatica, qualunque sia il tipo o quanto manchi alla data). Per un
  turno fisso ricorrente si cancella solo la singola occorrenza richiesta (tabella
  `shift_exceptions`), la serie resta intatta; per un turno singolo/Sostituzione la riga resta in
  tabella con `status='cancelled_approved'` invece di essere eliminata. L'approvazione genera
  sempre automaticamente una nuova Sostituzione collegata (vedi sezione dedicata).
- Categorie dipendente (Bagnino, Istruttore) con dashboard dedicate.
- Calendario Corsi per istruttori: stessa logica fisso/singolo/disponibile dei turni, ma con
  supporto a corsi sovrapposti nello stesso orario mostrati **affiancati** (algoritmo di layout a
  "corsie" in `frontend/src/utils/courseLayout.js`), non nascosti l'uno sull'altro. Gestione CRUD
  completa lato dirigente/responsabile, incluso drag & drop per spostare un corso su un altro
  giorno (nativo HTML5, nessuna libreria). I corsi fissi ricorrenti **non** sono trascinabili
  (l'occorrenza non è una riga a sé: si modificano dal modulo, che agisce sull'intera serie).
  "Corsi disponibili" con claim riservato alla categoria istruttore (verificata a DB, non nel
  JWT).
- Calendario unificato a tab (`TabbedCalendar.jsx`, componente generico riutilizzabile): un solo
  calendario per pagina con selettore "Turni Bagnini" / "Corsi Istruttori" (o "Turni" / "Corsi
  Istruttori" nella dashboard personale dell'istruttore), invece di due calendari separati sulla
  stessa pagina.
- Statistiche ore lavorate: vista aggregata per manager, vista self-service per il dipendente
  (stesso componente `HoursStats.jsx`, backend forza `filterUserId = req.user.id` quando
  `role==='user'`).
- Multi-azienda (SaaS): Super Admin, entità Società, isolamento dati completo, migrazione
  automatica e non distruttiva dei dati "single-tenant" preesistenti verso una società di
  default.
- `PROJECT_CONTEXT.md` (questo file) come memoria persistente di progetto.

## Funzionalità in sviluppo

Nessuna al momento: l'ultima funzionalità (multi-azienda + Super Admin) è stata completata,
testata (locale e produzione) e deployata.

## Funzionalità future previste

- **Abbonamenti/piani per società**: la tabella `companies` è pensata come punto di aggancio per
  una futura tabella `subscriptions`/`plans` (FK su `companies.id`) — non ancora costruita.
- **Gestione pagamenti** legata agli abbonamenti.
- **Limiti per piano** (es. numero massimo di dipendenti/società, funzionalità premium).
- **Statistiche di utilizzo** della piattaforma (oltre ai conteggi aggregati già presenti in
  `getPlatformStats`).
- Nuove categorie di dipendente (Reception, Segreteria, Personal Trainer, Addetti pulizie...): il
  meccanismo di estendibilità esiste già, vedi sopra.
- Possibile evoluzione: dare al dirigente la possibilità di modificare la categoria di un
  dipendente esistente dopo la creazione (oggi la categoria si sceglie solo alla creazione,
  nessun endpoint di modifica successiva).
- Possibile evoluzione: permettere al Super Admin di eliminare (non solo disattivare) una
  società — oggi non esiste un endpoint DELETE per `companies`, la disattivazione è l'unico
  meccanismo "soft" previsto, deliberatamente (coerente con l'assenza di hard-delete altrove nel
  sistema).

## Decisioni architetturali prese

- **Niente ORM**: query SQL dirette con `pg`, parametrizzate. Ogni controller ha le proprie query,
  niente layer di astrazione condiviso tra domini (turni e corsi hanno controller/service
  *paralleli ma separati*, non un modulo generico condiviso — scelta deliberata per permettere
  alle due logiche di divergere in futuro senza intaccarsi a vicenda; vedi es. la cancellazione
  turno che richiede sempre approvazione, mentre i corsi non hanno un flusso di cancellazione
  equivalente).
- **JWT stateless, nessuna verifica a DB ad ogni richiesta**: `role`, `companyId` (e per i
  session token anche `username`) sono presi per buoni dal JWT in ogni middleware/controller.
  Le uniche eccezioni deliberate sono verifiche puntuali dove il dato non può stare nel JWT
  (es. `category` dell'istruttore per il claim di un corso, verificata a DB ad ogni richiesta
  perché cambierebbe raramente ma con conseguenze di sicurezza se stale).
- **Frontend "dumb", scoping lato backend**: la UI non sa nulla di società/isolamento dati; ogni
  filtro è applicato dal backend tramite `req.user.companyId`. Questo ha permesso di aggiungere
  il multi-tenant **senza modificare una sola dashboard esistente**.
- **Pattern "type-aware" ripetuto per turni e corsi**: entrambi usano lo stesso schema di tipi
  (`fixed`/`mobile`/`volante`), la stessa funzione di espansione ricorrenze
  (`expandRecurrenceDates` in `utils/recurrence.js`, condivisa), e la stessa struttura di
  controller (`validateTypeFields`, CRUD, `available` + `claim`). Se si modifica la logica di un
  tipo in uno dei due domini, valutare se la modifica ha senso anche nell'altro (ma non sono
  automaticamente sincronizzati: sono file separati per design, vedi sopra).
- **Autenticazione unica per primo accesso e login standard**: stesso endpoint
  `POST /api/auth/login`, il backend distingue in base a `must_change_password`.
- **`toSafeUser` duplicata** in `authController.js` e `userController.js` (non condivisa): due
  fonti di verità per la stessa proiezione dati. **Fonte già nota di bug** (vedi sotto): quando si
  aggiunge un campo a un utente che deve arrivare al frontend, va aggiunto **in entrambe le
  copie**, altrimenti il campo appare mancante solo in certi flussi (es. dopo login ma non nelle
  liste, o viceversa).

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
  "Turno mobile" → "Turno singolo": si rinomina solo l'etichetta, mai il dato salvato). Non
  rinominare il valore CHECK/enum senza un motivo forte: nessun requisito lo richiede.
- **Il filtro di disponibilità delle Sostituzioni (ruolo + sovrapposizione) è solo UX**:
  `claimShift` deve sempre riverificare entrambi i controlli lato server prima di assegnare (vedi
  sezione "Logica delle Sostituzioni"). Non rimuovere questo doppio controllo per "semplificare".
- **`company_id` diretto su `shifts`/`courses`/`cancellation_requests`**: vedi spiegazione sopra,
  non derivarlo per JOIN da `user_id`/`instructor_id` (si romperebbero i turni/corsi
  "disponibili").
- **Username/email univoci a livello di piattaforma**, non per società: necessario per il login
  senza selettore azienda.
- **`npm run db:reset` non va mai eseguito contro il database di produzione**: cancella utenti e
  dati applicativi (tranne dirigente "di bootstrap" e super admin). Prima del multi-tenant era
  sicuro (dati di una sola azienda); ora cancellerebbe i dati di **tutte** le società. Va usato
  solo in locale/dev. `npm run setup` (che lo include) è anch'esso solo per bootstrap locale.
- **Migrazioni sempre idempotenti in `schema.sql`**, mai riscritte da zero: deve poter girare
  ripetutamente sia su DB vuoti sia sul DB di produzione già popolato, senza perdita dati. Ordine:
  aggiungi colonna nullable → backfill → vincoli NOT NULL/CHECK → indici.
- **Super Admin non gestisce dati operativi di una società specifica** (decisione esplicita
  dell'utente): non aggiungere endpoint che permettano al super admin di modificare
  turni/corsi/dipendenti di una singola società senza prima riconfermare che questo vincolo
  debba cambiare.
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
  `userController.js`. Vedi la nota sopra sulla duplicazione di `toSafeUser`: è una fonte di bug
  ricorrente, controllare **entrambe le copie** ogni volta che si aggiunge un campo utente.
- **Turni volanti "non visibili ai dipendenti"**: indagine approfondita non ha trovato un bug
  reale nel codice (l'endpoint `/api/shifts/available` filtra correttamente); il sintomo era
  quasi certamente dovuto al problema di login/CORS in produzione risolto in parallelo. Se il
  problema si ripresentasse, verificare per primo lo stato della connessione API (console
  browser) prima di modificare la logica di visibilità.
- **Migrazioni schema fallite per ordine errato delle istruzioni**: capitato più volte durante lo
  sviluppo del multi-tenant (indice creato prima della colonna, vincolo CHECK aggiunto prima del
  backfill, righe orfane in `cancellation_requests` senza società deducibile). Vedi la regola
  sull'ordine delle migrazioni sopra.

### Aperti
- Nessun problema noto aperto al momento della stesura di questo file (dopo l'introduzione del
  multi-tenant, tutte le verifiche locali e di produzione sono passate).
- **Nessuna UI di storico** per i turni con `status='cancelled_approved'`: il dato persiste nel
  DB (non viene più eliminato) ma oggi è consultabile solo via query diretta, non da una schermata
  dedicata. Possibile estensione futura se il cliente lo richiede esplicitamente.

## Come continuare lo sviluppo

1. Leggi questo file per intero.
2. Verifica lo stato reale del codice per i punti rilevanti alla modifica richiesta (questo file
   riassume le decisioni e l'architettura, ma il codice sorgente resta l'unica fonte di verità
   sul comportamento esatto — non fidarti ciecamente di un dettaglio qui se il codice dice altro:
   in quel caso aggiorna questo file).
3. Per modifiche allo schema DB: segui il pattern idempotente esistente in `schema.sql`, testa in
   locale (`npm run migrate` due volte di fila, deve essere no-op la seconda), poi in produzione
   con la stessa connection string usata finora (mai `db:reset` in produzione).
4. Per nuove categorie di dipendente o nuove viste calendario: usa i punti di estendibilità già
   pensati (`EMPLOYEE_CATEGORIES`, `EmployeeDashboardRouter`, `TabbedCalendar`) invece di
   introdurre nuovi pattern paralleli.
5. Dopo la modifica: aggiorna la sezione [Changelog](#changelog--aggiornamenti) qui sotto.

## Changelog / aggiornamenti

Ogni voce: data, cosa è cambiato, file principali toccati, nuove decisioni, cosa ricordare.

- **2026-07-07** — Creazione di questo file (`PROJECT_CONTEXT.md`), a valle del completamento
  della trasformazione multi-azienda (Super Admin + Società). Nessun codice applicativo
  modificato in questo passaggio, solo documentazione.
- **2026-07-07** — Trasformazione dei turni "volanti" in "Sostituzioni": rinominato solo il testo
  UI (`type='volante'` invariato a DB, stessa convenzione del rename "Turno mobile" → "Turno
  singolo"). Nuova logica: creazione manuale con ruolo richiesto obbligatorio
  (`required_category`), creazione automatica alla cancellazione approvata di un turno esistente
  (che ora non viene più eliminato ma passa a `status='cancelled_approved'`, storico), filtro di
  disponibilità per ruolo + assenza di sovrapposizione oraria (`hasOverlappingShift`), doppio
  controllo server-side anche al momento del claim. File principali: `backend/src/db/schema.sql`
  (colonne `status`/`required_category`/`origin_shift_id` su `shifts`),
  `backend/src/services/shiftExpansion.js`, `backend/src/controllers/shiftController.js`,
  `backend/src/controllers/cancellationController.js`,
  `frontend/src/components/shifts/SubstitutionsPanel.jsx` (rinominato da
  `VolanteShiftsPanel.jsx`), `frontend/src/components/calendar/ShiftFormModal.jsx` e
  `CalendarPage.jsx`. Verificato via curl (isolamento ruolo/sovrapposizione, entrambi i rami
  fixed/mobile della cancellazione approvata) e nel browser (creazione manuale, claim, calendario
  aggiornato). Nessuna modifica ai corsi/"corso disponibile" (fuori scope, dominio parallelo ma
  separato). Da ricordare: non esiste ancora una UI di storico per `status='cancelled_approved'`
  (vedi "Problemi risolti e problemi ancora aperti" → Aperti).
