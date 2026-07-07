import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { EMPLOYEE_CATEGORY_LABELS } from '../../constants/employeeCategories';

// mode 'claim' (dipendente: può accettare, lista già filtrata dal backend per ruolo/disponibilità)
// | 'manage' (responsabile/dirigente: vede tutte le sostituzioni pendenti, può solo eliminare)
export default function SubstitutionsPanel({ mode }) {
  const { token } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  function load() {
    api
      .listAvailableShifts(token)
      .then(({ shifts }) => setShifts(shifts))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  async function handleClaim(shift) {
    setError('');
    setNotice('');
    setBusyId(shift.id);
    try {
      await api.claimShift(shift.id, token);
      setNotice(`Sostituzione del ${shift.date} accettata con successo.`);
      load();
    } catch (err) {
      setError(err.message);
      load(); // qualcun altro potrebbe averla già accettata, o non è più compatibile
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(shift) {
    if (!window.confirm('Eliminare questa sostituzione?')) return;
    setError('');
    setBusyId(shift.id);
    try {
      await api.deleteShift(shift.id, token);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card">
      <h2>Sostituzioni disponibili {mode === 'manage' ? '(non ancora accettate)' : ''}</h2>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {shifts.length === 0 ? (
        <p className="hint">Nessuna sostituzione disponibile al momento.</p>
      ) : (
        <ul className="shift-list">
          {shifts.map((shift) => (
            <li key={shift.id} className="shift-list-item">
              <span>
                {shift.date} · {shift.startTime}-{shift.endTime}
                {shift.requiredCategory && (
                  <span className="badge">{EMPLOYEE_CATEGORY_LABELS[shift.requiredCategory]}</span>
                )}
                {shift.note ? ` · ${shift.note}` : ''}
                {shift.originUsername && (
                  <span className="hint"> · sostituisce il turno di {shift.originUsername}</span>
                )}
                {mode === 'manage' && (
                  <span className="hint"> · creata da {shift.createdByUsername}</span>
                )}
              </span>
              {mode === 'claim' ? (
                <button disabled={busyId === shift.id} onClick={() => handleClaim(shift)}>
                  {busyId === shift.id ? 'Attendere...' : 'Accetta'}
                </button>
              ) : (
                <button
                  className="button-danger"
                  disabled={busyId === shift.id}
                  onClick={() => handleDelete(shift)}
                >
                  Elimina
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
