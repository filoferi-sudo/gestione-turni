import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Panoramica del Super Admin: statistiche aggregate di piattaforma. La gestione delle società
// (creazione, modifica, attivazione, primo dirigente) è nella sezione Società.
export default function SuperAdminHome() {
  const { token } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getPlatformStats(token).then(setStats).catch((err) => setError(err.message));
  }, [token]);

  return (
    <>
      <h1>Dashboard piattaforma</h1>

      {error && <div className="error">{error}</div>}

      {stats && (
        <div className="dash-grid">
          <div className="stat-card">
            <span className="stat-value">{stats.companiesTotal}</span>
            <span className="stat-label">Società totali ({stats.companiesActive} attive)</span>
            <Link className="stat-link" to="/superadmin/societa">
              Vai a Società →
            </Link>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.usersTotal}</span>
            <span className="stat-label">Utenti totali</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.usersByRole.dirigente}</span>
            <span className="stat-label">Dirigenti</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.usersByRole.admin}</span>
            <span className="stat-label">Responsabili</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.usersByRole.user}</span>
            <span className="stat-label">Dipendenti</span>
          </div>
        </div>
      )}
    </>
  );
}
