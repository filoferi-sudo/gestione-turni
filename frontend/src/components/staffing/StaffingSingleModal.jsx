import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// requirement: fabbisogno singolo esistente da modificare (null per la creazione)
export default function StaffingSingleModal({ areaId, requirement, onClose, onSaved, onDeleted }) {
  const { token } = useAuth();
  const [date, setDate] = useState(requirement?.date || '');
  const [startTime, setStartTime] = useState(requirement?.startTime || '08:00');
  const [endTime, setEndTime] = useState(requirement?.endTime || '14:00');
  const [requiredCount, setRequiredCount] = useState(requirement ? requirement.requiredCount : 1);
  const [note, setNote] = useState(requirement?.note || '');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function trySave(confirmDuplicate) {
    const payload = {
      areaId,
      date,
      startTime,
      endTime,
      requiredCount: Number(requiredCount),
      note: note || null,
      confirmDuplicate,
    };
    try {
      if (requirement) {
        await api.updateSingleStaffingRequirement(requirement.id, payload, token);
      } else {
        await api.createSingleStaffingRequirement(payload, token);
      }
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
    if (!date) {
      setError('Seleziona la data');
      return;
    }
    if (startTime >= endTime) {
      setError("L'orario di fine deve essere successivo a quello di inizio");
      return;
    }
    if (!Number.isInteger(Number(requiredCount)) || Number(requiredCount) < 0) {
      setError('Il numero di persone necessarie non è valido');
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
    if (!window.confirm('Eliminare questo fabbisogno singolo?')) return;
    setSubmitting(true);
    try {
      await api.deleteSingleStaffingRequirement(requirement.id, token);
      onDeleted();
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{requirement ? 'Modifica fabbisogno singolo' : 'Nuovo fabbisogno singolo'}</h2>
        <p className="hint">Esigenza straordinaria per una sola data: non modifica la programmazione settimanale.</p>

        <label htmlFor="staffing-date">Data</label>
        <input id="staffing-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />

        <div className="time-row">
          <div>
            <label htmlFor="staffing-start">Inizio</label>
            <input id="staffing-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="staffing-end">Fine</label>
            <input id="staffing-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} required />
          </div>
        </div>

        <label htmlFor="staffing-count">Persone necessarie</label>
        <input
          id="staffing-count"
          type="number"
          min="0"
          value={requiredCount}
          onChange={(e) => setRequiredCount(e.target.value)}
          required
        />

        <label htmlFor="staffing-note">Nota (opzionale)</label>
        <textarea id="staffing-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          {requirement && (
            <button type="button" className="button-danger" onClick={handleDelete} disabled={submitting}>
              Elimina
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
