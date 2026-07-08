import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Regole di escalation delle sostituzioni, configurabili SOLO dal Dirigente (regola aziendale
// interna). Per ora: ore di attesa prima di segnalare ai responsabili una Sostituzione ancora
// scoperta. Campo vuoto o 0 = escalation disattivata. La struttura è pensata per crescere (altre
// regole: comportamento, livelli successivi) senza cambiare l'impianto.
export default function SubstitutionSettingsCard() {
  const { token } = useAuth();
  const [hours, setHours] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getCompanySettings(token)
      .then(({ settings }) => {
        if (!active) return;
        setHours(settings.substitutionEscalationHours == null ? '' : String(settings.substitutionEscalationHours));
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  async function handleSave() {
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const { settings } = await api.saveCompanySettings(
        { substitutionEscalationHours: hours === '' ? null : Number(hours) },
        token
      );
      setHours(settings.substitutionEscalationHours == null ? '' : String(settings.substitutionEscalationHours));
      setNotice(
        settings.substitutionEscalationHours == null
          ? 'Escalation disattivata.'
          : `Escalation impostata a ${settings.substitutionEscalationHours}h.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <h2>Impostazioni sostituzioni</h2>
      <p className="hint">
        Dopo quante ore una Sostituzione ancora scoperta viene segnalata ai responsabili (escalation).
        Lascia vuoto (o 0) per disattivarla. La segnalazione avviene quando un responsabile è attivo e
        non riassegna nulla in automatico: la decisione resta sempre al responsabile.
      </p>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {loading ? (
        <p className="hint">Caricamento...</p>
      ) : (
        <div className="settings-row">
          <label>
            <span>Ore prima dell'escalation</span>
            <input
              type="number"
              min="0"
              step="1"
              value={hours}
              placeholder="disattivata"
              onChange={(e) => setHours(e.target.value)}
            />
          </label>
          <button type="button" onClick={handleSave} disabled={saving}>
            {saving ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      )}
    </section>
  );
}
