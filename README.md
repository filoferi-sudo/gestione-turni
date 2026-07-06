# Gestione Turni

App per la gestione di turni di lavoro, con tre ruoli (dirigente, responsabile, dipendente),
calendario turni, turni volanti, richieste di cancellazione e statistiche ore lavorate.

Stack: React + Vite (frontend), Node.js + Express (backend), PostgreSQL (database).

## Struttura del progetto

```
turni-app/
  backend/    API Express (src/app.js = app, src/server.js = avvio locale)
  frontend/   React + Vite
  api/        entry point serverless per Vercel (wrappa backend/src/app.js)
  vercel.json configurazione di build/deploy per Vercel
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

Il progetto è già strutturato per il deploy su Vercel senza configurazioni aggiuntive:
frontend come sito statico, backend come funzione serverless sotto `/api`.

1. **Database**: crea un Postgres hosted (Neon, Supabase, Railway o Vercel Postgres funzionano tutti).
   Copia la connection string.
2. **Prepara il database** (una tantum, dalla tua macchina, puntando al DB di produzione):
   ```bash
   cd backend
   DATABASE_URL="<connection-string-produzione>" DATABASE_SSL=true npm run setup
   ```
3. **Importa il repository su GitHub** e collega il repo su [vercel.com/new](https://vercel.com/new).
4. **Variabili d'ambiente** su Vercel (Project Settings → Environment Variables):
   - `DATABASE_URL` — connection string del passo 1
   - `DATABASE_SSL` = `true`
   - `JWT_SECRET` — stringa lunga e casuale (es. `openssl rand -hex 32`), diversa da quella di sviluppo
5. **Deploy**: Vercel builda automaticamente (`vercel.json` è già configurato con build command e output directory).

Al termine del deploy avrai un URL pubblico funzionante (es. `https://tuo-progetto.vercel.app`),
con frontend e API sullo stesso dominio (le chiamate `/api/...` del frontend funzionano senza altre modifiche).

### Alternative

Il backend è un normale server Express (`backend/src/server.js`) e funziona senza modifiche
anche su piattaforme con hosting Node persistente (Render, Railway, Fly.io, VPS...); in quel
caso il frontend può essere deployato separatamente su Vercel/Netlify configurando l'URL del
backend nel proxy o in una variabile d'ambiente del frontend.

## Sicurezza

- Password sempre salvate come hash (bcrypt), mai in chiaro.
- Sessioni tramite JWT firmato con `JWT_SECRET`.
- Route separate per ruolo (dipendente / responsabile / dirigente) verificate lato server.
