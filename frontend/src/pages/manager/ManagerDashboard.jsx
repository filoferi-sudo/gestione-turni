import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useManagerWorkspace } from '../../context/ManagerWorkspaceContext';
import { usePolling } from '../../hooks/usePolling';
import { formatDateISO } from '../../utils/dates';

// Panoramica generale per Dirigente/Responsabile: solo indicatori riassuntivi con link alla
// sezione di dettaglio, nessuna operazione. Le azioni (approvare richieste, gestire turni,
// generare sostituzioni...) vivono nelle rispettive sezioni della sidebar. Riusa esclusivamente
// endpoint già esistenti: nessuna nuova rotta backend per la dashboard.
export default function ManagerDashboard() {
  const { user, token } = useAuth();
  const { areas, selectedSede } = useManagerWorkspace();
  const base = user.role === 'dirigente' ? '/dirigente' : '/admin';

  const [openSubstitutions, setOpenSubstitutions] = useState(null);
  const [pendingRequests, setPendingRequests] = useState(null);
  const [todayCoverage, setTodayCoverage] = useState(null); // [{ areaName, occurrences }]
  const [notifications, setNotifications] = useState(null); // { unreadCount, recent }
  const [error, setError] = useState('');

  const shiftAreas = areas.filter((a) => a.calendarMode === 'shifts');

  function load() {
    const today = formatDateISO(new Date());

    Promise.all(shiftAreas.map((area) => api.listAvailableShifts(token, area.id)))
      .then((results) => setOpenSubstitutions(results.reduce((sum, { shifts }) => sum + shifts.length, 0)))
      .catch((err) => setError(err.message));

    api
      .listCancellationRequests(token, 'pending')
      .then(({ requests }) => setPendingRequests(requests.length))
      .catch((err) => setError(err.message));

    Promise.all(
      shiftAreas.map((area) =>
        api
          .getStaffingCoverage(token, { areaId: area.id, start: today, end: today })
          .then(({ coverage }) => ({ areaName: area.name, occurrences: coverage }))
      )
    )
      .then((results) => setTodayCoverage(results.filter((r) => r.occurrences.length > 0)))
      .catch((err) => setError(err.message));

    api
      .listNotifications(token)
      .then(({ notifications: list, unreadCount }) => setNotifications({ unreadCount, recent: list.slice(0, 5) }))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token, areas]);
  usePolling(load, { intervalMs: 30000 });

  const todayMissing =
    todayCoverage === null
      ? null
      : todayCoverage.reduce(
          (sum, { occurrences }) => sum + occurrences.reduce((s, occ) => s + occ.missingSlots, 0),
          0
        );

  const todayLabel = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <h1>Dashboard</h1>
      <p className="subtitle">
        {todayLabel}
        {selectedSede ? ` — ${selectedSede.name}` : ''}
      </p>

      {error && <div className="error">{error}</div>}

      <div className="dash-grid">
        <div className="stat-card">
          <span className={`stat-value${openSubstitutions > 0 ? ' stat-alert' : ''}`}>
            {openSubstitutions ?? '—'}
          </span>
          <span className="stat-label">Sostituzioni aperte (turni scoperti)</span>
          <Link className="stat-link" to={`${base}/sostituzioni`}>
            Vai a Sostituzioni →
          </Link>
        </div>

        <div className="stat-card">
          <span className={`stat-value${pendingRequests > 0 ? ' stat-alert' : ''}`}>{pendingRequests ?? '—'}</span>
          <span className="stat-label">Richieste di cancellazione in attesa</span>
          <Link className="stat-link" to={`${base}/turni`}>
            Vai a Turni →
          </Link>
        </div>

        <div className="stat-card">
          <span className={`stat-value${todayMissing > 0 ? ' stat-alert' : ''}`}>{todayMissing ?? '—'}</span>
          <span className="stat-label">Posti di fabbisogno scoperti oggi</span>
          <Link className="stat-link" to={`${base}/calendario`}>
            Vai al Calendario →
          </Link>
        </div>

        <div className="stat-card">
          <span className="stat-value">{notifications ? notifications.unreadCount : '—'}</span>
          <span className="stat-label">Notifiche non lette</span>
          <Link className="stat-link" to={`${base}/comunicazioni`}>
            Vai a Comunicazioni →
          </Link>
        </div>
      </div>

      {todayCoverage !== null && todayCoverage.length > 0 && (
        <section className="card">
          <h2>Copertura fabbisogno di oggi</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Area</th>
                <th>Fascia oraria</th>
                <th>Copertura</th>
              </tr>
            </thead>
            <tbody>
              {todayCoverage.flatMap(({ areaName, occurrences }) =>
                occurrences.map((occ) => {
                  // Stesso conteggio di StaffingChip: assegnati + Sostituzioni già pubblicate.
                  const covered = occ.assignedUsers.length + occ.openSlots;
                  return (
                    <tr key={`${areaName}-${occ.requirementId}-${occ.startTime}`}>
                      <td>{areaName}</td>
                      <td>
                        {occ.startTime} – {occ.endTime}
                      </td>
                      <td>
                        <span className={occ.missingSlots > 0 ? 'stat-alert' : ''}>
                          {covered}/{occ.requiredCount}
                          {occ.missingSlots > 0 ? ` (${occ.missingSlots} scopert${occ.missingSlots === 1 ? 'o' : 'i'})` : ''}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          <p className="dash-section-note">
            Per generare le Sostituzioni mancanti usa i chip di copertura nel{' '}
            <Link to={`${base}/calendario`}>Calendario</Link>.
          </p>
        </section>
      )}

      {notifications !== null && (
        <section className="card">
          <h2>Notifiche recenti</h2>
          {notifications.recent.length === 0 ? (
            <p className="hint">Nessuna notifica.</p>
          ) : (
            <ul className="notif-list comms-list">
              {notifications.recent.map((n) => (
                <li key={n.id} className={`notif-item${n.isRead ? '' : ' notif-item-unread'}`}>
                  <span className="notif-message">{n.message}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="dash-section-note">
            L'elenco completo è in <Link to={`${base}/comunicazioni`}>Comunicazioni</Link>.
          </p>
        </section>
      )}
    </>
  );
}
