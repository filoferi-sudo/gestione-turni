const pool = require('../config/db');
const { rankCandidates } = require('../services/substitutionMatcher');
const { assignVolanteToUser } = require('./shiftController');
const { toDateOnly, toSafeShift } = require('../services/shiftExpansion');
const {
  notifySubstitutionProposal,
  notifyProposalDeclined,
  notifySubstitutionClaimed,
} = require('../services/notificationService');

// ============================================================================
// Proposte mirate di sostituzione (Fase 5)
// ============================================================================
// Terzo livello di copertura dei turni scoperti: il responsabile, dalla classifica di "Trova
// sostituzione" (Fase 4), invia una proposta SOLO ai candidati scelti. Ogni proposta è una riga di
// substitution_proposals con uno SNAPSHOT (score/reasons) della classifica al momento dell'invio.
// Il dipendente la vede in "Le mie proposte" e decide (Accetta/Rifiuta) — mai automatico.
// Additivo puro: l'accettazione riusa il claim atomico condiviso di shiftController
// (assignVolanteToUser), identico a quello di claimShift. Nessuna modifica ai flussi esistenti.
//
// Isolamento per società: substitution_proposals NON ha company_id (shift_id/user_id sempre
// valorizzati); la società si verifica per JOIN sul turno (shift.company_id autoritativo) e, per le
// azioni del dipendente, filtrando sempre per il proprio user_id.

// Carica una Sostituzione ANCORA APERTA (volante non assegnato) della società di chi opera.
async function loadOpenVolante(shiftId, companyId) {
  const { rows } = await pool.query(
    `SELECT * FROM shifts
      WHERE id = $1 AND type = 'volante' AND user_id IS NULL AND status = 'active' AND company_id = $2`,
    [shiftId, companyId]
  );
  return rows[0] || null;
}

// POST /api/shifts/:id/proposals (responsabile/dirigente) - invia una proposta ai dipendenti scelti.
// Body: { userIds: [int] }. Solo i userId che risultano candidati VALIDI (presenti nella classifica
// del motore: assegnati all'area e senza sovrapposizione oraria) ricevono la proposta; gli altri
// vengono riportati in `skipped` (es. sovrapposizione oraria → non potrebbero comunque accettare).
// Ri-proporre a chi ha già una proposta declinata/scaduta la riporta a 'pending' (UPSERT).
async function createProposals(req, res) {
  const { id } = req.params;
  const userIds = Array.isArray(req.body.userIds) ? req.body.userIds : null;
  if (!userIds || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds deve essere un array non vuoto' });
  }

  const shift = await loadOpenVolante(id, req.user.companyId);
  if (!shift) {
    return res.status(404).json({ error: 'Sostituzione non trovata o non più disponibile' });
  }

  // Snapshot di compatibilità: unica fonte per score/reasons, coerente con "Trova sostituzione".
  const ranking = await rankCandidates({ shift, companyId: req.user.companyId });
  const rankByUser = new Map(ranking.map((c) => [c.userId, c]));

  const requested = [...new Set(userIds.map(Number).filter((n) => Number.isInteger(n)))];
  // Candidato valido = presente nella classifica (assegnato all'area, senza sovrapposizione oraria) E
  // NON in opt-out sulla data (Fase 6): a chi ha dichiarato "non partecipare" non si invia la
  // proposta; finisce in `skipped` (visibile, non silenzioso). Il motore lo mostra comunque
  // retrocesso, così il responsabile vede il perché.
  const isValidCandidate = (uid) => rankByUser.has(uid) && !rankByUser.get(uid).optedOut;
  const valid = requested.filter(isValidCandidate);
  const skipped = requested.filter((uid) => !isValidCandidate(uid));

  if (valid.length === 0) {
    return res.status(400).json({
      error: 'Nessuno dei dipendenti selezionati è un candidato valido per questa sostituzione (sovrapposizione oraria, area non assegnata, oppure ha dichiarato di non partecipare in questa data).',
      skipped,
    });
  }

  // UPSERT multi-riga: una proposta per (turno, dipendente). Se esiste già ma NON è accettata, la
  // riporta a 'pending' col nuovo snapshot; una proposta già 'accepted' non viene toccata (guardia
  // WHERE) — caso comunque impossibile qui, perché un turno accettato non sarebbe più "aperto".
  const params = [Number(id), req.user.id];
  const tuples = valid.map((uid) => {
    const cand = rankByUser.get(uid);
    const base = params.length;
    params.push(uid, cand.score, JSON.stringify(cand.reasons));
    return `($1, $${base + 1}, $2, 'pending', $${base + 2}, $${base + 3}::jsonb, NULL, NOW())`;
  });

  const { rows: proposalRows } = await pool.query(
    `INSERT INTO substitution_proposals (shift_id, user_id, proposed_by, status, score, reasons, responded_at, created_at)
     VALUES ${tuples.join(', ')}
     ON CONFLICT (shift_id, user_id) DO UPDATE
       SET status = 'pending', score = EXCLUDED.score, reasons = EXCLUDED.reasons,
           proposed_by = EXCLUDED.proposed_by, responded_at = NULL, created_at = NOW()
       WHERE substitution_proposals.status <> 'accepted'
     RETURNING *`,
    params
  );

  // Notifica personale a ciascun dipendente proposto (best-effort, non blocca la risposta).
  for (const p of proposalRows) {
    await notifySubstitutionProposal({
      companyId: req.user.companyId,
      proposedUserId: p.user_id,
      proposalId: p.id,
      shiftId: shift.id,
      areaId: shift.area_id,
      sedeId: shift.sede_id,
      date: toDateOnly(shift.date),
      startTime: shift.start_time.slice(0, 5),
      endTime: shift.end_time.slice(0, 5),
    });
  }

  return res.status(201).json({
    proposed: proposalRows.map((p) => ({ id: p.id, userId: p.user_id, status: p.status, score: p.score })),
    skipped,
  });
}

// GET /api/shifts/:id/proposals (responsabile/dirigente) - proposte già inviate per una
// Sostituzione, per annotare la classifica in "Trova sostituzione" (chi è già stato proposto e in
// che stato). La Sostituzione deve appartenere alla società; non deve essere per forza ancora aperta.
async function listShiftProposals(req, res) {
  const { id } = req.params;
  const { rows: shiftRows } = await pool.query(
    'SELECT id FROM shifts WHERE id = $1 AND company_id = $2',
    [id, req.user.companyId]
  );
  if (shiftRows.length === 0) {
    return res.status(404).json({ error: 'Sostituzione non trovata' });
  }

  const { rows } = await pool.query(
    `SELECT sp.*, u.username
       FROM substitution_proposals sp
       JOIN users u ON u.id = sp.user_id
      WHERE sp.shift_id = $1
      ORDER BY sp.created_at DESC`,
    [id]
  );

  return res.json({
    proposals: rows.map((p) => ({
      id: p.id,
      userId: p.user_id,
      username: p.username,
      status: p.status,
      score: p.score,
      createdAt: p.created_at,
      respondedAt: p.responded_at,
    })),
  });
}

// GET /api/proposals/mine (dipendente) - le proprie proposte PENDENTI su turni ANCORA APERTI. Il
// JOIN sul turno aperto nasconde automaticamente le proposte relative a Sostituzioni già coperte per
// altra via (accettazione diretta o proposta gemella accettata), senza dover toccare claimShift.
async function listMyProposals(req, res) {
  const { rows } = await pool.query(
    `SELECT sp.id AS proposal_id, sp.score, sp.reasons,
            s.id AS shift_id, s.date, s.start_time, s.end_time, s.note,
            s.area_id, oa.name AS area_name, s.sede_id,
            proposer.username AS proposed_by_username
       FROM substitution_proposals sp
       JOIN shifts s ON s.id = sp.shift_id
       LEFT JOIN operational_areas oa ON oa.id = s.area_id
       LEFT JOIN users proposer ON proposer.id = sp.proposed_by
      WHERE sp.user_id = $1 AND sp.status = 'pending'
        AND s.type = 'volante' AND s.user_id IS NULL AND s.status = 'active'
      ORDER BY s.date, s.start_time`,
    [req.user.id]
  );

  return res.json({
    proposals: rows.map((p) => ({
      id: p.proposal_id,
      shiftId: p.shift_id,
      date: toDateOnly(p.date),
      startTime: p.start_time.slice(0, 5),
      endTime: p.end_time.slice(0, 5),
      note: p.note,
      areaId: p.area_id,
      areaName: p.area_name,
      score: p.score,
      reasons: p.reasons || [],
      proposedByUsername: p.proposed_by_username,
    })),
  });
}

// Carica una proposta assicurando che appartenga a chi opera (404 se inesistente o non propria: non
// si rivela l'esistenza di proposte altrui).
async function loadOwnProposal(proposalId, userId) {
  const { rows } = await pool.query(
    'SELECT * FROM substitution_proposals WHERE id = $1 AND user_id = $2',
    [proposalId, userId]
  );
  return rows[0] || null;
}

// POST /api/proposals/:id/accept (dipendente) - accetta una propria proposta pendente. Riusa il
// CLAIM ATOMICO condiviso (assignVolanteToUser): identici doppi controlli e stessa UPDATE
// condizionale di claimShift. Se un altro ha già coperto il turno (o l'ha preso una proposta
// gemella) la proposta va in 'expired' e si risponde 409.
async function acceptProposal(req, res) {
  const { id } = req.params;
  const proposal = await loadOwnProposal(id, req.user.id);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposta non trovata' });
  }
  if (proposal.status !== 'pending') {
    return res.status(409).json({ error: 'Questa proposta non è più valida' });
  }

  const shift = await loadOpenVolante(proposal.shift_id, req.user.companyId);
  if (!shift) {
    // Turno eliminato o già coperto: la proposta non è più azionabile.
    await pool.query(
      `UPDATE substitution_proposals SET status = 'expired', responded_at = NOW() WHERE id = $1 AND status = 'pending'`,
      [proposal.id]
    );
    return res.status(409).json({ error: 'La sostituzione non è più disponibile' });
  }

  const result = await assignVolanteToUser({ shiftRow: shift, user: req.user });
  if (!result.ok) {
    if (result.gone) {
      await pool.query(
        `UPDATE substitution_proposals SET status = 'expired', responded_at = NOW() WHERE id = $1 AND status = 'pending'`,
        [proposal.id]
      );
    }
    // Area/sovrapposizione (403/409 non-gone): la proposta resta pendente, la condizione potrebbe
    // rientrare (es. una sovrapposizione temporanea). Il dipendente vede il motivo dell'errore.
    return res.status(result.code).json({ error: result.error });
  }

  const claimed = result.claimed;
  // Questa proposta è accettata; le eventuali gemelle sullo stesso turno diventano 'expired'.
  await pool.query(
    `UPDATE substitution_proposals SET status = 'accepted', responded_at = NOW() WHERE id = $1`,
    [proposal.id]
  );
  await pool.query(
    `UPDATE substitution_proposals SET status = 'expired', responded_at = NOW()
      WHERE shift_id = $1 AND id <> $2 AND status = 'pending'`,
    [proposal.shift_id, proposal.id]
  );

  // Avvisa i responsabili che la Sostituzione è stata coperta (stessa notifica del claim autonomo).
  await notifySubstitutionClaimed({
    companyId: req.user.companyId,
    areaId: claimed.area_id,
    sedeId: claimed.sede_id,
    shiftId: claimed.id,
    date: toDateOnly(claimed.date),
    startTime: claimed.start_time.slice(0, 5),
    endTime: claimed.end_time.slice(0, 5),
    claimantUsername: req.user.username,
    claimantUserId: req.user.id,
  });

  return res.json({ shift: toSafeShift(claimed) });
}

// POST /api/proposals/:id/decline (dipendente) - rifiuta una propria proposta pendente. Avvisa i
// responsabili (così possono proporla ad altri) e lascia traccia (storico per il motore, Fase 6).
async function declineProposal(req, res) {
  const { id } = req.params;
  const proposal = await loadOwnProposal(id, req.user.id);
  if (!proposal) {
    return res.status(404).json({ error: 'Proposta non trovata' });
  }
  if (proposal.status !== 'pending') {
    return res.status(409).json({ error: 'Questa proposta non è più valida' });
  }

  await pool.query(
    `UPDATE substitution_proposals SET status = 'declined', responded_at = NOW() WHERE id = $1`,
    [proposal.id]
  );

  // Recupera i dati del turno per la notifica (potrebbe essere stato eliminato: in tal caso salta).
  const { rows: shiftRows } = await pool.query('SELECT * FROM shifts WHERE id = $1', [proposal.shift_id]);
  const shift = shiftRows[0];
  if (shift) {
    await notifyProposalDeclined({
      companyId: req.user.companyId,
      areaId: shift.area_id,
      sedeId: shift.sede_id,
      shiftId: shift.id,
      date: toDateOnly(shift.date),
      startTime: shift.start_time.slice(0, 5),
      endTime: shift.end_time.slice(0, 5),
      declinerUsername: req.user.username,
      declinerUserId: req.user.id,
    });
  }

  return res.json({ status: 'declined' });
}

module.exports = {
  createProposals,
  listShiftProposals,
  listMyProposals,
  acceptProposal,
  declineProposal,
};
