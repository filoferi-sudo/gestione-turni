require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

// Boot check (Fase S1): fail-fast se il segreto JWT non è configurato correttamente. Senza un
// segreto robusto l'intera sicurezza delle sessioni è compromessa: meglio non avviarsi affatto
// che girare con un segreto assente o quello di esempio.
const JWT_SECRET = process.env.JWT_SECRET;
const PLACEHOLDER_SECRET = 'change-me-to-a-long-random-string';
const isProduction = process.env.NODE_ENV === 'production';
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET non è impostato: configuralo (es. `openssl rand -hex 32`) prima di avviare il backend.');
}
if (JWT_SECRET === PLACEHOLDER_SECRET) {
  if (isProduction) {
    throw new Error('JWT_SECRET è ancora il valore di esempio: impostane uno lungo e casuale in produzione.');
  }
  console.warn('[security] JWT_SECRET è il valore di esempio di .env.example: usane uno casuale prima di andare in produzione.');
}

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const calendarRoutes = require('./routes/calendar');
const shiftRoutes = require('./routes/shifts');
const cancellationRequestRoutes = require('./routes/cancellationRequests');
const statsRoutes = require('./routes/stats');
const reportRoutes = require('./routes/reports');
const courseRoutes = require('./routes/courses');
const companyRoutes = require('./routes/companies');
const companySettingsRoutes = require('./routes/company');
const planRoutes = require('./routes/plans');
const sedeRoutes = require('./routes/sedi');
const areaRoutes = require('./routes/areas');
const staffingRoutes = require('./routes/staffing');
const notificationRoutes = require('./routes/notifications');
const substitutionProposalRoutes = require('./routes/substitutionProposals');
const auditRoutes = require('./routes/audit');
const emailActionRoutes = require('./routes/emailActions');
const emailLogRoutes = require('./routes/emailLog');
const demoRoutes = require('./routes/demo');
const billingRoutes = require('./routes/billing');

const app = express();

// Nasconde l'header X-Powered-By: Express (riduce il fingerprinting della tecnologia).
app.disable('x-powered-by');

// Security headers standard (Fase S1). L'API risponde solo JSON e non serve HTML, quindi
// disattiviamo la Content-Security-Policy di default di Helmet (pensata per pagine servite dal
// backend): non serve e potrebbe interferire. Restano attivi gli header rilevanti per un'API
// (nosniff, frameguard, HSTS in produzione via infrastruttura, ecc.).
app.use(helmet({ contentSecurityPolicy: false }));

// Frontend e backend sono deployati come progetti Vercel separati (origin diversi):
// di default CORS è aperto per non richiedere configurazione; CORS_ORIGIN permette di restringerlo.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin } : undefined));

// Il webhook di billing (Step 8) ha bisogno del CORPO GREZZO per verificare la firma HMAC del
// provider: va montato PRIMA di express.json, che altrimenti consumerebbe lo stream come JSON.
// Scoped al solo path del webhook; tutto il resto continua a ricevere JSON. body-parser marca la
// richiesta come già letta, quindi express.json più sotto non la riprocessa.
app.use('/api/billing/webhook', express.raw({ type: '*/*', limit: '100kb' }));

// Limite esplicito alla dimensione del corpo JSON: nessun endpoint riceve payload grandi, un
// limite basso riduce la superficie di abuso (payload giganti / DoS applicativo).
app.use(express.json({ limit: '100kb' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/cancellation-requests', cancellationRequestRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/company', companySettingsRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/sedi', sedeRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/staffing', staffingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/proposals', substitutionProposalRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api/email-actions', emailActionRoutes);
app.use('/api/email-log', emailLogRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/billing', billingRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// 404 per rotte API non riconosciute: risposta JSON coerente invece dell'HTML di default di Express.
app.use((req, res) => {
  res.status(404).json({ error: 'Risorsa non trovata' });
});

// Error handler generico: evita che eccezioni non gestite facciano crashare il processo e non
// espone MAI dettagli interni al client (solo un messaggio generico). Il payload di errore JSON
// mal formato di express.json arriva qui come err.type === 'entity.parse.failed' (400).
// Log lato server volutamente senza il corpo della richiesta, che può contenere password/dati.
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Corpo della richiesta non valido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Corpo della richiesta troppo grande' });
  }
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message);
  res.status(500).json({ error: 'Errore interno del server' });
});

module.exports = app;
