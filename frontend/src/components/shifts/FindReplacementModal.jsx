import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Etichette per lo stato di una proposta già inviata a un candidato (Fase 5).
const PROPOSAL_STATUS_LABEL = {
  pending: 'Proposta inviata',
  accepted: 'Ha accettato',
  declined: 'Ha rifiutato',
  expired: 'Proposta scaduta',
};

// Classifica dei dipendenti interni più compatibili per coprire una Sostituzione scoperta
// (motore di Fase 4). Da qui (Fase 5) il responsabile può INVIARE una proposta mirata solo ai
// candidati che seleziona: è comunque solo un supporto, la decisione finale (accettare) resta del
// dipendente. Non assegna mai automaticamente.
export default function FindReplacementModal({ shift, onClose }) {
  const { token } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [proposalsByUser, setProposalsByUser] = useState({}); // userId -> status della proposta già inviata
  const [selected, setSelected] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function loadProposals() {
    return api
      .listShiftProposals(shift.id, token)
      .then(({ proposals }) => {
        const map = {};
        for (const p of proposals) map[p.userId] = p.status;
        setProposalsByUser(map);
      })
      .catch(() => {}); // annotazione accessoria: un errore qui non deve nascondere la classifica
  }

  useEffect(() => {
    let active = true;
    Promise.all([api.getShiftCandidates(shift.id, token), loadProposals()])
      .then(([{ candidates }]) => active && setCandidates(candidates))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shift.id, token]);

  function toggle(userId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  async function handleSend() {
    if (selected.size === 0) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const { proposed, skipped } = await api.createProposals(shift.id, [...selected], token);
      const parts = [`Proposta inviata a ${proposed.length} dipendent${proposed.length === 1 ? 'e' : 'i'}.`];
      if (skipped && skipped.length > 0) {
        parts.push(`${skipped.length} non idone${skipped.length === 1 ? 'o' : 'i'} (sovrapposizione oraria o area).`);
      }
      setNotice(parts.join(' '));
      setSelected(new Set());
      await loadProposals();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Trova sostituzione</h2>
        <p className="hint">
          Turno scoperto del <strong>{shift.date}</strong> · {shift.startTime}-{shift.endTime}. I candidati
          sono ordinati per compatibilità: seleziona chi vuoi e invia una proposta. Resta comunque il
          dipendente a decidere se accettare.
        </p>

        {error && <div className="error">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        {loading ? (
          <p className="hint">Analisi dei candidati...</p>
        ) : candidates.length === 0 ? (
          <p className="hint">
            Nessun dipendente disponibile per questa fascia (tutti gli assegnati all'area hanno una
            sovrapposizione oraria, oppure l'area non ha dipendenti).
          </p>
        ) : (
          <ol className="candidate-list">
            {candidates.map((c, index) => {
              const proposalStatus = proposalsByUser[c.userId];
              return (
                <li key={c.userId} className="candidate-item">
                  <div className="candidate-head">
                    <input
                      type="checkbox"
                      className="candidate-check"
                      checked={selected.has(c.userId)}
                      onChange={() => toggle(c.userId)}
                      aria-label={`Seleziona ${c.username}`}
                    />
                    <span className="candidate-rank">{index + 1}</span>
                    <span className="candidate-name">{c.username}</span>
                    {proposalStatus && (
                      <span className={`proposal-badge proposal-badge-${proposalStatus}`}>
                        {PROPOSAL_STATUS_LABEL[proposalStatus] || proposalStatus}
                      </span>
                    )}
                    <span className={`candidate-score${c.score >= 75 ? ' score-high' : c.score >= 50 ? ' score-mid' : ' score-low'}`}>
                      {c.score}%
                    </span>
                  </div>
                  <ul className="candidate-reasons">
                    {c.reasons.map((r, i) => (
                      <li key={i} className={`reason reason-${r.kind}`}>
                        {r.text}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Chiudi
          </button>
          <button type="button" onClick={handleSend} disabled={sending || selected.size === 0}>
            {sending ? 'Invio...' : `Invia proposta${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
