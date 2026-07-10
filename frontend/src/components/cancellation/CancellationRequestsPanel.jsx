import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';

// Pannello per responsabile/dirigente: elenco richieste di cancellazione turno in attesa,
// con possibilità di approvare o rifiutare.
export default function CancellationRequestsPanel() {
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  function load() {
    api
      .listCancellationRequests(token, 'pending')
      .then(({ requests }) => setRequests(requests))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  // Aggiornamenti quasi in tempo reale: nuove richieste possono arrivare in ogni momento.
  usePolling(load, { intervalMs: 10000, enabled: !busyId });

  async function handleDecision(request, decision) {
    setError('');
    setBusyId(request.id);
    try {
      if (decision === 'approve') await api.approveCancellationRequest(request.id, token);
      else await api.rejectCancellationRequest(request.id, token);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card" data-tour="cancellation-requests">
      <h2>Richieste di cancellazione turno</h2>

      {error && <div className="error">{error}</div>}

      {requests.length === 0 ? (
        <p className="hint">Nessuna richiesta in attesa.</p>
      ) : (
        <ul className="shift-list">
          {requests.map((r, index) => (
            <li key={r.id} className="shift-list-item">
              <span>
                <strong>{r.requestedByUsername}</strong> · {r.shiftDate} · {r.shiftStartTime}-{r.shiftEndTime}
                {r.shiftNote ? ` · ${r.shiftNote}` : ''}
              </span>
              <span>
                <button
                  data-tour={index === 0 ? 'approve-request' : undefined}
                  disabled={busyId === r.id}
                  onClick={() => handleDecision(r, 'approve')}
                >
                  Approva
                </button>
                <button
                  className="button-danger"
                  disabled={busyId === r.id}
                  onClick={() => handleDecision(r, 'reject')}
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
