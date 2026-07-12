// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// Sito 100% statico (nessun adapter server), JavaScript puro. Il dominio pubblico è planivo.it:
// `site` alimenta canonical, Open Graph e sitemap con URL assoluti corretti.
export default defineConfig({
  site: 'https://planivo.it',
  output: 'static',
  // La sitemap è per i motori di ricerca: escludiamo le pagine che non devono comparire in SERP
  // (ringraziamento post-form e 404). Le pagine legali RESTANO indicizzabili (le richiede Meta Ads).
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/grazie') && !page.endsWith('/404/'),
    }),
  ],
  // Niente prefetch aggressivo: il sito è leggero, ogni KB extra è budget performance.
  prefetch: false,
});
