import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { WEEKDAYS } from '../profile/AvailabilityEditor';

// Vista di SOLA LETTURA delle disponibilità dichiarate di un dipendente, per il responsabile/
// dirigente. Il manager non le modifica (le dichiara il dipendente stesso dal proprio profilo):
// qui servono solo per valutare le sostituzioni. Raggruppate per giorno della settimana.
export default function AvailabilityModal({ targetUser, onClose }) {
  const { token } = useAuth();
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .getUserAvailability(targetUser.id, token)
      .then(({ availability }) => active && setSlots(availability))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [targetUser.id, token]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Disponibilità di {targetUser.username}</h2>
        <p className="hint">
          Fasce dichiarate dal dipendente. Sono di sola lettura: solo il dipendente può modificarle
          dal proprio profilo.
        </p>

        {error && <div className="error">{error}</div>}

        {loading ? (
          <p className="hint">Caricamento...</p>
        ) : slots.length === 0 ? (
          <p className="hint">Nessuna disponibilità dichiarata (disponibilità da verificare).</p>
        ) : (
          <div className="availability-list">
            {WEEKDAYS.map((day) => {
              const daySlots = slots.filter((s) => s.weekday === day.code);
              if (daySlots.length === 0) return null;
              return (
                <div key={day.code} className="availability-view-row">
                  <strong>{day.label}</strong>
                  <span>{daySlots.map((s) => `${s.startTime} → ${s.endTime}`).join(', ')}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </div>
  );
}
