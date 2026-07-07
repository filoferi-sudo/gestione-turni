import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';

const STATUS_LABELS = {
  pending: 'In attesa',
  approved: 'Approvata',
  rejected: 'Rifiutata',
};

// Vista dipendente: stato delle proprie richieste di cancellazione turno (funge da notifica dell'esito).
export default function MyCancellationRequests() {
  const { token } = useAuth();
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState('');

  function load() {
    api
      .listMyCancellationRequests(token)
      .then(({ requests }) => setRequests(requests))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  // Aggiornamenti quasi in tempo reale: l'esito (approvata/rifiutata) arriva dal responsabile in
  // ogni momento, funge da notifica.
  usePolling(load, { intervalMs: 10000 });

  if (requests.length === 0 && !error) return null;

  return (
    <section className="card">
      <h2>Le mie richieste di cancellazione</h2>
      {error && <div className="error">{error}</div>}
      <ul className="shift-list">
        {requests.map((r) => (
          <li key={r.id} className="shift-list-item">
            <span>
              {r.shiftDate} · {r.shiftStartTime}-{r.shiftEndTime}
            </span>
            <span className={`request-status request-status-${r.status}`}>{STATUS_LABELS[r.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
