// Funzione serverless unica per Vercel: gestisce tutte le richieste sotto /api/*
// grazie al rewrite dichiarativo in vercel.json (non si affida all'inferenza
// automatica dei catch-all dinamici di Vercel, che in alcuni deploy non instrada
// correttamente i path con più segmenti come /api/auth/login).
module.exports = require('../src/app');
