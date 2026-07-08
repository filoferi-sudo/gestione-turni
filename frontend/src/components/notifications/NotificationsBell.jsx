import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';

// Tempo relativo compatto in italiano ("adesso", "5 min fa", "3 h fa", "2 g fa", poi data).
function relativeTime(iso) {
  const then = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - then) / 60000);
  if (diffMin < 1) return 'adesso';
  if (diffMin < 60) return `${diffMin} min fa`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH} h fa`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `${diffD} g fa`;
  return new Date(iso).toLocaleDateString('it-IT');
}

// Campanella delle notifiche in-app: contatore delle non lette + pannello a discesa con l'elenco.
// Montata nell'header di tutte le dashboard (dipendente, responsabile, dirigente). Polling leggero
// a 10s (usePolling): aggiorna contatore ed elenco in-place, senza stato di caricamento che
// nasconda contenuto, quindi nessuno sfarfallio (vedi PROJECT_CONTEXT.md, pattern polling).
export default function NotificationsBell() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  function load() {
    api
      .listNotifications(token)
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications);
        setUnreadCount(unreadCount);
      })
      .catch(() => {
        /* la campanella è accessoria: un errore di rete non deve disturbare la dashboard */
      });
  }

  useEffect(load, [token]);
  usePolling(load, { intervalMs: 10000 });

  // Chiude il pannello al click fuori.
  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function handleOpenItem(notif) {
    if (!notif.isRead) {
      // Ottimistico: marca subito come letta nell'UI, poi conferma al server.
      setNotifications((list) => list.map((n) => (n.id === notif.id ? { ...n, isRead: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      try {
        await api.markNotificationRead(notif.id, token);
      } catch {
        load(); // in caso di errore, riallinea con il server
      }
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
    <div className="notif-root" ref={rootRef}>
      <button
        type="button"
        className="notif-bell"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifiche${unreadCount > 0 ? ` (${unreadCount} non lette)` : ''}`}
      >
        <span className="notif-bell-icon" aria-hidden="true">🔔</span>
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-panel-header">
            <strong>Notifiche</strong>
            {unreadCount > 0 && (
              <button type="button" className="notif-markall" onClick={handleMarkAll}>
                Segna tutte come lette
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="notif-empty">Nessuna notifica.</p>
          ) : (
            <ul className="notif-list">
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
        </div>
      )}
    </div>
  );
}
