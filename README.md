# Gestione Turni

App per la gestione di turni di lavoro, con tre ruoli (dirigente, responsabile, dipendente),
calendario turni, turni volanti, richieste di cancellazione e statistiche ore lavorate.

Stack: React + Vite (frontend), Node.js + Express (backend), PostgreSQL (database).

## Struttura del progetto

Frontend e backend sono due progetti indipendenti, deployabili separatamente (anche su Vercel
come due progetti distinti): questo evita qualunque ambiguità di rilevamento framework in un
monorepo condiviso.

```
turni-app/
  backend/
    src/app.js       app Express (route, middleware)
    src/server.js    avvio locale (node src/server.js)
    api/index.js     entry point serverless per Vercel (wrappa src/app.js)
    vercel.json      rewrite esplicito: /api/* -> /api (necessario perché Vercel
                     instradi correttamente anche i path con più segmenti)
  frontend/
    src/             React + Vite
    vercel.json      rewrite SPA per il routing lato client
```

## Setup locale

Requisiti: Node.js 18+, PostgreSQL.

```bash
# 1. Database
createdb turni_app

# 2. Backend
cd backend
cp .env.example .env      # modifica DATABASE_URL se necessario
npm install
npm run setup              # migrazione + pulizia dati + creazione account dirigente
npm run dev                 # http://localhost:4000

# 3. Frontend (in un altro terminale)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

Al primo avvio l'unico account esistente è il **dirigente**:

- Username: `dirigente2353`
- Password: `Filippo124`

(credenziali configurabili tramite `DIRIGENTE_USERNAME` / `DIRIGENTE_PASSWORD` / `DIRIGENTE_EMAIL` in `backend/.env`)

Da qui il dirigente può creare responsabili, dipendenti e turni: non esiste altro dato precaricato.

### Script utili (in `backend/`)

- `npm run migrate` — crea/aggiorna lo schema del database (idempotente)
- `npm run db:reset` — cancella tutti gli utenti (tranne il dirigente), tutti i turni e le richieste di cancellazione
- `npm run seed:dirigente` — crea/ripristina l'account dirigente
- `npm run setup` — esegue in sequenza i tre comandi sopra

## Deploy su Vercel

Si deployano **due progetti Vercel separati** dallo stesso repository GitHub, ognuno con la
propria "Root Directory". Zero configurazioni manuali di build: Vercel rileva da solo Vite per
il frontend, e le funzioni serverless per il backend grazie alla cartella `api/`.

### 1. Database (una tantum)

Crea un Postgres hosted (Neon, Supabase, Railway o Vercel Postgres vanno tutti bene), poi prepara
lo schema puntando alla connection string di produzione dalla tua macchina:

```bash
cd backend
DATABASE_URL="<connection-string-produzione>" DATABASE_SSL=true npm run setup
```

### 2. Backend → primo progetto Vercel

Su [vercel.com/new](https://vercel.com/new), importa il repository e imposta:

- **Root Directory**: `backend`
- **Framework Preset**: Other (nessun build necessario: è solo API)
- **Environment Variables**:
  - `DATABASE_URL` — connection string del passo 1
  - `DATABASE_SSL` = `true`
  - `JWT_SECRET` — stringa lunga e casuale (es. `openssl rand -hex 32`), diversa da quella di sviluppo
  - `CORS_ORIGIN` — puoi lasciarla vuota per ora, la imposti dopo aver creato il progetto frontend

Deploy → otterrai un URL tipo `https://tuo-backend.vercel.app` (verifica con `/api/health`).

### 3. Frontend → secondo progetto Vercel

Importa di nuovo lo stesso repository come **nuovo progetto** Vercel e imposta:

- **Root Directory**: `frontend`
- **Framework Preset**: Vite (rilevato automaticamente)
- **Environment Variables**:
  - `VITE_API_URL` = l'URL del backend del passo precedente (es. `https://tuo-backend.vercel.app`, senza slash finale)

Deploy → otterrai l'URL pubblico dell'app, es. `https://tuo-frontend.vercel.app`.

> **Importante**: Vite inietta `VITE_API_URL` nel bundle **durante la build**, non a runtime.
> Se la aggiungi o la modifichi dopo il primo deploy, salvarla nelle impostazioni del progetto
> non basta: serve un **redeploy** (Deployments → ⋯ → Redeploy) perché abbia effetto.

### 4. Ultimo passo: chiudi il cerchio del CORS

Torna sul progetto **backend** su Vercel e imposta `CORS_ORIGIN` all'URL del frontend appena
ottenuto (es. `https://tuo-frontend.vercel.app`), poi fai un redeploy del backend.

### Debug in produzione

Il client API logga in console del browser l'URL del backend risolto a ogni caricamento
(`[api] Backend configurato su: ...`) e ogni errore di rete o risposta non-2xx con URL e status
coinvolti. Se il login fallisce, apri la console del browser sul sito deployato: il primo posto
dove guardare.

### Alternative

Il backend è un normale server Express (`backend/src/server.js`) e funziona senza modifiche
anche su piattaforme con hosting Node persistente (Render, Railway, Fly.io, VPS...): basta
`npm install && npm start` con le stesse variabili d'ambiente.

## Sicurezza

- Password sempre salvate come hash (bcrypt), mai in chiaro.
- Sessioni tramite JWT firmato con `JWT_SECRET`.
- Route separate per ruolo (dipendente / responsabile / dirigente) verificate lato server.
