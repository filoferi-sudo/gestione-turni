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

function emptyCounts() {
  return Object.fromEntries(WEEKDAYS.map((d) => [d.code, 0]));
}

// Editor di UNA fascia fissa settimanale indipendente di un'area (un orario condiviso dai giorni
// selezionati, un conteggio persone per giorno, 0 = nessun fabbisogno quel giorno). Un'area può
// avere più fasce fisse parallele (es. mattina/sera): questo editor ne gestisce sempre e solo una
// alla volta, aperto dalla lista in StaffingWeeklySlotsModal. `slot` (opzionale) è la fascia
// esistente da modificare — la sua identità originale (orario) viaggia nel payload come
// `originalStartTime`/`originalEndTime` così il backend sa quali righe sostituire senza toccare
// le altre fasce dell'area (vedi staffingController.upsertWeeklySchedule). Assente per una nuova
// fascia: nessuna riga esistente viene chiusa/sostituita.
export default function StaffingScheduleModal({ areaId, slot, onClose, onSaved }) {
  const { token } = useAuth();
  const [startTime, setStartTime] = useState(slot?.startTime || '08:00');
  const [endTime, setEndTime] = useState(slot?.endTime || '14:00');
  const [effectiveFrom, setEffectiveFrom] = useState(slot?.effectiveFrom || todayISO());
  const [note, setNote] = useState(slot?.note || '');
  const [counts, setCounts] = useState(() => (slot ? { ...emptyCounts(), ...slot.counts } : emptyCounts()));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function updateCount(code, value) {
    setCounts((c) => ({ ...c, [code]: Math.max(0, Number(value) || 0) }));
  }

  async function trySave(confirmDuplicate, overrideCounts) {
    try {
      await api.upsertWeeklyStaffing(
        {
          areaId,
          startTime,
          endTime,
          counts: overrideCounts || counts,
          effectiveFrom,
          note: note || null,
          confirmDuplicate,
          originalStartTime: slot?.startTime,
          originalEndTime: slot?.endTime,
        },
        token
      );
      onSaved();
    } catch (err) {
      if (err.conflict && !confirmDuplicate) {
        if (window.confirm(`${err.message}\n\nVuoi procedere comunque?`)) {
          await trySave(true, overrideCounts);
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

  async function handleDelete() {
    if (!window.confirm('Eliminare questa fascia fissa? Da oggi in poi non sarà più richiesta.')) return;
    setSubmitting(true);
    try {
      await trySave(true, emptyCounts());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{slot ? 'Modifica fascia fissa' : 'Nuova fascia fissa'}</h2>
        <p className="hint">
          Un orario condiviso dai giorni selezionati; imposta 0 per i giorni senza fabbisogno in questa fascia.
          Quest'area può avere più fasce fisse indipendenti (es. mattina e sera): questa modifica riguarda solo
          questa fascia, le altre restano invariate.
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
          {slot && (
            <button type="button" className="button-danger" onClick={handleDelete} disabled={submitting}>
              Elimina fascia
            </button>
          )}
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
