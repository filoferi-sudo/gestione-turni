import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const WEEKDAYS = [
  { code: 'MON', label: 'Lun' },
  { code: 'TUE', label: 'Mar' },
  { code: 'WED', label: 'Mer' },
  { code: 'THU', label: 'Gio' },
  { code: 'FRI', label: 'Ven' },
  { code: 'SAT', label: 'Sab' },
  { code: 'SUN', label: 'Dom' },
];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Editor della programmazione settimanale fissa di un'area: un solo orario condiviso da tutti i
// giorni, un conteggio persone per giorno (0 = nessun fabbisogno quel giorno). Sostituisce sempre
// l'intera programmazione precedente dell'area da effectiveFrom in poi (vedi
// staffingController.upsertWeeklySchedule): non esistono più pattern settimanali paralleli.
export default function StaffingScheduleModal({ areaId, onClose, onSaved }) {
  const { token } = useAuth();
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('14:00');
  const [effectiveFrom, setEffectiveFrom] = useState(todayISO());
  const [note, setNote] = useState('');
  const [counts, setCounts] = useState(() => Object.fromEntries(WEEKDAYS.map((d) => [d.code, 0])));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateCount(code, value) {
    setCounts((c) => ({ ...c, [code]: Math.max(0, Number(value) || 0) }));
  }

  async function trySave(confirmDuplicate) {
    try {
      await api.upsertWeeklyStaffing(
        { areaId, startTime, endTime, counts, effectiveFrom, note: note || null, confirmDuplicate },
        token
      );
      onSaved();
    } catch (err) {
      if (err.conflict && !confirmDuplicate) {
        if (window.confirm(`${err.message}\n\nVuoi procedere comunque?`)) {
          await trySave(true);
          return;
        }
        return;
      }
      setError(err.message);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (startTime >= endTime) {
      setError("L'orario di fine deve essere successivo a quello di inizio");
      return;
    }
    if (!effectiveFrom) {
      setError('La data di decorrenza è obbligatoria');
      return;
    }
    setSubmitting(true);
    try {
      await trySave(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Fabbisogno settimanale</h2>
        <p className="hint">
          Un solo orario condiviso da tutti i giorni; imposta 0 per i giorni senza fabbisogno. La nuova programmazione
          sostituisce quella attuale a partire dalla data di decorrenza.
        </p>

        <div className="time-row">
          <div>
            <label htmlFor="schedule-start">Inizio</label>
            <input id="schedule-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="schedule-end">Fine</label>
            <input id="schedule-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </div>
        </div>

        <label htmlFor="schedule-from">Decorrenza</label>
        <input
          id="schedule-from"
          type="date"
          value={effectiveFrom}
          onChange={(e) => setEffectiveFrom(e.target.value)}
          required
        />

        <label>Persone necessarie per giorno</label>
        <div className="checkbox-grid">
          {WEEKDAYS.map((d) => (
            <div key={d.code} className="weekday-count">
              <label htmlFor={`count-${d.code}`}>{d.label}</label>
              <input
                id={`count-${d.code}`}
                type="number"
                min="0"
                value={counts[d.code]}
                onChange={(e) => updateCount(d.code, e.target.value)}
              />
            </div>
          ))}
        </div>

        <label htmlFor="schedule-note">Nota (opzionale)</label>
        <textarea id="schedule-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </form>
    </div>
  );
}
