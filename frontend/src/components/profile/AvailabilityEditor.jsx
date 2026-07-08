import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Convenzione giorni MON..SUN condivisa con backend/staffing; esportata per la vista di sola
// lettura del responsabile (AvailabilityModal), così l'etichetta è unica.
export const WEEKDAYS = [
  { code: 'MON', label: 'Lunedì' },
  { code: 'TUE', label: 'Martedì' },
  { code: 'WED', label: 'Mercoledì' },
  { code: 'THU', label: 'Giovedì' },
  { code: 'FRI', label: 'Venerdì' },
  { code: 'SAT', label: 'Sabato' },
  { code: 'SUN', label: 'Domenica' },
];

// Editor delle proprie disponibilità dichiarate (ricorrenti per giorno della settimana). Ogni riga
// è una fascia (giorno + inizio + fine); si possono avere più fasce, anche lo stesso giorno.
// Nessuna disponibilità dichiarata = disponibilità "ignota" (non blocca l'assegnazione dei turni,
// ma il responsabile non potrà contare su una tua fascia esplicita in fase di sostituzione).
export default function AvailabilityEditor() {
  const { user, token } = useAuth();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function load() {
    setLoading(true);
    api
      .getUserAvailability(user.id, token)
      .then(({ availability }) => setSlots(availability))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [user.id, token]);

  function addSlot() {
    setNotice('');
    setSlots((s) => [...s, { weekday: 'MON', startTime: '08:00', endTime: '14:00' }]);
  }

  function updateSlot(index, field, value) {
    setNotice('');
    setSlots((s) => s.map((slot, i) => (i === index ? { ...slot, [field]: value } : slot)));
  }

  function removeSlot(index) {
    setNotice('');
    setSlots((s) => s.filter((_, i) => i !== index));
  }

  async function handleSave() {
    setError('');
    setNotice('');
    for (const slot of slots) {
      if (slot.startTime >= slot.endTime) {
        setError("Ogni fascia deve avere l'orario di fine successivo a quello di inizio");
        return;
      }
    }
    setSubmitting(true);
    try {
      const { availability } = await api.saveUserAvailability(
        user.id,
        slots.map((s) => ({ weekday: s.weekday, startTime: s.startTime, endTime: s.endTime })),
        token
      );
      setSlots(availability);
      setNotice('Disponibilità salvate.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="card">
      <div className="section-header">
        <h2>Le mie disponibilità</h2>
        <button className="button-link" onClick={addSlot} type="button">
          + Aggiungi disponibilità
        </button>
      </div>

      <p className="hint">
        Dichiara le fasce orarie in cui sei disponibile, per giorno della settimana. Aiutano il
        responsabile a proporti le sostituzioni più adatte. Se non dichiari nulla, la tua
        disponibilità resta "da verificare" (non ti esclude dai turni).
      </p>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {loading ? (
        <p className="hint">Caricamento...</p>
      ) : slots.length === 0 ? (
        <p className="hint">Nessuna disponibilità dichiarata.</p>
      ) : (
        <div className="availability-list">
          {slots.map((slot, index) => (
            <div key={index} className="availability-row">
              <select value={slot.weekday} onChange={(e) => updateSlot(index, 'weekday', e.target.value)}>
                {WEEKDAYS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={slot.startTime}
                onChange={(e) => updateSlot(index, 'startTime', e.target.value)}
                aria-label="Ora inizio"
              />
              <span className="availability-sep">→</span>
              <input
                type="time"
                value={slot.endTime}
                onChange={(e) => updateSlot(index, 'endTime', e.target.value)}
                aria-label="Ora fine"
              />
              <button
                type="button"
                className="table-action table-action-danger"
                onClick={() => removeSlot(index)}
              >
                Rimuovi
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="modal-actions">
        <button type="button" onClick={handleSave} disabled={submitting || loading}>
          {submitting ? 'Salvataggio...' : 'Salva disponibilità'}
        </button>
      </div>
    </section>
  );
}
