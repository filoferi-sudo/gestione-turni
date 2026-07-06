import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

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
      </form>
    </div>
  );
}
