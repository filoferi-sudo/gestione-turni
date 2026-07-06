import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// mode 'claim' (dipendente: può accettare) | 'manage' (responsabile/dirigente: può solo eliminare)
export default function VolanteShiftsPanel({ mode }) {
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
      setNotice(`Turno del ${shift.date} accettato con successo.`);
      load();
    } catch (err) {
      setError(err.message);
      load(); // qualcun altro potrebbe averlo già accettato
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(shift) {
    if (!window.confirm('Eliminare questo turno volante?')) return;
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
      <h2>Turni disponibili {mode === 'claim' ? '' : '(volanti non ancora accettati)'}</h2>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {shifts.length === 0 ? (
        <p className="hint">Nessun turno volante disponibile al momento.</p>
      ) : (
        <ul className="shift-list">
          {shifts.map((shift) => (
            <li key={shift.id} className="shift-list-item">
              <span>
                {shift.date} · {shift.startTime}-{shift.endTime}
                {shift.note ? ` · ${shift.note}` : ''}
                {mode === 'manage' && (
                  <span className="hint"> · creato da {shift.createdByUsername}</span>
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
