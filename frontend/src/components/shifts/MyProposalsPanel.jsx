import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';

// "Le mie proposte" (Fase 5): proposte mirate ricevute dal dipendente da un responsabile. Sono un
// canale aggiuntivo — la stessa Sostituzione resta comunque accettabile dal pannello "Sostituzioni
// disponibili". Accettare qui riusa lo stesso claim atomico (se un altro l'ha già presa nel
// frattempo, la proposta sparisce/segnala l'errore). Rifiutare avvisa il responsabile.
// Un unico pannello per il dipendente: le proposte arrivano da qualunque area a cui è assegnato.
export default function MyProposalsPanel() {
  const { token } = useAuth();
  const [proposals, setProposals] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  function load() {
    api
      .listMyProposals(token)
      .then(({ proposals }) => setProposals(proposals))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  // Una proposta può essere superata (il turno viene coperto per altra via) in ogni momento:
  // polling leggero, sospeso mentre un'accettazione/rifiuto locale è in corso.
  usePolling(load, { intervalMs: 5000, enabled: !busyId });

  async function handleAccept(proposal) {
    setError('');
    setNotice('');
    setBusyId(proposal.id);
    try {
      await api.acceptProposal(proposal.id, token);
      setNotice(`Sostituzione del ${proposal.date} accettata con successo.`);
      load();
    } catch (err) {
      setError(err.message);
      load(); // il turno potrebbe essere già stato coperto: la proposta sparisce dalla lista
    } finally {
      setBusyId(null);
    }
  }

  async function handleDecline(proposal) {
    if (!window.confirm('Rifiutare questa proposta di sostituzione?')) return;
    setError('');
    setNotice('');
    setBusyId(proposal.id);
    try {
      await api.declineProposal(proposal.id, token);
      load();
    } catch (err) {
      setError(err.message);
      load();
    } finally {
      setBusyId(null);
    }
  }

  // Pannello nascosto quando non ci sono proposte: non ingombra la dashboard nel caso comune.
  if (proposals.length === 0 && !error) return null;

  return (
    <section className="card">
      <h2>Le mie proposte di sostituzione</h2>
      <p className="hint">
        Un responsabile ti ha proposto queste sostituzioni. Puoi accettarle o rifiutarle: la scelta è tua.
      </p>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {proposals.length === 0 ? (
        <p className="hint">Nessuna proposta al momento.</p>
      ) : (
        <ul className="shift-list">
          {proposals.map((p) => (
            <li key={p.id} className="proposal-item">
              <div className="proposal-info">
                <span>
                  {p.date} · {p.startTime}-{p.endTime}
                  {p.areaName ? ` · ${p.areaName}` : ''}
                  {p.note ? ` · ${p.note}` : ''}
                  {p.proposedByUsername && (
                    <span className="hint"> · proposta da {p.proposedByUsername}</span>
                  )}
                </span>
                {p.reasons && p.reasons.length > 0 && (
                  <ul className="candidate-reasons">
                    {p.reasons.map((r, i) => (
                      <li key={i} className={`reason reason-${r.kind}`}>
                        {r.text}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <span className="shift-item-actions">
                <button disabled={busyId === p.id} onClick={() => handleAccept(p)}>
                  {busyId === p.id ? 'Attendere...' : 'Accetta'}
                </button>
                <button
                  className="button-secondary"
                  disabled={busyId === p.id}
                  onClick={() => handleDecline(p)}
                >
                  Rifiuta
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
