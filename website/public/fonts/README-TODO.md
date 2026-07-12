# TODO_FONT — Bricolage Grotesque (font display self-hosted)

Il sito è progettato per usare **Bricolage Grotesque** solo sui titoli (H1–H3, eyebrow, numeri
grandi). Finché il file non è qui, il display ricade su `system-ui` (fallback previsto dal brief:
zero rischio per il budget performance Lighthouse). Titoli e corpo restano distinti grazie a
peso/spaziatura/scala, quindi il sito è già pubblicabile così.

## Come attivarlo (self-hosted, niente CDN/Google Fonts a runtime)

1. Scarica Bricolage Grotesque (licenza **SIL OFL**, gratuito) dal repository ufficiale
   (github.com/ateliertriangle/Bricolage-Grotesque) o da un servizio di subsetting.
2. Genera un **subset woff2** ridotto ai glifi Latin usati (con `fonttools`/`glyphhanger`):
   1 file **variabile** oppure al massimo 2 pesi (600 e 700). Nomina il file:
   `bricolage-grotesque.woff2` e mettilo in questa cartella (`website/public/fonts/`).
3. In `src/styles/global.css` togli il commento al blocco `@font-face` (in cima al file).
4. In `src/layouts/Base.astro` togli il commento al `<link rel="preload" ...>` già predisposto
   nel `<head>` (con `crossorigin`).
5. Ricontrolla Lighthouse mobile sulla home: se LCP/CLS peggiorano, **rimuovi di nuovo** il font
   e resta su `system-ui` (il brief lo consente esplicitamente: "vince il budget").

## Vincoli non negoziabili
- `font-display: swap`
- `size-adjust` allineato a system-ui per CLS ≈ 0 (già impostato a 96% nel blocco, da tarare)
- **nessuna** richiesta a fonts.googleapis.com / fonts.gstatic.com a runtime
