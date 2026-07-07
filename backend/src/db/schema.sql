-- Schema minimo per il sistema di autenticazione e gestione utenti

-- category: si applica solo ai dipendenti (role = 'user'); definisce quale dashboard e quali
-- funzionalità vede. NULL per dirigente/responsabile, che non sono "categorie di dipendente".
-- Nuove categorie (reception, segreteria, personal trainer, ...) si aggiungono qui e nel
-- corrispondente registro frontend, senza toccare il resto del sistema.
CREATE TABLE IF NOT EXISTS users (
  id                    SERIAL PRIMARY KEY,
  username              VARCHAR(50) UNIQUE NOT NULL,
  email                 VARCHAR(255) UNIQUE NOT NULL,
  phone                 VARCHAR(30),
  password_hash         VARCHAR(255),
  initial_code          VARCHAR(20),
  role                  VARCHAR(10) NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user', 'dirigente')),
  category              VARCHAR(20) CHECK (category IS NULL OR category IN ('bagnino', 'istruttore')),
  must_change_password  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Turni: 'mobile' e 'volante' hanno una data specifica, 'fixed' è una regola ricorrente (recurrence_rule).
-- 'volante' non è assegnato inizialmente (user_id NULL finché un dipendente non lo accetta).
CREATE TABLE IF NOT EXISTS shifts (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER REFERENCES users(id) ON DELETE CASCADE,
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

-- Migrazioni idempotenti per database creati con versioni precedenti dello schema
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'dirigente'));

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
