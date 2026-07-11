import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Modal from '../common/Modal';

// Le 4 modalità richieste per modificare una singola occorrenza di un fabbisogno fisso, senza
// alterare la regola generale se non esplicitamente richiesto (vedi
// staffingController.editOccurrence): edit_only/delete_only scrivono un'eccezione puntuale,
// edit_future/delete_future "spezzano" la regola da questa data in poi.
const ACTIONS = [
  { code: 'edit_only', label: 'Modifica solo questa occorrenza', needsCount: true },
  { code: 'edit_future', label: 'Modifica questa occorrenza e tutte le future', needsCount: true },
  { code: 'delete_only', label: 'Elimina solo questa occorrenza', needsCount: false },
  { code: 'delete_future', label: 'Elimina questa occorrenza e tutte le future', needsCount: false },
];

// requirement: regola fissa a cui appartiene l'occorrenza. occurrence: { date, startTime,
// endTime, requiredCount } così come restituita da staffing/coverage.
export default function StaffingOccurrenceModal({ requirement, occurrence, onClose, onSaved }) {
  const { token } = useAuth();
  const [action, setAction] = useState('edit_only');
  const [requiredCount, setRequiredCount] = useState(occurrence.requiredCount);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const needsCount = ACTIONS.find((a) => a.code === action)?.needsCount;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (needsCount && (!Number.isInteger(Number(requiredCount)) || Number(requiredCount) < 0)) {
      setError('Il numero di persone necessarie non è valido');
      return;
    }
    setSubmitting(true);
    try {
      await api.editStaffingOccurrence(
        requirement.id,
        { date: occurrence.date, action, requiredCount: needsCount ? Number(requiredCount) : undefined },
        token
      );
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Modifica occorrenza del {occurrence.date}</h2>
        <p className="hint">
          Fabbisogno fisso ricorrente ({occurrence.startTime}-{occurrence.endTime}, attualmente {occurrence.requiredCount}{' '}
          persone). Scegli come applicare la modifica:
        </p>

        <div className="staffing-actions">
          {ACTIONS.map((a) => (
            <label key={a.code} className="checkbox-label">
              <input type="radio" name="occurrence-action" checked={action === a.code} onChange={() => setAction(a.code)} />
              {a.label}
            </label>
          ))}
        </div>

        {needsCount && (
          <>
            <label htmlFor="occurrence-count">Persone necessarie</label>
            <input
              id="occurrence-count"
              type="number"
              min="0"
              value={requiredCount}
              onChange={(e) => setRequiredCount(e.target.value)}
              required
            />
          </>
        )}

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Salvataggio...' : 'Conferma'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
