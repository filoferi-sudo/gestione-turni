// Guardia per gli script distruttivi (Fase S7). Impedisce l'esecuzione accidentale contro un
// database di produzione di operazioni che cancellano/riscrivono dati (reset, seed di sviluppo).
// In produzione (NODE_ENV=production) lo script si rifiuta di partire, a meno di un opt-in esplicito
// e consapevole (ALLOW_DESTRUCTIVE=true).

function assertDestructiveAllowed(scriptName) {
  const isProd = process.env.NODE_ENV === 'production';
  const allow = process.env.ALLOW_DESTRUCTIVE === 'true';
  if (isProd && !allow) {
    console.error(
      `[guard] "${scriptName}" è uno script DISTRUTTIVO e NODE_ENV=production.\n` +
        `        Esecuzione rifiutata per proteggere i dati di produzione.\n` +
        `        Se sei ASSOLUTAMENTE certo, ripeti con ALLOW_DESTRUCTIVE=true.`
    );
    process.exit(1);
  }
}

module.exports = { assertDestructiveAllowed };
