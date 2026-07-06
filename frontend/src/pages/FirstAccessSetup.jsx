import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function FirstAccessSetup() {
  const location = useLocation();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  const firstAccessToken = location.state?.firstAccessToken;
  const username = location.state?.username;

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!firstAccessToken) {
    navigate('/login', { replace: true });
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword.length < 8) {
      setError('La password deve avere almeno 8 caratteri');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Le password non coincidono');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.firstLoginSetup(newPassword, firstAccessToken);
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
        <h1>Primo accesso</h1>
        <p className="subtitle">Benvenuto {username}, crea la tua password personale</p>

        <label htmlFor="newPassword">Nuova password</label>
        <input
          id="newPassword"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <label htmlFor="confirmPassword">Conferma password</label>
        <input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Salvataggio...' : 'Imposta password e accedi'}
        </button>
      </form>
    </div>
  );
}
