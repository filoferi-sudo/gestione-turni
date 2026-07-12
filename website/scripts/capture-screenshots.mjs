// Utility di sviluppo (NON parte della build): rigenera gli screenshot reali del gestionale
// dentro website/public/screenshots/ usando l'ambiente DEMO (nessun dato reale di clienti).
//
// Prerequisiti:
//   1. Backend in esecuzione su :4000 con DEMO_MODE=true, frontend su :5173 (npm run dev nei due progetti).
//   2. puppeteer-core installato una tantum:  npm i -D puppeteer-core
//   3. Un binario Chrome/Chromium. Passa il percorso via env CHROME_PATH, es. il Chrome for Testing
//      di Puppeteer:  ~/.cache/puppeteer/chrome/<ver>/chrome-mac-arm64/Google Chrome for Testing.app/...
//
// Uso:  CHROME_PATH="/path/to/chrome" node scripts/capture-screenshots.mjs
//
// Vincolo privacy: cattura SOLO l'ambiente demo (persona demo-*), mai account reali. Il banner
// "MODALITÀ DEMO" viene nascosto via CSS solo per pulizia estetica dello screenshot.
import puppeteer from 'puppeteer-core';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dir = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dir, '../public/screenshots');
const BASE = process.env.FRONTEND_URL || 'http://localhost:5173';
const CHROME = process.env.CHROME_PATH;
if (!CHROME) {
  console.error('Imposta CHROME_PATH al binario Chrome/Chromium. Vedi commento in testa al file.');
  process.exit(1);
}
const HIDE = `.demo-banner{display:none!important}`;

async function clickByText(page, text, sel = 'button,a') {
  await page.waitForFunction((t, s) => [...document.querySelectorAll(s)].some((e) => e.textContent.includes(t)), { timeout: 8000 }, text, sel);
  await page.evaluate((t, s) => [...document.querySelectorAll(s)].find((e) => e.textContent.includes(t)).click(), text, sel);
}
async function settle(page, ms = 2200) {
  await sleep(ms);
  await page.addStyleTag({ content: HIDE }).catch(() => {});
  await sleep(250);
}
async function shot(page, name) {
  await page.screenshot({ path: `${OUT}/${name}`, type: 'png' });
  console.log('✓', name);
}
async function demoLogin(page, personaText) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await clickByText(page, 'Prova la demo');
  await sleep(500);
  await clickByText(page, personaText);
  await page.waitForFunction(() => !location.pathname.startsWith('/login') && location.pathname !== '/', { timeout: 15000 });
  await settle(page, 1800);
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--force-color-profile=srgb'],
  defaultViewport: { width: 1360, height: 860, deviceScaleFactor: 2 },
});
const page = await browser.newPage();

await demoLogin(page, 'Responsabile di sala');
await shot(page, 'fabbisogno-copertura.png'); // la dashboard mostra la tabella di copertura
for (const [route, name] of [
  ['/admin/calendario', 'calendario-responsabile.png'],
  ['/admin/sostituzioni', 'sostituzione-candidati.png'],
  ['/admin/turni', 'richieste-approvazioni.png'],
  ['/admin/personale', 'multi-sede-ruoli.png'],
]) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 1500);
  await shot(page, name);
}

await demoLogin(page, 'Cameriere');
for (const [route, name] of [
  ['/dashboard/calendario', 'calendario-dipendente.png'],
  ['/dashboard/impostazioni', 'disponibilita-staff.png'],
]) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await settle(page, 1500);
  await shot(page, name);
}

await browser.close();
console.log('Fatto. Ricorda: sips --resampleWidth 1500 public/screenshots/*.png per ridurre il peso.');
