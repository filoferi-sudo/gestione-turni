import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Classifica dei dipendenti interni più compatibili per coprire una Sostituzione scoperta
// (Fase 4). È solo un SUGGERIMENTO in sola lettura: non assegna nulla. L'invio di una proposta
// mirata ai migliori candidati arriverà nella Fase 5.
export default function FindReplacementModal({ shift, onClose }) {
  const { token } = useAuth();
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getShiftCandidates(shift.id, token)
      .then(({ candidates }) => active && setCandidates(candidates))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [shift.id, token]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Trova sostituzione</h2>
        <p className="hint">
          Turno scoperto del <strong>{shift.date}</strong> · {shift.startTime}-{shift.endTime}. I candidati
          sono ordinati per compatibilità: è un suggerimento, la scelta resta al responsabile.
        </p>

        {error && <div className="error">{error}</div>}

        {loading ? (
          <p className="hint">Analisi dei candidati...</p>
        ) : candidates.length === 0 ? (
          <p className="hint">
            Nessun dipendente disponibile per questa fascia (tutti gli assegnati all'area hanno una
            sovrapposizione oraria, oppure l'area non ha dipendenti).
          </p>
        ) : (
          <ol className="candidate-list">
            {candidates.map((c, index) => (
              <li key={c.userId} className="candidate-item">
                <div className="candidate-head">
                  <span className="candidate-rank">{index + 1}</span>
                  <span className="candidate-name">{c.username}</span>
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
            ))}
          </ol>
        )}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
