import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

// Gestione self-service dell'email (Fase E2): mostra l'indirizzo attuale con lo stato di verifica,
// permette di reinviare il link e di richiedere un cambio email. Il nuovo indirizzo non sostituisce
// quello attuale finché non viene confermato dal link (flusso pending_email lato backend).
export default function EmailManager() {
  const { user, token, refreshUser } = useAuth();
  const [editing, setEditing] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const isDemo = user.isDemo;

  async function resend() {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.sendVerificationEmail(token);
      setMessage(`Link di verifica inviato a ${res.sentTo || user.pendingEmail || user.email}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitChange(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.changeEmail(newEmail.trim(), token);
      setMessage(
        `Ti abbiamo inviato un link di verifica a ${res.pendingEmail}. ` +
          "L'indirizzo attuale resta attivo finché non confermi il nuovo."
      );
      setEditing(false);
      setNewEmail('');
      await refreshUser();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <h2>Email</h2>
      <p className="email-current">
        <strong>{user.email}</strong>{' '}
        {user.emailVerified ? (
          <span className="badge badge-success">Verificata</span>
        ) : (
          <span className="badge badge-warning">Da verificare</span>
        )}
      </p>

      {user.pendingEmail && (
        <p className="email-pending-note">
          In attesa di verifica: <strong>{user.pendingEmail}</strong> — apri il link inviato a
          quell'indirizzo per completare il cambio.
        </p>
      )}

      {isDemo && (
        <p className="hint">In modalità demo le email non vengono inviate realmente.</p>
      )}

      {message && <p className="success">{message}</p>}
      {error && <div className="error">{error}</div>}

      <div className="email-actions">
        {!user.emailVerified && !isDemo && (
          <button type="button" onClick={resend} disabled={busy}>
            {busy ? 'Invio…' : 'Reinvia link di verifica'}
          </button>
        )}
        {!editing && (
          <button
            type="button"
            className="link-button email-inline-link"
            onClick={() => {
              setEditing(true);
              setError(null);
              setMessage(null);
            }}
          >
            Modifica email
          </button>
        )}
      </div>

      {editing && (
        <form className="email-change-form" onSubmit={submitChange}>
          <label htmlFor="new-email">Nuovo indirizzo email</label>
          <input
            id="new-email"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="nuovo@indirizzo.it"
            required
          />
          <div className="email-actions">
            <button type="submit" disabled={busy}>
              {busy ? 'Invio…' : 'Invia link di verifica'}
            </button>
            <button
              type="button"
              className="link-button email-inline-link"
              onClick={() => {
                setEditing(false);
                setNewEmail('');
              }}
            >
              Annulla
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
