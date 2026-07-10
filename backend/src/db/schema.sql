-- Schema minimo per il sistema di autenticazione e gestione utenti

-- Società/piscine: un account "superadmin" gestisce N società, ognuna con la propria gerarchia
-- dirigente -> responsabili -> dipendenti, isolata dalle altre tramite company_id (vedi users,
-- shifts, courses, cancellation_requests). Pensata come futuro punto di aggancio per una tabella
-- subscriptions/plans (FK su companies.id) quando si implementeranno abbonamenti/pagamenti/
-- limiti di piano: non costruita ora, solo spazio predisposto.
-- created_by (chi tra i superadmin l'ha creata) si aggiunge più sotto con ALTER, dopo che
-- la tabella users esiste: altrimenti si creerebbe una dipendenza circolare tra le due CREATE TABLE.
CREATE TABLE IF NOT EXISTS companies (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(150) NOT NULL,
  email       VARCHAR(255),
  phone       VARCHAR(30),
  address     VARCHAR(255),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- category: si applica solo ai dipendenti (role = 'user'); definisce quale dashboard e quali
-- funzionalità vede. NULL per dirigente/responsabile, che non sono "categorie di dipendente".
-- Nuove categorie (reception, segreteria, personal trainer, ...) si aggiungono qui e nel
-- corrispondente registro frontend, senza toccare il resto del sistema.
-- company_id: NULL solo per 'superadmin' (non appartiene a nessuna società, le gestisce tutte);
-- obbligatorio per ogni altro ruolo.
CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL PRIMARY KEY,
  username              VARCHAR(50) UNIQUE NOT NULL,
  email                 VARCHAR(255) UNIQUE NOT NULL,
  phone                 VARCHAR(30),
  password_hash         VARCHAR(255),
  initial_code          VARCHAR(20),
  role                  VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'dirigente', 'superadmin')),
  category              VARCHAR(20) CHECK (category IS NULL OR category IN ('bagnino', 'istruttore')),
  company_id            INTEGER REFERENCES companies(id) ON DELETE CASCADE,
  must_change_password  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_company_check CHECK (
    (role = 'superadmin' AND company_id IS NULL)
    OR
    (role != 'superadmin' AND company_id IS NOT NULL)
  )
);

-- Turni: 'mobile' e 'volante' hanno una data specifica, 'fixed' è una regola ricorrente (recurrence_rule).
-- 'volante' non è assegnato inizialmente (user_id NULL finché un dipendente non lo accetta).
-- company_id è diretto (non dedotto da user_id) perché un turno 'volante' non ancora accettato
-- non ha alcun utente assegnato da cui risalire alla società.
CREATE TABLE IF NOT EXISTS shifts (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER REFERENCES users(id) ON DELETE CASCADE,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  date              DATE,
  type              VARCHAR(10) NOT NULL CHECK (type IN ('fixed', 'mobile', 'volante')),
  note              TEXT,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  recurrence_rule    VARCHAR(50),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (type = 'mobile' AND date IS NOT NULL AND recurrence_rule IS NULL AND user_id IS NOT NULL)
    OR
    (type = 'fixed' AND recurrence_rule IS NOT NULL AND user_id IS NOT NULL)
    OR
    (type = 'volante' AND date IS NOT NULL AND recurrence_rule IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_shifts_user_id ON shifts(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(date);

-- Eccezioni per turni fissi ricorrenti: singole occorrenze escluse dalla ricorrenza
-- (create quando una richiesta di cancellazione per quella data viene approvata, così
-- il resto della serie ricorrente resta intatto).
CREATE TABLE IF NOT EXISTS shift_exceptions (
  id             SERIAL PRIMARY KEY,
  shift_id       INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  excluded_date  DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shift_id, excluded_date)
);

-- Richieste di cancellazione turno: ogni cancellazione richiesta da un dipendente deve
-- sempre essere approvata dal responsabile/dirigente, qualunque sia il tipo di turno.
-- I dati del turno sono duplicati al momento della richiesta: restano leggibili anche
-- dopo che il turno viene eliminato in seguito ad approvazione.
CREATE TABLE IF NOT EXISTS cancellation_requests (
  id                SERIAL PRIMARY KEY,
  shift_id          INTEGER REFERENCES shifts(id) ON DELETE SET NULL,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  requested_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  shift_date        DATE NOT NULL,
  shift_start_time  TIME NOT NULL,
  shift_end_time    TIME NOT NULL,
  shift_note        TEXT,
  status            VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cancellation_requests_status ON cancellation_requests(status);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_requested_by ON cancellation_requests(requested_by);

-- Corsi: stessa logica dei turni ('mobile' = corso singolo, 'fixed' = corso fisso ricorrente,
-- 'volante' = corso disponibile non ancora accettato da un istruttore, instructor_id NULL finché
-- non viene accettato). A differenza dei turni, più corsi possono sovrapporsi nello stesso
-- orario (es. Corso Bambini e Corso Adulti entrambi 08:00-09:00) perché li tengono istruttori
-- diversi in spazi diversi: nessun vincolo di esclusività sull'orario.
CREATE TABLE IF NOT EXISTS courses (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(100) NOT NULL,
  instructor_id    INTEGER REFERENCES users(id) ON DELETE CASCADE,
  company_id       INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  start_time       TIME NOT NULL,
  end_time         TIME NOT NULL,
  date             DATE,
  type             VARCHAR(10) NOT NULL CHECK (type IN ('fixed', 'mobile', 'volante')),
  note             TEXT,
  created_by       INTEGER NOT NULL REFERENCES users(id),
  recurrence_rule  VARCHAR(50),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (type = 'mobile' AND date IS NOT NULL AND recurrence_rule IS NULL AND instructor_id IS NOT NULL)
    OR
    (type = 'fixed' AND recurrence_rule IS NOT NULL AND instructor_id IS NOT NULL)
    OR
    (type = 'volante' AND date IS NOT NULL AND recurrence_rule IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_courses_date ON courses(date);
CREATE INDEX IF NOT EXISTS idx_courses_instructor_id ON courses(instructor_id);
CREATE INDEX IF NOT EXISTS idx_companies_is_active ON companies(is_active);

-- Sedi: una società può avere una o più sedi fisiche. calendar_start_time/calendar_end_time
-- personalizzano l'intervallo orario mostrato nel calendario di quella sede (default invariati
-- rispetto al comportamento storico: 07:30-23:00).
CREATE TABLE IF NOT EXISTS sedi (
  id                    SERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                  VARCHAR(150) NOT NULL,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  display_order         INTEGER NOT NULL DEFAULT 0,
  calendar_start_time   TIME NOT NULL DEFAULT '07:30',
  calendar_end_time     TIME NOT NULL DEFAULT '23:00',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (calendar_end_time > calendar_start_time)
);

CREATE INDEX IF NOT EXISTS idx_sedi_company_id ON sedi(company_id);

-- Aree operative: definite liberamente dal Dirigente dentro una sede (Bagnini, Reception, Bar,
-- Manutenzione, ...). calendar_mode decide quale motore di calendario usa l'area: 'shifts' (turni
-- fisso/singolo/Sostituzione, il caso generale) oppure 'courses' (corsi nominati con sovrapposizioni
-- affiancate, per aree stile "Istruttori"). Nessuna area è predefinita dal codice: il Dirigente le
-- crea tutte, anche quelle che replicano concettualmente le vecchie categorie bagnino/istruttore.
CREATE TABLE IF NOT EXISTS operational_areas (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sede_id           INTEGER NOT NULL REFERENCES sedi(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,
  calendar_mode     VARCHAR(10) NOT NULL DEFAULT 'shifts' CHECK (calendar_mode IN ('shifts', 'courses')),
  display_order     INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operational_areas_sede_id ON operational_areas(sede_id);
CREATE INDEX IF NOT EXISTS idx_operational_areas_company_id ON operational_areas(company_id);

-- Assegnazione dipendente <-> area operativa: un dipendente può appartenere a più aree
-- contemporaneamente (sostituisce il vecchio users.category, che restava un valore singolo).
CREATE TABLE IF NOT EXISTS user_areas (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_id  INTEGER NOT NULL REFERENCES operational_areas(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_user_areas_area_id ON user_areas(area_id);

-- Migrazioni idempotenti per database creati con versioni precedenti dello schema
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'dirigente', 'superadmin'));

ALTER TABLE shifts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_type_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_type_check CHECK (type IN ('fixed', 'mobile', 'volante'));
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_check CHECK (
  (type = 'mobile' AND date IS NOT NULL AND recurrence_rule IS NULL AND user_id IS NOT NULL)
  OR
  (type = 'fixed' AND recurrence_rule IS NOT NULL AND user_id IS NOT NULL)
  OR
  (type = 'volante' AND date IS NOT NULL AND recurrence_rule IS NULL)
);

-- Permette di eliminare un utente anche se ha richieste di cancellazione turno
-- associate (come richiedente o come chi ha deciso): la riga resta ma perde il riferimento.
ALTER TABLE cancellation_requests ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE cancellation_requests DROP CONSTRAINT IF EXISTS cancellation_requests_requested_by_fkey;
ALTER TABLE cancellation_requests ADD CONSTRAINT cancellation_requests_requested_by_fkey
  FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE cancellation_requests DROP CONSTRAINT IF EXISTS cancellation_requests_decided_by_fkey;
ALTER TABLE cancellation_requests ADD CONSTRAINT cancellation_requests_decided_by_fkey
  FOREIGN KEY (decided_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS category VARCHAR(20);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_category_check;
ALTER TABLE users ADD CONSTRAINT users_category_check
  CHECK (category IS NULL OR category IN ('bagnino', 'istruttore'));

-- I corsi adottano la stessa logica dei turni (fisso/singolo/disponibile): instructor_id e date
-- diventano opzionali (un corso 'volante' nasce senza istruttore, un corso 'fixed' usa
-- recurrence_rule al posto di date), e serve la colonna type per distinguerli.
ALTER TABLE courses ALTER COLUMN instructor_id DROP NOT NULL;
ALTER TABLE courses ALTER COLUMN date DROP NOT NULL;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS recurrence_rule VARCHAR(50);
ALTER TABLE courses ADD COLUMN IF NOT EXISTS type VARCHAR(10) NOT NULL DEFAULT 'mobile';
ALTER TABLE courses ALTER COLUMN type DROP DEFAULT;
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_type_check;
ALTER TABLE courses ADD CONSTRAINT courses_type_check CHECK (type IN ('fixed', 'mobile', 'volante'));
ALTER TABLE courses DROP CONSTRAINT IF EXISTS courses_check;
ALTER TABLE courses ADD CONSTRAINT courses_check CHECK (
  (type = 'mobile' AND date IS NOT NULL AND recurrence_rule IS NULL AND instructor_id IS NOT NULL)
  OR
  (type = 'fixed' AND recurrence_rule IS NOT NULL AND instructor_id IS NOT NULL)
  OR
  (type = 'volante' AND date IS NOT NULL AND recurrence_rule IS NULL)
);

-- Multi-azienda (SaaS): aggiunge companies e company_id a ogni dato operativo. Un solo
-- npm run migrate gestisce sia l'installazione pulita (niente da migrare) sia un database già
-- popolato in modalità "azienda singola": crea in automatico una società "Società Principale" e
-- ci collega tutto ciò che esiste già, così l'app continua a funzionare come prima senza alcun
-- intervento manuale. Non elimina né sposta mai dati.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS created_by INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE users ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;

-- Se esistono già utenti "single-tenant" (creati prima di questa migrazione) ma nessuna società,
-- ne crea una di default e ci collega tutto: dirigente, responsabili, dipendenti esistenti.
INSERT INTO companies (name)
  SELECT 'Società Principale'
   WHERE EXISTS (SELECT 1 FROM users WHERE role != 'superadmin' AND company_id IS NULL)
     AND NOT EXISTS (SELECT 1 FROM companies);

UPDATE users SET company_id = (SELECT id FROM companies ORDER BY id LIMIT 1)
 WHERE company_id IS NULL AND role != 'superadmin';

-- Il CHECK va aggiunto solo dopo il backfill: altrimenti fallirebbe subito sulle righe esistenti
-- che, prima di questa migrazione, non avevano ancora alcuna company_id.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_company_check;
ALTER TABLE users ADD CONSTRAINT users_company_check CHECK (
  (role = 'superadmin' AND company_id IS NULL)
  OR
  (role != 'superadmin' AND company_id IS NOT NULL)
);

-- company_id è diretto anche su shifts/courses/cancellation_requests (non dedotto da user_id/
-- instructor_id) perché un turno o corso 'volante' non ancora accettato non ha alcun utente
-- assegnato da cui risalire alla società.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
UPDATE shifts SET company_id = (SELECT u.company_id FROM users u WHERE u.id = shifts.created_by)
 WHERE company_id IS NULL;
ALTER TABLE shifts ALTER COLUMN company_id SET NOT NULL;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
UPDATE courses SET company_id = (SELECT u.company_id FROM users u WHERE u.id = courses.created_by)
 WHERE company_id IS NULL;
ALTER TABLE courses ALTER COLUMN company_id SET NOT NULL;

-- Il turno collegato a una richiesta di cancellazione può essere già stato eliminato (approvazione
-- di un turno singolo/volante cancella la riga, shift_id diventa NULL), e anche il richiedente o
-- chi ha deciso possono nel frattempo essere stati eliminati: si ricava la società dal turno se
-- possibile, altrimenti da chi ha richiesto o deciso, altrimenti (riga ormai "orfana") dall'unica
-- società esistente al momento di questa migrazione (prima di questa migrazione ce n'era una sola).
ALTER TABLE cancellation_requests ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE;
UPDATE cancellation_requests cr SET company_id = COALESCE(
  (SELECT s.company_id FROM shifts s WHERE s.id = cr.shift_id),
  (SELECT u.company_id FROM users u WHERE u.id = cr.requested_by),
  (SELECT u.company_id FROM users u WHERE u.id = cr.decided_by),
  (SELECT id FROM companies ORDER BY id LIMIT 1)
) WHERE cr.company_id IS NULL;
ALTER TABLE cancellation_requests ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shifts_company_id ON shifts(company_id);
CREATE INDEX IF NOT EXISTS idx_courses_company_id ON courses(company_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_company_id ON cancellation_requests(company_id);

-- Sostituzioni: evoluzione dei turni 'volante'. Il valore interno type='volante' NON cambia
-- (stessa convenzione già usata per 'mobile' -> "Turno singolo": si rinomina solo l'etichetta in
-- UI, mai il dato). Una sostituzione può nascere manualmente (con un ruolo richiesto scelto dal
-- responsabile/dirigente) oppure automaticamente quando una richiesta di cancellazione viene
-- approvata (vedi cancellationController.approveRequest).
--
-- status: quando la cancellazione di un turno 'mobile'/'volante' assegnato viene approvata, la
-- riga non viene più eliminata (a differenza di prima) ma passa a 'cancelled_approved': resta in
-- tabella come storico ma sparisce dal calendario attivo (getExpandedShifts filtra status='active').
-- I turni 'fixed' continuano a usare shift_exceptions per la singola occorrenza, invariato.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_status_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_status_check CHECK (status IN ('active', 'cancelled_approved'));

-- required_category: il "ruolo richiesto" di una sostituzione (solo type='volante'). Riusa gli
-- stessi valori di users.category, NULL = nessun vincolo di ruolo.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS required_category VARCHAR(20);
ALTER TABLE shifts DROP CONSTRAINT IF EXISTS shifts_required_category_check;
ALTER TABLE shifts ADD CONSTRAINT shifts_required_category_check
  CHECK (required_category IS NULL OR required_category IN ('bagnino', 'istruttore'));

-- origin_shift_id: per le sostituzioni generate automaticamente da una cancellazione approvata,
-- punta al turno originale che sostituiscono (fisso o singolo). NULL per quelle create a mano.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS origin_shift_id INTEGER REFERENCES shifts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_origin_shift_id ON shifts(origin_shift_id);

-- Configurabilità: Sedi -> Aree operative. Un solo npm run migrate porta un database "a categorie
-- fisse" (bagnino/istruttore) allo stato configurabile, senza perdita di funzionalità: crea una
-- sede di default per ogni società esistente, due aree che replicano esattamente le vecchie
-- categorie (così dashboard/permessi restano identici subito dopo la migrazione), collega ogni
-- dipendente/turno/corso esistente all'area corrispondente. Da qui in poi il Dirigente può
-- rinominare, aggiungere o rimuovere aree/sedi liberamente: la migrazione è solo il punto di
-- partenza compatibile con i dati preesistenti, non un vincolo permanente.
INSERT INTO sedi (company_id, name)
  SELECT id, 'Sede Principale' FROM companies c
   WHERE NOT EXISTS (SELECT 1 FROM sedi s WHERE s.company_id = c.id);

INSERT INTO operational_areas (company_id, sede_id, name, calendar_mode, display_order)
  SELECT s.company_id, s.id, 'Bagnino', 'shifts', 0
    FROM sedi s
   WHERE NOT EXISTS (SELECT 1 FROM operational_areas oa WHERE oa.sede_id = s.id AND oa.name = 'Bagnino');

INSERT INTO operational_areas (company_id, sede_id, name, calendar_mode, display_order)
  SELECT s.company_id, s.id, 'Istruttore', 'courses', 1
    FROM sedi s
   WHERE NOT EXISTS (SELECT 1 FROM operational_areas oa WHERE oa.sede_id = s.id AND oa.name = 'Istruttore');

-- Ogni dipendente con una category valorizzata viene collegato all'area equivalente della sede
-- di default (la prima) della propria società: nessun dipendente perde l'accesso al proprio
-- calendario dopo la migrazione.
INSERT INTO user_areas (user_id, area_id)
  SELECT u.id, oa.id
    FROM users u
    JOIN sedi s ON s.company_id = u.company_id AND s.id = (
      SELECT id FROM sedi s2 WHERE s2.company_id = u.company_id ORDER BY id LIMIT 1
    )
    JOIN operational_areas oa ON oa.sede_id = s.id
      AND oa.name = CASE u.category WHEN 'bagnino' THEN 'Bagnino' WHEN 'istruttore' THEN 'Istruttore' END
   WHERE u.category IS NOT NULL
  ON CONFLICT (user_id, area_id) DO NOTHING;

-- sede_id/area_id su shifts e courses: ordine nullable -> backfill -> NOT NULL, come da
-- convenzione del progetto. company_id NON viene toccato: resta la fonte di verità per
-- l'isolamento multi-tenant, area_id si aggiunge per lo scoping fine per area operativa.
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS sede_id INTEGER REFERENCES sedi(id) ON DELETE CASCADE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS area_id INTEGER REFERENCES operational_areas(id) ON DELETE CASCADE;
UPDATE shifts s SET
  sede_id = (SELECT id FROM sedi WHERE company_id = s.company_id ORDER BY id LIMIT 1),
  area_id = (
    SELECT oa.id FROM operational_areas oa
     WHERE oa.name = 'Bagnino'
       AND oa.sede_id = (SELECT id FROM sedi WHERE company_id = s.company_id ORDER BY id LIMIT 1)
  )
 WHERE s.area_id IS NULL;
ALTER TABLE shifts ALTER COLUMN sede_id SET NOT NULL;
ALTER TABLE shifts ALTER COLUMN area_id SET NOT NULL;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS sede_id INTEGER REFERENCES sedi(id) ON DELETE CASCADE;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS area_id INTEGER REFERENCES operational_areas(id) ON DELETE CASCADE;
UPDATE courses c SET
  sede_id = (SELECT id FROM sedi WHERE company_id = c.company_id ORDER BY id LIMIT 1),
  area_id = (
    SELECT oa.id FROM operational_areas oa
     WHERE oa.name = 'Istruttore'
       AND oa.sede_id = (SELECT id FROM sedi WHERE company_id = c.company_id ORDER BY id LIMIT 1)
  )
 WHERE c.area_id IS NULL;
ALTER TABLE courses ALTER COLUMN sede_id SET NOT NULL;
ALTER TABLE courses ALTER COLUMN area_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shifts_sede_id ON shifts(sede_id);
CREATE INDEX IF NOT EXISTS idx_shifts_area_id ON shifts(area_id);
CREATE INDEX IF NOT EXISTS idx_courses_sede_id ON courses(sede_id);
CREATE INDEX IF NOT EXISTS idx_courses_area_id ON courses(area_id);

-- Fabbisogno di personale: livello superiore ai turni, esprime "quante persone servono" in
-- un'area/fascia oraria a prescindere da chi sia già assegnato. 'fixed' = regola ricorrente per
-- giorno della settimana (una riga per giorno, perché il numero di persone può variare
-- giorno per giorno); 'single' = esigenza straordinaria per una sola data, non tocca la
-- programmazione ricorrente. Una regola 'fixed' è un pattern "split": modificarla "da questa
-- occorrenza in poi" chiude la riga corrente (effective_until = data-1) e ne crea una nuova da
-- quella data, stesso principio dei turni fissi con recurrence_rule ma con granularità per
-- giorno della settimana. Solo per aree con calendar_mode='shifts' (verificato in
-- staffingController.js, non imponibile con un CHECK cross-tabella in Postgres).
CREATE TABLE IF NOT EXISTS staffing_requirements (
  id                SERIAL PRIMARY KEY,
  company_id        INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  area_id           INTEGER NOT NULL REFERENCES operational_areas(id) ON DELETE CASCADE,
  req_type          VARCHAR(10) NOT NULL CHECK (req_type IN ('fixed', 'single')),
  weekday           VARCHAR(3) CHECK (weekday IN ('MON','TUE','WED','THU','FRI','SAT','SUN')),
  date              DATE,
  start_time        TIME NOT NULL,
  end_time          TIME NOT NULL,
  required_count    INTEGER NOT NULL CHECK (required_count >= 0),
  effective_from    DATE NOT NULL,
  effective_until   DATE,
  note              TEXT,
  created_by        INTEGER NOT NULL REFERENCES users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time),
  CHECK (
    (req_type = 'fixed' AND weekday IS NOT NULL AND date IS NULL)
    OR
    (req_type = 'single' AND date IS NOT NULL AND weekday IS NULL AND effective_until IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_staffing_requirements_area_id ON staffing_requirements(area_id);

-- Eccezione a una singola occorrenza di una regola 'fixed': sovrascrive il numero di persone
-- richieste oppure elimina l'occorrenza per quella sola data, senza toccare la regola generale
-- (stesso principio di shift_exceptions, esteso con un override numerico invece della sola
-- esclusione, perché qui serve anche poter cambiare il numero di persone per un solo giorno).
CREATE TABLE IF NOT EXISTS staffing_requirement_exceptions (
  id               SERIAL PRIMARY KEY,
  requirement_id   INTEGER NOT NULL REFERENCES staffing_requirements(id) ON DELETE CASCADE,
  exception_date   DATE NOT NULL,
  is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
  override_count   INTEGER CHECK (override_count IS NULL OR override_count >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (requirement_id, exception_date),
  CHECK (
    (is_deleted = TRUE AND override_count IS NULL)
    OR
    (is_deleted = FALSE AND override_count IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_staffing_req_exceptions_requirement_id
  ON staffing_requirement_exceptions(requirement_id);

-- Collega una Sostituzione generata per coprire un buco di fabbisogno alla regola che l'ha
-- generata (NULL per tutte le Sostituzioni create manualmente o da cancellazione approvata, come
-- oggi): nullable, nessun backfill, nessun vincolo NOT NULL — additivo puro, zero rischio sulle
-- righe esistenti e sui flussi che non lo leggono/scrivono (createShift, updateShift, claimShift).
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS requirement_id
  INTEGER REFERENCES staffing_requirements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_shifts_requirement_id ON shifts(requirement_id);

-- Usato da shiftController.deleteShiftSelf per il controllo di richieste pendenti duplicate sullo
-- stesso turno; mancava rispetto agli altri indici già presenti su cancellation_requests.
CREATE INDEX IF NOT EXISTS idx_cancellation_requests_shift_id ON cancellation_requests(shift_id);

-- ============================================================================
-- Contratti dei dipendenti (Fase 1 - sistema avanzato di sostituzioni)
-- ============================================================================
-- Configurazione contrattuale per dipendente: tipologia, massimali di ore e vincoli.
-- In una fase successiva il "motore di compatibilità" li leggerà per ORDINARE i candidati
-- a una sostituzione (mai per escluderli in automatico: la decisione resta del responsabile).
-- Additivo puro: nessuna modifica a tabelle/flussi esistenti, nessun backfill.
--
-- 1:1 con users (UNIQUE user_id): la riga rappresenta il contratto CORRENTE del dipendente.
-- Struttura pensata per essere estesa senza migrazioni distruttive:
--   * contract_type è testo libero (i preset sono solo suggerimenti lato UI): nuove tipologie
--     non richiedono modifiche allo schema;
--   * custom_config JSONB raccoglie vincoli aziendali specifici/futuri senza aggiungere colonne;
--   * i campi di audit (created_by/updated_by/created_at/updated_at) permettono di introdurre
--     in futuro una tabella di storico (es. user_contract_history) come modifica puramente
--     additiva, senza toccare questa tabella.
-- company_id NON è duplicato qui: a differenza di shifts/courses (dove user_id può essere NULL),
-- un contratto ha sempre un user_id valorizzato, quindi la società si ricava per JOIN su users;
-- l'isolamento è verificato nel controller (target.company_id === req.user.companyId).
-- Tutti i massimali sono nullable = "non configurato, nessun vincolo".
CREATE TABLE IF NOT EXISTS user_contracts (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  contract_type         VARCHAR(60),
  max_weekly_hours      NUMERIC(5,2) CHECK (max_weekly_hours  IS NULL OR max_weekly_hours  >= 0),
  max_monthly_hours     NUMERIC(6,2) CHECK (max_monthly_hours IS NULL OR max_monthly_hours >= 0),
  min_weekly_hours      NUMERIC(5,2) CHECK (min_weekly_hours  IS NULL OR min_weekly_hours  >= 0),
  max_daily_hours       NUMERIC(4,2) CHECK (max_daily_hours   IS NULL OR max_daily_hours   >= 0),
  max_consecutive_days  INTEGER      CHECK (max_consecutive_days IS NULL OR max_consecutive_days >= 0),
  weekly_rest_days      INTEGER      CHECK (weekly_rest_days IS NULL OR weekly_rest_days >= 0),
  note                  TEXT,
  custom_config         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Nessun indice separato su user_id: il vincolo UNIQUE ne crea già uno implicito.

-- ============================================================================
-- Disponibilità dichiarate dei dipendenti (Fase 2 - sistema avanzato di sostituzioni)
-- ============================================================================
-- Fasce di disponibilità ricorrenti per giorno della settimana dichiarate dal dipendente stesso
-- (es. "lunedì 08:00-14:00", "mercoledì 18:00-22:00"). Più righe per utente (anche più fasce lo
-- stesso giorno). Le userà (Fase 4) il motore di compatibilità per ORDINARE i candidati, mai per
-- escluderli: in particolare l'ASSENZA di righe per un utente significa disponibilità "ignota"
-- (non incompatibile) — il candidato resta in classifica con la motivazione "necessaria verifica
-- disponibilità". Additivo puro: nessuna modifica a tabelle/flussi esistenti.
-- weekday usa la stessa convenzione MON..SUN già adottata da staffing_requirements e
-- utils/recurrence.js (DAY_CODES), così i confronti col giorno di un turno restano omogenei.
-- Nessun company_id: user_id è sempre valorizzato (la società si ricava per JOIN), l'isolamento è
-- verificato nel controller. Il dipendente modifica solo le proprie righe; il responsabile le legge.
CREATE TABLE IF NOT EXISTS user_availability (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday     VARCHAR(3) NOT NULL CHECK (weekday IN ('MON','TUE','WED','THU','FRI','SAT','SUN')),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_user_availability_user_id ON user_availability(user_id);

-- ============================================================================
-- Notifiche in-app (Fase 3 - sistema avanzato di sostituzioni)
-- ============================================================================
-- Notifiche per utente, visibili nella campanella dell'header. Generate "in coda" ai flussi già
-- esistenti (creazione/claim di una Sostituzione, richiesta/decisione di cancellazione, generazione
-- da fabbisogno) tramite services/notificationService.js, in modo best-effort: un errore di invio
-- non deve mai far fallire l'azione principale. Additivo puro.
--   * user_id = DESTINATARIO della notifica.
--   * type = categoria (es. 'substitution_available', 'substitution_claimed', ...), usata lato
--     frontend per l'icona/il raggruppamento; testo libero versionabile senza migrazioni.
--   * payload JSONB = riferimenti per il collegamento diretto alla funzione (shiftId/areaId/sedeId/
--     date/proposalId...), senza aggiungere colonne quando serviranno nuovi tipi.
--   * dedupe_key (nullable) = chiave di deduplica per le notifiche generate in modo idempotente
--     (es. l'escalation "nessuno ha accettato" della Fase 7, rilevata al polling): un indice unico
--     PARZIALE su (user_id, dedupe_key) evita di re-inserire la stessa notifica ad ogni tick.
-- company_id è diretto qui (a differenza di user_contracts/user_availability): le notifiche sono
-- una tabella trasversale ad alto volume, il valore arriva sempre dal contesto dell'evento (che ha
-- già companyId) e permette scoping/pulizia per società senza JOIN.
CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  company_id  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(40) NOT NULL,
  message     TEXT NOT NULL,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  dedupe_key  VARCHAR(200),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC);
-- Indice parziale per il conteggio veloce delle non lette (badge campanella).
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id) WHERE is_read = FALSE;
-- Deduplica idempotente solo per le notifiche con dedupe_key valorizzata (escalation lazy, Fase 7).
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
  ON notifications(user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ============================================================================
-- Proposte mirate di sostituzione (Fase 5 - sistema avanzato di sostituzioni)
-- ============================================================================
-- Terzo livello di copertura dei turni scoperti (dopo autonomia dei dipendenti e classifica dei
-- candidati): il responsabile, dalla classifica di "Trova sostituzione", INVIA una proposta SOLO ai
-- candidati che sceglie (non a tutti). Ogni proposta è una riga qui. Additivo puro: non modifica la
-- logica esistente di claimShift/listAvailableShifts/approveRequest — l'accettazione riusa lo stesso
-- claim atomico di claimShift (identici doppi controlli area + sovrapposizione).
--   * shift_id  = la Sostituzione scoperta (turno 'volante' non assegnato) proposta.
--   * user_id   = dipendente destinatario della proposta.
--   * proposed_by = responsabile/dirigente che l'ha inviata (SET NULL se l'account viene rimosso).
--   * status = pending | accepted | declined | expired. 'expired' = il turno è stato coperto per
--     altra via (accettazione diretta di un altro, o accettazione di una proposta gemella): la
--     proposta non è più azionabile. Il click del dipendente decide sempre (mai automatico).
--   * score / reasons = FOTOGRAFIA della classifica di compatibilità al momento dell'invio
--     (snapshot), così la motivazione mostrata al dipendente/al responsabile resta stabile anche se
--     i turni/le disponibilità cambiano dopo l'invio. reasons è la stessa forma tipizzata del motore
--     (array di { text, kind }).
-- Nessun company_id: shift_id e user_id sono sempre valorizzati (a differenza di shifts/courses),
-- la società si ricava per JOIN (shift.company_id è l'autoritativo) e l'isolamento è verificato nel
-- controller — stesso principio di user_contracts/user_availability.
-- UNIQUE (shift_id, user_id): una sola proposta per coppia turno-dipendente; ri-proporre dopo un
-- declino/scadenza è un UPSERT che la riporta a 'pending' (ON CONFLICT DO UPDATE nel controller).
CREATE TABLE IF NOT EXISTS substitution_proposals (
  id            SERIAL PRIMARY KEY,
  shift_id      INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  proposed_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status        VARCHAR(10) NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  score         INTEGER,
  reasons       JSONB NOT NULL DEFAULT '[]'::jsonb,
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shift_id, user_id)
);

-- Elenco delle proposte pendenti di un dipendente (pannello "Le mie proposte").
CREATE INDEX IF NOT EXISTS idx_substitution_proposals_user_status
  ON substitution_proposals(user_id, status);
-- Proposte di una data Sostituzione (vista responsabile + scadenza delle gemelle all'accettazione).
CREATE INDEX IF NOT EXISTS idx_substitution_proposals_shift
  ON substitution_proposals(shift_id);

-- ============================================================================
-- Opt-out "Non partecipare" (Fase 6 - sistema avanzato di sostituzioni)
-- ============================================================================
-- Periodi in cui un dipendente dichiara di NON voler essere considerato per le sostituzioni (es.
-- ferie, o "da oggi in poi" con end_date NULL = a tempo indeterminato). Additivo puro: dichiarato
-- dal dipendente stesso (self-service, come user_availability), letto anche dal responsabile in sola
-- lettura. Effetti (tutti additivi, nessuna modifica ai flussi core):
--   * il motore di compatibilità RETROCEDE il candidato in opt-out (motivazione rossa, resta comunque
--     visibile: nessuna esclusione silenziosa);
--   * il responsabile NON può inviargli una proposta mirata nel periodo (finisce in `skipped`);
--   * niente notifica broadcast "nuova sostituzione disponibile" nel periodo.
-- NON tocca listAvailableShifts: il dipendente resta libero di reclamare autonomamente una
-- sostituzione se cambia idea (l'opt-out è "non sollecitarmi", non "non posso").
-- Un opt-out è attivo su una data D se: start_date <= D AND (end_date IS NULL OR end_date >= D).
-- Nessun company_id: user_id sempre valorizzato (società per JOIN), isolamento nel controller — stesso
-- principio di user_contracts/user_availability.
CREATE TABLE IF NOT EXISTS substitution_optouts (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date  DATE NOT NULL,
  end_date    DATE,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_substitution_optouts_user ON substitution_optouts(user_id);

-- ============================================================================
-- Escalation lazy delle sostituzioni (Fase 7 - sistema avanzato di sostituzioni)
-- ============================================================================
-- Ore di attesa prima che una Sostituzione ancora scoperta venga segnalata ai responsabili
-- (escalation). Configurabile PER SOCIETÀ dal Dirigente (regola organizzativa interna, non tocca il
-- Super Admin). NULL o <= 0 = escalation DISATTIVATA (opt-in): una società la abilita impostando un
-- numero di ore. Il rilevamento è LAZY (nessun cron, vincolo hosting serverless): avviene quando un
-- responsabile carica le notifiche (GET /api/notifications), in modo best-effort e idempotente
-- (deduplica via notifications.dedupe_key = 'escalation:<shiftId>', già predisposta in Fase 3).
-- Additivo puro: nessuna modifica ai flussi esistenti.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS substitution_escalation_hours INTEGER;

-- ============================================================================
-- Protezione brute-force sul login (Fase S2 - iniziativa Sicurezza)
-- ============================================================================
-- Blocco temporaneo dell'account dopo troppi tentativi di login falliti. Stato persistito su DB
-- (non in memoria): su hosting serverless (Vercel) le invocazioni non condividono memoria, quindi
-- un rate-limiter in-memory sarebbe inefficace. Soglia e durata del blocco sono configurabili via
-- env (LOGIN_MAX_ATTEMPTS / LOGIN_LOCKOUT_MINUTES, vedi config/security.js), non nello schema.
--   * failed_login_attempts = tentativi falliti consecutivi (azzerato al login riuscito).
--   * locked_until = istante fino al quale l'account è bloccato (NULL = non bloccato). Superato
--     l'istante, il blocco è considerato scaduto senza bisogno di un job di pulizia.
-- Additivo puro: nessuna modifica ai flussi esistenti oltre al login.
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- ============================================================================
-- Audit trail / tracciabilità (Fase S3 - iniziativa Sicurezza)
-- ============================================================================
-- Registro delle operazioni importanti: accessi, modifiche ai dati, ai turni/corsi, assegnazioni,
-- eliminazioni, azioni amministrative. Serve a rispondere a "chi ha fatto cosa e quando".
--   * company_id   = società di contesto (NULL per azioni del super admin, che non appartiene a
--                    nessuna società — es. creazione/disattivazione società).
--   * actor_user_id = chi ha compiuto l'azione (NULL se l'account viene poi eliminato: ON DELETE
--                    SET NULL preserva lo storico anche se l'utente sparisce; login falliti su
--                    username inesistente restano comunque tracciati con actor NULL).
--   * action       = codice azione (es. 'auth.login', 'user.create', 'shift.delete', ...).
--   * entity_type / entity_id = risorsa toccata (es. 'user' / 42), entrambi opzionali.
--   * metadata     = dettagli extra in JSONB (mai dati sensibili come password), opzionale.
--   * ip           = indirizzo del chiamante (dietro proxy: primo valore di X-Forwarded-For).
-- Scrittura BEST-EFFORT e non bloccante (come le notifiche): un errore di audit non fa mai fallire
-- l'operazione applicativa. Additivo puro.
CREATE TABLE IF NOT EXISTS audit_logs (
  id             SERIAL PRIMARY KEY,
  company_id     INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  actor_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action         VARCHAR(50) NOT NULL,
  entity_type    VARCHAR(50),
  entity_id      INTEGER,
  metadata       JSONB,
  ip             VARCHAR(64),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consultazione tipica: eventi recenti di una società, in ordine cronologico inverso.
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created ON audit_logs(company_id, created_at DESC);
-- Ricerca per risorsa specifica ("storia di questo utente/turno").
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- ============================================================================
-- Predisposizione verifica email + autenticazione avanzata (Fase S4 - iniziativa Sicurezza)
-- ============================================================================
-- SOLO STRUTTURA: nessun invio email è attivo in questa fase. Si prepara il terreno per verifica
-- email, reset password via link temporaneo e 2FA via email, tutte funzioni future.
--
-- Stato di verifica dell'email e (predisposizione) 2FA sull'utente.
--   * email_verified = l'indirizzo email è stato confermato dall'utente (default FALSE: gli account
--     esistenti risultano "non verificati" finché non lo confermeranno in futuro — nessun impatto
--     sui flussi attuali, che non consultano ancora questo campo).
--   * two_factor_enabled = predisposizione per la 2FA via email (default FALSE, non ancora usata).
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT FALSE;
-- pending_email (Fase E2) = nuovo indirizzo in attesa di conferma nel flusso di CAMBIO email. Finché
-- non viene verificato tramite il link inviato al nuovo indirizzo, `email` (quello attivo/funzionante)
-- resta invariato: un errore di battitura non interrompe le comunicazioni. Alla conferma del token,
-- pending_email viene promosso a `email` (con ri-controllo dell'unicità) e azzerato. NULL = nessun
-- cambio in corso.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email VARCHAR(255);

-- Tabella generica dei token di autenticazione monouso e a scadenza. Un'unica struttura copre tre
-- scopi futuri distinti (verifica email, reset password, 2FA) tramite la colonna `purpose`.
--   * token_hash = si salva SOLO l'hash SHA-256 del token, MAI il token in chiaro: se il DB venisse
--     compromesso, i token non sarebbero utilizzabili. Il valore in chiaro esiste solo il tempo di
--     essere consegnato all'utente (email/link) e non viene mai persistito.
--   * expires_at = scadenza; un token scaduto non è più valido.
--   * used_at = monouso: valorizzato al primo utilizzo, dopodiché il token non è più spendibile.
-- Nessun company_id: user_id sempre valorizzato (società per JOIN), coerente con user_contracts/
-- user_availability. ON DELETE CASCADE: i token seguono la vita dell'utente.
CREATE TABLE IF NOT EXISTS auth_tokens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     VARCHAR(30) NOT NULL CHECK (purpose IN ('email_verification', 'password_reset', 'two_factor')),
  token_hash  VARCHAR(64) NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup principale in fase di consumo: per hash (con purpose come discriminante applicativo).
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
-- Gestione dei token attivi di un utente per scopo (es. invalidare i precedenti prima di emetterne
-- uno nuovo).
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user_purpose ON auth_tokens(user_id, purpose);

-- ============================================================================
-- Demo Framework (Fase D1)
-- ============================================================================
-- Società dimostrative: vivono nello STESSO database delle società reali e riusano integralmente
-- l'isolamento multi-tenant per company_id (una sessione demo è un normale utente di una società
-- demo: non può vedere/toccare altre società per costruzione). is_demo è il discriminante che il
-- framework demo verifica come guardia (assertDemoCompany) prima di QUALSIASI scrittura: il layer
-- demo si rifiuta di operare su società non-demo, e il reset demo cancella solo righe con
-- is_demo=TRUE (predicato ridondante di sicurezza). Colonna con DEFAULT: backfill implicito,
-- nessun ordine multi-step necessario.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;
-- Indice parziale: le società demo sono pochissime, serve solo a trovarle/escluderle in fretta.
CREATE INDEX IF NOT EXISTS idx_companies_is_demo ON companies(is_demo) WHERE is_demo = TRUE;

-- Stato di uno scenario demo caricato: quale società lo ospita, con quale versione del dataset e
-- ancorato a quale data. anchor_date = il "giorno 0" dello scenario (tutte le date del dataset
-- sono offset relativi a questa data): quando today - anchor_date supera la soglia configurata
-- (DEMO_RESEED_AFTER_DAYS) o dataset_version è inferiore alla versione dello scenario nel codice,
-- il framework ri-genera l'ambiente in modo LAZY al demo-login (nessun cron, vincolo serverless —
-- stesso principio dell'escalation Fase 7).
--   * tour_context = riferimenti (id reali post-caricamento) alle entità "gancio" dei tour guidati
--     (es. il turno della richiesta di assenza usata dal tour commerciale), risolti dal loader.
--   * UNIQUE su scenario_id = una sola istanza per scenario nella v1; le future demo per-cliente/
--     temporanee aggiungeranno una colonna discriminante (instance_key) rimuovendo questo vincolo.
CREATE TABLE IF NOT EXISTS demo_state (
  id               SERIAL PRIMARY KEY,
  company_id       INTEGER NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  scenario_id      VARCHAR(50) NOT NULL,
  dataset_version  INTEGER NOT NULL,
  anchor_date      DATE NOT NULL,
  loaded_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tour_context     JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_demo_state_scenario ON demo_state(scenario_id);

-- Mappa persona-key -> user_id reale (risolta dal loader dopo l'inserimento degli utenti): permette
-- al demo-login (Fase D3) di trovare l'utente della persona scelta senza conoscere gli username
-- interni. Colonna con DEFAULT: aggiunta idempotente e sicura su una tabella eventualmente già creata.
ALTER TABLE demo_state ADD COLUMN IF NOT EXISTS personas JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============================================================================
-- Storico invii email (Fase E1 - iniziativa Email Automation)
-- ============================================================================
-- Registro di OGNI tentativo di invio email generato dal sistema (canale email delle notifiche).
-- È il pendant "email" della tabella notifications (notifiche in-app), a canale separato: la stessa
-- logica di evento (services/notificationService.js) alimenta entrambi i canali.
--   * company_id / user_id = ON DELETE SET NULL (log storico: sopravvive alla cancellazione della
--     società o dell'utente, stesso principio di audit_logs). to_email è salvato in chiaro così il
--     record resta autoconsistente anche se l'utente viene poi rimosso.
--   * event_type = il tipo di evento applicativo (es. substitution_proposed, cancellation_approved).
--   * template = il template email usato (services/email/templates), utile per il debug.
--   * status:
--       - sent       = consegnato al provider senza errori.
--       - failed     = il provider ha risposto con errore (dettaglio in `error`); l'azione applicativa
--                      NON è stata annullata (invio best-effort, non bloccante).
--       - suppressed = invio volutamente NON tentato: ambiente demo (email fittizie, nessun invio
--                      reale) oppure destinatario senza email verificata (gate v1). Motivo in `error`.
--       - pending    = stato transitorio predisposto per un futuro sistema di retry/coda (non scritto
--                      in E1, che registra sempre l'esito finale del tentativo sincrono).
--   * provider / provider_message_id = quale provider ha gestito l'invio e l'id del messaggio remoto
--     (per tracciare la consegna nella dashboard del provider).
--   * payload = riferimenti dell'evento (shiftId/requestId/proposalId/...), come notifications.payload.
CREATE TABLE IF NOT EXISTS email_log (
  id                   SERIAL PRIMARY KEY,
  company_id           INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  user_id              INTEGER REFERENCES users(id) ON DELETE SET NULL,
  to_email             VARCHAR(255) NOT NULL,
  event_type           VARCHAR(60) NOT NULL,
  template             VARCHAR(60) NOT NULL,
  subject              VARCHAR(255),
  status               VARCHAR(20) NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'sent', 'failed', 'suppressed')),
  error                TEXT,
  provider             VARCHAR(30),
  provider_message_id  VARCHAR(200),
  payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at              TIMESTAMPTZ
);

-- Consultazione tipica: storico invii di una società, in ordine cronologico inverso (futura UI
-- "Comunicazioni" per il Dirigente).
CREATE INDEX IF NOT EXISTS idx_email_log_company_created ON email_log(company_id, created_at DESC);
-- Storico invii verso un singolo destinatario.
CREATE INDEX IF NOT EXISTS idx_email_log_user ON email_log(user_id, created_at DESC);

-- ============================================================================
-- Token per le Email Actions (Fase E5 - iniziativa Email Automation)
-- ============================================================================
-- Token dedicati per eseguire un'azione direttamente da un bottone nell'email (accetta/rifiuta una
-- proposta di sostituzione, approva/rifiuta una richiesta di cancellazione) senza aprire il portale.
-- Separati da `auth_tokens` (verifica email/reset/2FA) perché legano il token a un'ENTITÀ e a
-- un'AZIONE specifiche, non solo all'utente.
--   * token_hash = si salva SOLO l'hash SHA-256 del token (mai il valore in chiaro), come auth_tokens.
--   * user_id    = destinatario/attore dell'azione (il token agisce "come" questo utente). CASCADE.
--   * action     = azione da eseguire ('proposal_accept'|'proposal_decline'|'cancellation_approve'|
--                  'cancellation_reject'). entity_type/entity_id = l'entità su cui agire.
--   * expires_at = scadenza; used_at = monouso (valorizzato al primo utilizzo). La mutazione avviene
--                  solo tramite POST dopo conferma nel frontend (i link in GET non modificano nulla:
--                  i client email prefetchano i link, stesso principio di verify-email in E2).
CREATE TABLE IF NOT EXISTS email_action_tokens (
  id           SERIAL PRIMARY KEY,
  token_hash   VARCHAR(64) NOT NULL,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id   INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  action       VARCHAR(40) NOT NULL
                 CHECK (action IN ('proposal_accept', 'proposal_decline', 'cancellation_approve', 'cancellation_reject')),
  entity_type  VARCHAR(30) NOT NULL,
  entity_id    INTEGER NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lookup in fase di consumo/peek: per hash.
CREATE INDEX IF NOT EXISTS idx_email_action_tokens_hash ON email_action_tokens(token_hash);

-- ============================================================================
-- Preferenze notifiche utente (Fase E6 - iniziativa Email Automation)
-- ============================================================================
-- Ogni utente può scegliere quali email di EVENTO ricevere. Riguarda SOLO il canale email degli
-- eventi (non le notifiche in-app, che restano il registro completo dell'attività; e non le email
-- transazionali di verifica/reset, sempre inviate). 1:1 con users (UNIQUE user_id); l'ASSENZA di
-- riga = default "tutte" (retrocompatibile: gli utenti esistenti ricevono tutto).
--   * email_mode = 'all' (tutte) | 'important' (solo le categorie importanti) | 'none' (nessuna).
--   * disabled_categories = array JSONB di categorie (event_type) disattivate esplicitamente, valido
--     in modalità 'all'/'important' (disattivazione fine oltre alla modalità).
CREATE TABLE IF NOT EXISTS notification_preferences (
  id                   SERIAL PRIMARY KEY,
  user_id              INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_mode           VARCHAR(20) NOT NULL DEFAULT 'all' CHECK (email_mode IN ('all', 'important', 'none')),
  disabled_categories  JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
