// Azioni SIMULATE e criteri di CHECK dei tour guidati. Il tour commerciale racconta un flusso a
// due attori (il responsabile invia la proposta, il dipendente la accetta): il responsabile agisce
// dalla UI reale, mentre l'azione dell'ALTRO attore (il dipendente che accetta) viene simulata
// lato server RIUSANDO gli helper esistenti — mai logica duplicata. Tutto è scoped alla società
// demo (la guardia assertDemoCompany è applicata dalla route prima di arrivare qui).
const pool = require('../../config/db');
const { acceptProposalForUser } = require('../../controllers/substitutionProposalController');

// Stato demo (con tour_context) della società di chi opera. Presente per coerenza/estensioni; le
// simulazioni attuali sono robuste senza dipendere da uno specifico turno "del tour".
async function loadState(companyId) {
  const { rows } = await pool.query('SELECT * FROM demo_state WHERE company_id = $1', [companyId]);
  return rows[0] || null;
}

// La proposta PENDENTE più recente della società demo su una sostituzione ancora aperta: è quella
// che il responsabile ha appena inviato nel tour (a prescindere da QUALE turno scoperto abbia
// scelto). Così la simulazione è robusta: non è legata a un turno specifico.
async function findLatestPendingProposal(companyId) {
  const { rows } = await pool.query(
    `SELECT sp.*, u.username, u.company_id
       FROM substitution_proposals sp
       JOIN shifts s ON s.id = sp.shift_id
       JOIN users u ON u.id = sp.user_id
      WHERE s.company_id = $1 AND sp.status = 'pending'
        AND s.type = 'volante' AND s.user_id IS NULL AND s.status = 'active'
      ORDER BY sp.created_at DESC
      LIMIT 1`,
    [companyId]
  );
  return rows[0] || null;
}

// ── AZIONI ────────────────────────────────────────────────────────────────────────────────────
const actions = {
  // "Il collega accetta la proposta": prende la proposta pendente più recente (quella appena
  // inviata dal responsabile) e la accetta impersonando il dipendente destinatario (solo lato
  // server, nessun token emesso). Riusa acceptProposalForUser → assignVolanteToUser: identico
  // all'accettazione reale.
  'collega-accetta-proposta': async ({ companyId }) => {
    const proposal = await findLatestPendingProposal(companyId);
    if (!proposal) {
      return { ok: false, code: 409, error: 'Invia prima una proposta a un candidato per una sostituzione scoperta.' };
    }
    const user = { id: proposal.user_id, username: proposal.username, companyId: proposal.company_id };
    const result = await acceptProposalForUser({ proposal, user });
    if (!result.ok) return result;
    return { ok: true, data: { assignedTo: user.username } };
  },
};

// ── CHECK (criteri di avanzamento, sola lettura) ────────────────────────────────────────────────
const checks = {
  // "Il turno è stato assegnato": esiste una proposta ACCETTATA nella società demo. Nel dataset
  // iniziale non ce ne sono (solo pending/declined): diventa vera solo dopo che la simulazione ha
  // assegnato il turno — coerente con l'azione e indipendente dal turno specifico.
  'turno-assegnato': async ({ companyId }) => {
    const { rows } = await pool.query(
      `SELECT EXISTS(
         SELECT 1 FROM substitution_proposals sp
           JOIN shifts s ON s.id = sp.shift_id
          WHERE s.company_id = $1 AND sp.status = 'accepted'
       ) AS ok`,
      [companyId]
    );
    return { satisfied: rows[0].ok === true };
  },
};

async function runAction(name, companyId) {
  const action = actions[name];
  if (!action) return { ok: false, code: 404, error: 'Azione demo sconosciuta' };
  const state = await loadState(companyId);
  if (!state) return { ok: false, code: 409, error: 'Ambiente demo non inizializzato' };
  return action({ companyId, state });
}

async function runCheck(name, companyId) {
  const check = checks[name];
  if (!check) return { found: false };
  const state = await loadState(companyId);
  if (!state) return { found: true, satisfied: false };
  const result = await check({ companyId, state });
  return { found: true, ...result };
}

module.exports = { runAction, runCheck };
