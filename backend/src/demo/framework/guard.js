// Guardie del Demo Framework: il punto UNICO in cui si garantisce che il layer demo non possa mai
// toccare dati reali. Regola non negoziabile: ogni percorso di scrittura del framework (loader,
// reset, azioni simulate dei tour) chiama assertDemoCompany come prima istruzione.
const pool = require('../../config/db');
const { isDemoEnabled } = require('./config');

// Middleware per le rotte /api/demo/*: con la modalità demo spenta rispondono 404 (stessa forma
// del 404 handler globale), come se il dominio demo non esistesse — default sicuro.
function requireDemoEnabled(req, res, next) {
  if (!isDemoEnabled()) {
    return res.status(404).json({ error: 'Risorsa non trovata' });
  }
  next();
}

// Chokepoint anti-dati-reali: rifiuta qualsiasi companyId che non appartenga a una società demo.
// Accetta un client di transazione opzionale così la verifica avviene DENTRO la stessa transazione
// dell'operazione che protegge (nessuna finestra tra verifica e scrittura).
async function assertDemoCompany(companyId, db = pool) {
  const { rows } = await db.query('SELECT is_demo FROM companies WHERE id = $1', [companyId]);
  if (!rows[0] || rows[0].is_demo !== true) {
    throw new Error(`[demo] La società ${companyId} non è una società demo: operazione rifiutata`);
  }
}

// Middleware: garantisce che la società della sessione corrente sia una società demo. Usato dalle
// rotte demo autenticate (reset, azioni tour) — un utente reale non può innescarle sulla propria
// società (403). Va dopo authenticate (usa req.user.companyId).
async function requireDemoCompany(req, res, next) {
  try {
    await assertDemoCompany(req.user.companyId);
    next();
  } catch (err) {
    res.status(403).json({ error: 'Operazione consentita solo in ambiente demo' });
  }
}

module.exports = { requireDemoEnabled, assertDemoCompany, requireDemoCompany };
