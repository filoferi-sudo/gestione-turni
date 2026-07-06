// Catch-all serverless function per Vercel: inoltra qualunque richiesta sotto /api/*
// all'app Express esistente (route già definite in src/app.js, nessuna duplicazione).
// Deploy come progetto Vercel a parte con "Root Directory" = backend.
module.exports = require('../src/app');
