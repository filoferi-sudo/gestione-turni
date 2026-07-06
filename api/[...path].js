// Catch-all serverless function per Vercel: inoltra qualunque richiesta sotto /api/*
// all'app Express esistente, senza duplicare le route (già definite in backend/src/app.js).
module.exports = require('../backend/src/app');
