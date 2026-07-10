import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';
import { relativeTime } from '../../components/notifications/NotificationsBell';

// Sezione Comunicazioni (tutti i ruoli di società): l'elenco completo delle notifiche in-app, con
// "segna come letta". Per responsabile/dirigente aggiunge lo STORICO EMAIL della società (Fase E7):
// la vista di consultazione delle comunicazioni email inviate (stato: inviata / non inviata / fallita).
// La campanella nella topbar resta il punto di accesso rapido; questa pagina è la vista estesa.

// Etichette leggibili dei tipi di evento email.
const EVENT_LABELS = {
  shift_assigned: 'Turno assegnato',
  shift_modified: 'Turno modificato',
  substitution_proposed: 'Proposta di sostituzione',
  cancellation_requested: 'Richiesta di cancellazione',
  cancellation_approved: 'Cancellazione approvata',
  cancellation_rejected: 'Cancellazione rifiutata',
  substitution_proposal_declined: 'Proposta rifiutata',
  email_verification: 'Verifica email',
};
function eventLabel(type) {
  return EVENT_LABELS[type] || type;
}

// Stato invio → etichetta + classe badge.
const STATUS_BADGE = {
  sent: { label: 'Inviata', className: 'badge-success' },
  suppressed: { label: 'Non inviata', className: 'badge-warning' },
  failed: { label: 'Fallita', className: 'badge-danger' },
  pending: { label: 'In attesa', className: 'badge' },
};

export default function ComunicazioniPage() {
  const { token, user } = useAuth();
  const isManager = user.role === 'admin' || user.role === 'dirigente';
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');

  function load() {
    api
      .listNotifications(token)
      .then(({ notifications, unreadCount }) => {
        setNotifications(notifications);
        setUnreadCount(unreadCount);
      })
      .catch((err) => setError(err.message));

    if (isManager) {
      api
        .listEmailLog(token)
        .then(({ emails }) => setEmails(emails))
        .catch((err) => setEmailError(err.message));
    }
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

      {isManager && (
        <section className="card">
          <h2>Email inviate</h2>
          <p className="hint">
            Storico delle email generate dal sistema. "Non inviata" indica un invio soppresso (ambiente
            demo o destinatario senza email verificata).
          </p>
          {emailError && <div className="error">{emailError}</div>}
          {emails.length === 0 ? (
            <p className="hint">Nessuna email registrata.</p>
          ) : (
            <div className="table-scroll">
              <table className="table email-log-table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Destinatario</th>
                    <th>Comunicazione</th>
                    <th>Stato</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((e) => {
                    const badge = STATUS_BADGE[e.status] || STATUS_BADGE.pending;
                    return (
                      <tr key={e.id}>
                        <td>{relativeTime(e.createdAt)}</td>
                        <td>{e.recipientUsername || e.toEmail}</td>
                        <td>
                          {eventLabel(e.eventType)}
                          {e.subject && <div className="email-log-subject">{e.subject}</div>}
                        </td>
                        <td>
                          <span className={`badge ${badge.className}`}>{badge.label}</span>
                          {(e.status === 'suppressed' || e.status === 'failed') && e.error && (
                            <div className="email-log-reason">{e.error}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </>
  );
}
