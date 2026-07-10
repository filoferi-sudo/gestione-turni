import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

// Preferenze notifiche email (Fase E6). L'utente sceglie quali email di evento ricevere. Le notifiche
// in-app (campanella) restano sempre attive; le email di verifica/reset non sono mai filtrate.
// Componente self-contained: caricabile in qualsiasi pagina Impostazioni (dipendente e responsabile).
export default function NotificationPreferences() {
  const { token, user } = useAuth();
  const [mode, setMode] = useState('all');
  const [disabled, setDisabled] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api
      .getNotificationPreferences(token)
      .then((data) => {
        setMode(data.preferences.emailMode);
        setDisabled(data.preferences.disabledCategories || []);
        setCatalog(data.catalog || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  function toggleCategory(key) {
    setDisabled((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const data = await api.saveNotificationPreferences({ emailMode: mode, disabledCategories: disabled }, token);
      setDisabled(data.preferences.disabledCategories || []);
      setMessage('Preferenze salvate.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return null;

  const MODES = [
    ['all', 'Tutte le email'],
    ['important', 'Solo le importanti'],
    ['none', 'Nessuna email'],
  ];

  return (
    <section className="card">
      <h2>Preferenze email</h2>
      <p className="hint">
        Scegli quali email ricevere. Le notifiche nell'app (campanella) restano sempre attive.
      </p>
      {user?.isDemo && <p className="hint">In modalità demo le email non vengono inviate realmente.</p>}

      <div className="pref-modes">
        {MODES.map(([value, label]) => (
          <label key={value} className="pref-mode">
            <input
              type="radio"
              name="email-mode"
              value={value}
              checked={mode === value}
              onChange={() => setMode(value)}
            />
            {label}
          </label>
        ))}
      </div>

      {mode === 'all' && (
        <div className="pref-cats">
          <p className="pref-cats-title">Ricevi email per:</p>
          {catalog.map((c) => (
            <label key={c.key} className="pref-cat">
              <input
                type="checkbox"
                checked={!disabled.includes(c.key)}
                onChange={() => toggleCategory(c.key)}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}

      {message && <p className="success">{message}</p>}
      {error && <div className="error">{error}</div>}

      <button onClick={save} disabled={saving}>
        {saving ? 'Salvataggio…' : 'Salva preferenze'}
      </button>
    </section>
  );
}
