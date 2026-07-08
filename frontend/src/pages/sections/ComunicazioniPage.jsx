import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';
import { relativeTime } from '../../components/notifications/NotificationsBell';

// Sezione Comunicazioni (tutti i ruoli di società): l'elenco completo delle notifiche in-app,
// con "segna come letta" al click e "segna tutte come lette". La campanella nella topbar resta
// il punto di accesso rapido (ultimi avvisi); questa pagina è la vista estesa ed è il punto di
// aggancio per le future comunicazioni (email, avvisi automatici, messaggi interni) senza
// cambiare la navigazione. Stessa logica ottimistica della campanella.
export default function ComunicazioniPage() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState('');

  function load() {
    api
      .listNotifications(token)
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications);
        setUnreadCount(unreadCount);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);
  usePolling(load, { intervalMs: 10000 });

  async function handleOpenItem(notif) {
    if (notif.isRead) return;
    setNotifications((list) => list.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.markNotificationRead(notif.id, token);
    } catch {
      load();
    }
  }

  async function handleMarkAll() {
    setNotifications((list) => list.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await api.markAllNotificationsRead(token);
    } catch {
      load();
    }
  }

  return (
    <>
      <h1>Comunicazioni</h1>
      <p className="subtitle">Le notifiche della tua società: sostituzioni, richieste, approvazioni.</p>

      {error && <div className="error">{error}</div>}

      <section className="card">
        <div className="section-header">
          <h2>Notifiche{unreadCount > 0 ? ` (${unreadCount} non lette)` : ''}</h2>
          {unreadCount > 0 && (
            <button type="button" className="notif-markall" onClick={handleMarkAll}>
              Segna tutte come lette
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <p className="hint">Nessuna notifica.</p>
        ) : (
          <ul className="notif-list comms-list">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`notif-item${n.isRead ? '' : ' notif-item-unread'}`}
                onClick={() => handleOpenItem(n)}
              >
                <span className="notif-message">{n.message}</span>
                <span className="notif-time">{relativeTime(n.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
