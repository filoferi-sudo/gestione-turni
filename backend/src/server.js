// Entry point per l'esecuzione locale / su hosting tradizionale (Render, Railway, VPS...).
// Su piattaforme serverless (Vercel) l'app Express viene importata direttamente da app.js,
// senza chiamare .listen(): vedi api/index.js e vercel.json in questa cartella.
const app = require('./app');

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Backend in ascolto su http://localhost:${PORT}`);
});
