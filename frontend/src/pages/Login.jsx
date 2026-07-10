import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import DemoPersonaPicker from '../components/demo/DemoPersonaPicker';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [demo, setDemo] = useState(null); // { enabled, scenarios } da GET /api/demo/status
  const [showDemo, setShowDemo] = useState(false);
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  // Stato demo: se attiva, mostriamo il bottone "Prova la demo". best-effort (errore ⇒ nessun demo).
  useEffect(() => {
    api.demoStatus().then(setDemo).catch(() => setDemo({ enabled: false }));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await api.login(username, password);

      if (result.firstAccess) {
        // Primo accesso: passiamo alla schermata di impostazione password
        navigate('/first-access', {
          state: { firstAccessToken: result.firstAccessToken, username: result.user.username },
        });
        return;
      }

      loginWithToken(result.token, result.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-center">
      <form className="card" onSubmit={handleSubmit}>
        <h1>Accedi</h1>
        <p className="subtitle">Gestione Turni</p>

        <label htmlFor="username">Username</label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

        <label htmlFor="password">Password (o codice iniziale)</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Accesso in corso...' : 'Accedi'}
        </button>

        <p className="hint">
          Al primo accesso usa il codice iniziale ricevuto dal responsabile al posto della password.
        </p>

        {demo && demo.enabled && demo.scenarios.length > 0 && (
          <div className="demo-entry">
            {!showDemo ? (
              <button type="button" className="demo-cta" onClick={() => { setError(''); setShowDemo(true); }}>
                Prova la demo — {demo.scenarios[0].name}
              </button>
            ) : (
              <DemoPersonaPicker scenario={demo.scenarios[0]} onError={setError} />
            )}
          </div>
        )}
      </form>
    </div>
  );
}
