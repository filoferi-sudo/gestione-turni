import { useEffect, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import PasswordRequirements from '../components/auth/PasswordRequirements';
import { DEFAULT_POLICY, isPasswordValid } from '../utils/passwordPolicy';

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
  const [policy, setPolicy] = useState(DEFAULT_POLICY);

  // Carica i requisiti password attivi dal backend: la checklist riflette la configurazione reale.
  // In caso di errore si resta sui default (nessun blocco per l'utente).
  useEffect(() => {
    api
      .passwordPolicy()
      .then(({ policy }) => policy && setPolicy(policy))
      .catch(() => {});
  }, []);

  // Nessun token di primo accesso (es. pagina aperta direttamente): redirect DICHIARATIVO a /login.
  // <Navigate> esegue la navigazione nel commit (non durante il render), evitando il warning React
  // "Cannot update a component while rendering a different component". Comportamento utente identico.
  if (!firstAccessToken) {
    return <Navigate to="/login" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!isPasswordValid(newPassword, policy)) {
      setError('La password non rispetta i requisiti di sicurezza');
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

        <PasswordRequirements password={newPassword} policy={policy} />

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
