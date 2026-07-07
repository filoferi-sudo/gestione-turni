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
