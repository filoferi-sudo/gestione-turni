require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const calendarRoutes = require('./routes/calendar');
const shiftRoutes = require('./routes/shifts');
const cancellationRequestRoutes = require('./routes/cancellationRequests');
const statsRoutes = require('./routes/stats');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/cancellation-requests', cancellationRequestRoutes);
app.use('/api/stats', statsRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Error handler generico: evita che eccezioni non gestite facciano crashare il processo
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Errore interno del server' });
});

module.exports = app;
