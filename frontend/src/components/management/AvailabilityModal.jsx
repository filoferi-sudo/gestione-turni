import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { WEEKDAYS } from '../profile/AvailabilityEditor';
import { formatOptOutPeriod } from '../profile/OptOutEditor';

// Vista di SOLA LETTURA delle disponibilità dichiarate di un dipendente + dei periodi di opt-out
// "Non partecipare" (Fase 6), per il responsabile/dirigente. Il manager non le modifica (le dichiara
// il dipendente stesso dal proprio profilo): qui servono solo per valutare le sostituzioni.
export default function AvailabilityModal({ targetUser, onClose }) {
  const { token } = useAuth();
  const [slots, setSlots] = useState([]);
  const [optOuts, setOptOuts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    Promise.all([api.getUserAvailability(targetUser.id, token), api.getUserOptOuts(targetUser.id, token)])
      .then(([av, oo]) => {
        if (!active) return;
        setSlots(av.availability);
        setOptOuts(oo.optOuts);
      })
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

        {!loading && (
          <>
            <h3 className="optout-heading">Periodi "non partecipa"</h3>
            {optOuts.length === 0 ? (
              <p className="hint">Nessun periodo dichiarato.</p>
            ) : (
              <ul className="optout-list">
                {optOuts.map((o) => (
                  <li key={o.id} className="optout-item">
                    <span>
                      {formatOptOutPeriod(o)}
                      {o.note ? ` · ${o.note}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
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
