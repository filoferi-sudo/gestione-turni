import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

// Pagina PUBBLICA di conferma email (Fase E2). Il link inviato via email punta qui con ?token=...;
// la pagina invia il token al backend (POST /auth/verify-email) e mostra l'esito. Nessuna sessione
// richiesta: il token è la prova. La verifica avviene con una POST (non con la sola apertura del
// link) per non essere innescata dai prefetch dei client email.
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('loading'); // loading | ok | error
  const [message, setMessage] = useState('');
  // Guard: in StrictMode (dev) gli effect girano due volte; senza questo il token monouso verrebbe
  // "consumato" alla prima chiamata e la seconda mostrerebbe un falso errore "già usato".
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!token) {
      setStatus('error');
      setMessage('Link non valido: token mancante.');
      return;
    }
    api
      .verifyEmail(token)
      .then(() => {
        setStatus('ok');
        setMessage('Il tuo indirizzo email è stato verificato con successo.');
      })
      .catch((err) => {
        setStatus('error');
        setMessage(err.message || 'Verifica non riuscita.');
      });
  }, [token]);

  return (
    <div className="page-center">
      <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1>Verifica email</h1>
        {status === 'loading' && <p className="subtitle">Verifica in corso…</p>}
        {status === 'ok' && <p className="success">{message}</p>}
        {status === 'error' && <div className="error">{message}</div>}
        <p style={{ marginTop: 20 }}>
          <Link to="/login">Vai all'accesso</Link>
        </p>
      </div>
    </div>
  );
}
