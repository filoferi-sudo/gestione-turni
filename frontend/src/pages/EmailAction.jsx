import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';

// Pagina PUBBLICA di conferma di una Email Action (Fase E5). Il bottone nell'email punta qui con
// ?token=...; la pagina DESCRIVE l'azione (GET, non muta nulla — così i prefetch dei client email
// non la innescano) e la esegue solo alla conferma esplicita dell'utente (POST). Nessuna sessione:
// il token è la prova.
export default function EmailAction() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [phase, setPhase] = useState('loading'); // loading | invalid | ready | executing | result
  const [info, setInfo] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!token) {
      setPhase('invalid');
      setInfo({ message: 'Link non valido: token mancante.' });
      return;
    }
    // GET describe: idempotente (non consuma il token), quindi nessun problema col doppio effect di
    // StrictMode.
    api
      .describeEmailAction(token)
      .then((data) => {
        if (!data.valid) {
          setPhase('invalid');
          setInfo({ message: data.message });
          return;
        }
        setInfo(data);
        setPhase('ready');
      })
      .catch((err) => {
        setPhase('invalid');
        setInfo({ message: err.message });
      });
  }, [token]);

  async function confirm() {
    setPhase('executing');
    try {
      const data = await api.executeEmailAction(token);
      setResult(data);
    } catch (err) {
      setResult({ done: false, message: err.message });
    } finally {
      setPhase('result');
    }
  }

  return (
    <div className="page-center">
      <div className="card" style={{ maxWidth: 460, textAlign: 'center' }}>
        <h1>{info?.title || 'Azione'}</h1>

        {phase === 'loading' && <p className="subtitle">Caricamento…</p>}

        {phase === 'invalid' && <div className="error">{info?.message}</div>}

        {(phase === 'ready' || phase === 'executing') && (
          <>
            <p>{info.description}</p>
            {info.note && <p className="email-pending-note">{info.note}</p>}
            {info.actionable && (
              <button onClick={confirm} disabled={phase === 'executing'} style={{ marginTop: 8 }}>
                {phase === 'executing' ? 'Attendere…' : 'Conferma'}
              </button>
            )}
          </>
        )}

        {phase === 'result' && (
          <p className={result.done ? 'success' : 'email-pending-note'}>{result.message}</p>
        )}

        <p style={{ marginTop: 20 }}>
          <Link to="/login">Vai all'accesso</Link>
        </p>
      </div>
    </div>
  );
}
