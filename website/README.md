# Planivo — sito marketing pubblico (`planivo.it`)

Sito statico in **Astro** (JavaScript puro, nessun framework client), separato dal gestionale ma
sullo stesso dominio. Il gestionale resta raggiungibile sotto `/app` tramite proxy (vedi
`vercel.json`). Fonte di verità del prodotto: `../PROJECT_CONTEXT.md`.

## Sviluppo

```bash
cd website
npm install
npm run dev        # http://localhost:4321
npm run build      # output statico in dist/
npm run preview    # anteprima del build
```

### Variabili d'ambiente (`.env`, mai committare valori reali — vedi `.env.example`)

| Variabile | Uso | Obbligatoria |
|---|---|---|
| `PUBLIC_API_URL` | Base URL del backend per il LeadForm (es. `https://<backend>.vercel.app`) | Sì (in prod) |
| `PUBLIC_GTM_ID` | ID Google Tag Manager (`GTM-XXXX`). **Se assente: nessun tracking, nessun banner cookie** | No |
| `PUBLIC_CALENDLY_URL` | Link Calendly/Cal.com per l'embed su `/grazie` | No |

## Come aggiungere contenuti (senza toccare codice)

### Un nuovo settore
Crea `src/content/settori/<slug>.md` (lo `<slug>` diventa l'URL `/settori/<slug>`). Frontmatter:

```yaml
---
title: Catering
order: 5                      # ordine nelle liste
status: live                 # live | coming
icon: utensils               # chiave di src/components/Icon.astro
hook: "La frase d'aggancio, grande, del settore."
pains: ["Problema 1.", "Problema 2.", "Problema 3."]   # esattamente 3
solutions:                                             # esattamente 3
  - { title: "Titolo soluzione", text: "Testo soluzione." }
  - { title: "...", text: "..." }
  - { title: "...", text: "..." }
screenshotMock: calendario   # calendario | sostituzione | copertura (mock brand-neutral)
seoTitle: "Software gestione turni per il catering | Planivo"
seoDescription: "Meta description SEO."
faq:                         # opzionale
  - { q: "Domanda?", a: "Risposta." }
---
Paragrafo introduttivo (corpo markdown).
```

La card compare automaticamente in home e in `/settori`, e la pagina `/settori/<slug>` viene
generata da sola.

### Un nuovo articolo del blog
Crea `src/content/blog/<slug>.md`:

```yaml
---
title: "Titolo dell'articolo"
description: "Meta description / estratto."
pubDate: 2026-07-20
category: generale           # generale | ristoranti | bar | piscine | palestre
tags: ["tag1", "tag2"]
draft: false
---
Contenuto in markdown (usa H2 `##` per l'indice automatico, che compare se ci sono >4 H2).
```

### Cambiare il prezzo
Modifica `src/data/pricing.js` (`priceFrom`, `unit`, `included`, FAQ). Finché `isPlaceholder: true`,
la cifra è mostrata come segnaposto e **non** finisce nei dati strutturati. Rimuovi `TODO_PREZZO`
quando la cifra è definitiva.

### Contatti, P.IVA, social
Tutto in `src/data/site.js` (unica fonte). `vat`/`legalName` sono `null`: i componenti li **omettono**
finché non valorizzati (non stampare valori finti).

## Screenshot del gestionale
I PNG in `public/screenshots/` sono catturati dall'**ambiente demo** (mai dati reali). Per
rigenerarli dopo modifiche alla UI: avvia backend (`DEMO_MODE=true`) e frontend in locale, poi

```bash
npm i -D puppeteer-core
CHROME_PATH="/percorso/a/Chrome" node scripts/capture-screenshots.mjs
```

## Font display (TODO_FONT)
Il sito usa **Bricolage Grotesque** sui titoli, ma finché il file woff2 non è in `public/fonts/` si
usa il fallback `system-ui` (previsto, zero rischio performance). Istruzioni: `public/fonts/README-TODO.md`.

## Struttura

```
src/
  components/   componenti .astro (ShiftGrid signature, LeadForm, Seo, Header, Footer, ...)
  content/      settori/ e blog/ (Markdown = sorgente di verità)
  data/         site.js, features.js, pricing.js, faq.js
  layouts/      Base.astro (SEO, header/footer, tracking), Legal.astro
  lib/          jsonld.js (dati strutturati), analytics.js (tracking + consenso)
  pages/        le rotte del sito
public/         favicon, robots.txt, og-default.png, screenshots/, fonts/
```

## Messa in produzione
Vedi **`RUNBOOK-PRODUZIONE.md`**.
