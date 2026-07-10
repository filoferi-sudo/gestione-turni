import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

// Banner "verifica la tua email" (Fase E2): mostrato in cima all'area autenticata quando l'utente
// non ha ancora un indirizzo verificato. Nascosto nelle sessioni demo (gli invii sono soppressi,
// non avrebbe senso). Se è in corso un cambio email, invita a confermare il NUOVO indirizzo.
export default function EmailVerificationBanner() {
  const { user, token } = useAuth();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (!user || user.emailVerified || user.isDemo) return null;

  const target = user.pendingEmail || user.email;

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      await api.sendVerificationEmail(token);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="email-verify-banner">
      <span>
        {user.pendingEmail ? (
          <>Conferma il nuovo indirizzo <strong>{user.pendingEmail}</strong> per completare il cambio email.</>
        ) : (
          <>La tua email <strong>{user.email}</strong> non è ancora verificata.</>
        )}
      </span>
      {sent ? (
        <span className="email-verify-sent">Link inviato a {target} ✓</span>
      ) : (
        <button type="button" className="email-verify-action" onClick={resend} disabled={busy}>
          {busy ? 'Invio…' : 'Invia link di verifica'}
        </button>
      )}
      {error && <span className="email-verify-error">{error}</span>}
    </div>
  );
}
