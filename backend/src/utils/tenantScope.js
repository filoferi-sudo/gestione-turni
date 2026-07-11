// ============================================================================
// Rete di sicurezza per l'isolamento multi-tenant (helper condiviso)
// ============================================================================
// L'isolamento tra società resta APPLICATO dai controller: filtro `WHERE company_id = $1` in
// lettura + verifica di appartenenza su update/delete. Questo helper NON introduce un nuovo modello
// (niente ORM/RLS): uniforma soltanto la verifica di appartenenza oggi ripetuta a mano in molti
// controller (es. `target.company_id === req.user.companyId`), riducendo il rischio che una copia
// futura diverga.
//
// Convenzione del progetto (vedi PROJECT_CONTEXT): se una risorsa non appartiene alla società di
// chi opera si risponde 404 (non 403), per non rivelare l'ESISTENZA di risorse di altre società.

// True se la riga appartiene alla società indicata. `row` deve avere `company_id` valorizzato
// (pattern "company_id diretto"); per le tabelle scoped-per-JOIN passare la company_id già risolta
// dal JOIN come primo argomento incapsulato in un oggetto { company_id }.
function belongsToCompany(row, companyId) {
  return !!row && row.company_id === companyId;
}

// Verifica l'appartenenza e, in caso negativo, risponde 404 e ritorna false, così il chiamante può
// fare `if (!assertSameCompany(row, req, res)) return;`. Non lancia: mantiene lo stile dei controller
// esistenti (che rispondono e ritornano, senché propagare eccezioni per i 404 di autorizzazione).
function assertSameCompany(row, req, res, notFoundMessage = 'Risorsa non trovata') {
  if (belongsToCompany(row, req.user.companyId)) return true;
  res.status(404).json({ error: notFoundMessage });
  return false;
}

module.exports = { belongsToCompany, assertSameCompany };
