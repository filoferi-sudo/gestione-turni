import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';

// Panoramica del dipendente: solo indicatori riassuntivi con link alla sezione di dettaglio.
// Le azioni (accettare proposte, reclamare sostituzioni, chiedere cancellazioni...) vivono
// nelle rispettive sezioni della sidebar. Riusa solo endpoint già esistenti.
export default function EmployeeHome() {
  const { user, token } = useAuth();
  const areas = user.areas || [];

  const [pendingProposals, setPendingProposals] = useState(null);
  const [availableCount, setAvailableCount] = useState(null);
  const [myPendingRequests, setMyPendingRequests] = useState(null);
  const [notifications, setNotifications] = useState(null);
  const [error, setError] = useState('');

  const shiftAreas = areas.filter((a) => a.calendarMode === 'shifts');
  const courseAreas = areas.filter((a) => a.calendarMode === 'courses');

  function load() {
    api
      .listMyProposals(token)
      .then(({ proposals }) => setPendingProposals(proposals.length))
      .catch((err) => setError(err.message));

    Promise.all([
      ...shiftAreas.map((area) => api.listAvailableShifts(token, area.id).then(({ shifts }) => shifts.length)),
      ...courseAreas.map((area) => api.listAvailableCourses(token, area.id).then(({ courses }) => courses.length)),
    ])
      .then((counts) => setAvailableCount(counts.reduce((sum, n) => sum + n, 0)))
      .catch((err) => setError(err.message));

    api
      .listMyCancellationRequests(token)
      .then(({ requests }) => setMyPendingRequests(requests.filter((r) => r.status === 'pending').length))
      .catch((err) => setError(err.message));

    api
      .listNotifications(token)
      .then(({ notifications: list, unreadCount }) => setNotifications({ unreadCount, recent: list.slice(0, 5) }))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);
  usePolling(load, { intervalMs: 30000 });

  const todayLabel = new Date().toLocaleDateString('it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <>
      <h1>Ciao, {user.username}</h1>
      <p className="subtitle">{todayLabel}</p>

      {error && <div className="error">{error}</div>}

      {areas.length === 0 ? (
        <section className="card">
          <p className="hint">
            Non sei ancora assegnato a nessuna area operativa. Contatta il responsabile o il dirigente della
            tua società per essere aggiunto a un'area (es. Bagnini, Istruttori, Reception...).
          </p>
        </section>
      ) : (
        <div className="dash-grid">
          <div className="stat-card">
            <span className={`stat-value${pendingProposals > 0 ? ' stat-alert' : ''}`}>
              {pendingProposals ?? '—'}
            </span>
            <span className="stat-label">Proposte di sostituzione da rispondere</span>
            <Link className="stat-link" to="/dashboard/sostituzioni">
              Vai a Sostituzioni →
            </Link>
          </div>

          <div className="stat-card">
            <span className="stat-value">{availableCount ?? '—'}</span>
            <span className="stat-label">Sostituzioni e corsi disponibili nelle tue aree</span>
            <Link className="stat-link" to="/dashboard/sostituzioni">
              Vai a Sostituzioni →
            </Link>
          </div>

          <div className="stat-card">
            <span className="stat-value">{myPendingRequests ?? '—'}</span>
            <span className="stat-label">Tue richieste di cancellazione in attesa</span>
            <Link className="stat-link" to="/dashboard/turni">
              Vai a Turni →
            </Link>
          </div>

          <div className="stat-card">
            <span className="stat-value">{notifications ? notifications.unreadCount : '—'}</span>
            <span className="stat-label">Notifiche non lette</span>
            <Link className="stat-link" to="/dashboard/comunicazioni">
              Vai a Comunicazioni →
            </Link>
          </div>
        </div>
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
            L'elenco completo è in <Link to="/dashboard/comunicazioni">Comunicazioni</Link>.
          </p>
        </section>
      )}
    </>
  );
}
