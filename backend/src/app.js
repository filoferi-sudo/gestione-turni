require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const calendarRoutes = require('./routes/calendar');
const shiftRoutes = require('./routes/shifts');
const cancellationRequestRoutes = require('./routes/cancellationRequests');
const statsRoutes = require('./routes/stats');
const courseRoutes = require('./routes/courses');
const companyRoutes = require('./routes/companies');
const companySettingsRoutes = require('./routes/company');
const sedeRoutes = require('./routes/sedi');
const areaRoutes = require('./routes/areas');
const staffingRoutes = require('./routes/staffing');
const notificationRoutes = require('./routes/notifications');
const substitutionProposalRoutes = require('./routes/substitutionProposals');

const app = express();

// Frontend e backend sono deployati come progetti Vercel separati (origin diversi):
// di default CORS è aperto per non richiedere configurazione; CORS_ORIGIN permette di restringerlo.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin } : undefined));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/cancellation-requests', cancellationRequestRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/company', companySettingsRoutes);
app.use('/api/sedi', sedeRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/staffing', staffingRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/proposals', substitutionProposalRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Error handler generico: evita che eccezioni non gestite facciano crashare il processo
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Errore interno del server' });
});

module.exports = app;
