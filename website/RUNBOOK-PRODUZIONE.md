# Runbook — messa in produzione del sito Planivo (`planivo.it`)

> Da eseguire **manualmente** (task umano). L'assistant NON esegue questi passi. Ordine importante:
> il passo 3 (CORS) è **bloccante** per il login da `planivo.it/app`.

## Prerequisiti architettura
Tre progetti Vercel dallo stesso repo GitHub, root directory diverse:
- **backend** (`backend/`) — API Express serverless (invariato, salvo l'endpoint lead già in codice).
- **frontend** (`frontend/`) — gestionale React/Vite, ora servito sotto **`/app`**.
- **website** (`website/`) — NUOVO sito marketing, prende il dominio `planivo.it`.

## Passi

1. **Crea il progetto Vercel `website`** dal repo (Root Directory `website/`, preset Astro rilevato
   in automatico). Imposta le env:
   - `PUBLIC_API_URL` = URL del backend (es. `https://<backend>.vercel.app`, senza slash finale).
   - `PUBLIC_GTM_ID` (facoltativa) = `GTM-XXXX`. Senza questa: nessun tracking e nessun banner cookie.
   - `PUBLIC_CALENDLY_URL` (facoltativa) = link evento Calendly/Cal.com.

2. **`website/vercel.json`**: sostituisci il segnaposto **`TODO_HOST_GESTIONALE`** (2 occorrenze nei
   `rewrites`) con l'**alias di produzione stabile** del progetto frontend (es. `nome-frontend.vercel.app`).
   `vercel.json` non interpola le env: il valore va scritto a mano. Poi deploy.

3. **⚠️ BLOCCANTE — Backend `CORS_ORIGIN`**: dalla dashboard Vercel del backend imposta
   `CORS_ORIGIN=https://planivo.it` e **redeploy**.
   - Il codice (`backend/src/app.js`) accetta **un solo origin** (stringa singola passata a `cors`),
     **non** una lista separata da virgole. Poiché `www.planivo.it` viene rediretto all'apex a
     livello Vercel, in pratica solo `https://planivo.it` effettua chiamate API.
   - **Solo schema + host, MAI un path** (es. niente `/login`): un path errato in `CORS_ORIGIN` fu la
     causa di un incidente di login silenzioso in passato (vedi PROJECT_CONTEXT → "Problemi risolti").
   - Senza questo passo il login da `planivo.it/app` fallisce.

4. **Deploy del frontend** con le modifiche base `/app`. Verifica il gestionale direttamente sul suo
   host Vercel: `https://<frontend-host>/app` deve caricare, il login funzionare, e un deep link tipo
   `https://<frontend-host>/app/admin/calendario` caricare senza 404. Assicurati che il frontend abbia
   `VITE_API_URL` impostata all'URL del backend.

5. **Migrazione produzione della tabella `leads`** — **SOLO su conferma esplicita** (regola del
   progetto: mai migrare la produzione automaticamente):
   ```bash
   cd backend
   DATABASE_URL=<neon-prod-url> DATABASE_SSL=true npm run migrate
   ```
   È idempotente (2ª passata no-op) e non tocca dati esistenti. **Prima** di questo passo, non
   pubblicizzare il form: senza tabella `leads` gli invii falliscono con 500.

6. **Notifica lead (facoltativa ma consigliata)**: sul backend imposta `LEAD_NOTIFY_EMAIL` (email del
   founder) e uno tra `BREVO_API_KEY` (+ eventuale `LEAD_NOTIFY_FROM` verificato su Brevo) oppure
   riusa il `RESEND_API_KEY`/`EMAIL_FROM` già configurati. Senza, il lead si salva ma non arriva
   l'email — e il richiamo entro 24h dipende da quella notifica.

7. **Sposta il dominio `planivo.it`** (+ `www.planivo.it` come redirect all'apex) sul progetto
   **website**. Da questo momento gli utenti passano da `planivo.it/app`; i redirect legacy in
   `website/vercel.json` coprono i vecchi bookmark (`/login`, `/dirigente/*`, `/admin/*`, ...).

8. **Verifica post go-live**: home su `planivo.it`; login end-to-end su `planivo.it/app` con un utente
   reale; invio di un form di prova (poi marca il lead come test nel DB); `planivo.it/login` reindirizza
   a `/app/login`; su Google Search Console invia la sitemap `https://planivo.it/sitemap-index.xml`.

9. **Configura GTM** (se attivato): dentro Google Tag Manager crea GA4 + Meta Pixel + tag Google Ads
   con trigger sugli eventi `generate_lead` (conversione principale, pageview `/grazie`),
   `cta_demo_click`, `lead_form_start`, `click_tel`/`click_whatsapp`/`click_email` — rispettando il
   Consent Mode (default `denied`, aggiornato dal banner). **URL di conversione per le campagne:
   `/grazie`.**

10. **Rollback** (se qualcosa va storto): riassegna il dominio `planivo.it` al progetto **frontend** e
    fai `git revert` del commit "frontend: gestionale servito sotto /app". **Nessun dato è a rischio**:
    le modifiche al gestionale sono solo di routing.

## Materiali ancora da fornire (segnaposto `TODO_` nel codice)
- Prezzo per sede/mese → `src/data/pricing.js` (`TODO_PREZZO`).
- P.IVA e ragione sociale → `src/data/site.js` (`vat`/`legalName`: omessi finché `null`).
- Font display Bricolage Grotesque woff2 → `public/fonts/` (`TODO_FONT`; ora fallback system-ui).
- Video hero 60–90s, foto/storia founder, testimonianze pilota → slot già predisposti.
- Revisione legale di `privacy` e `cookie-policy` (attualmente bozze marcate).
