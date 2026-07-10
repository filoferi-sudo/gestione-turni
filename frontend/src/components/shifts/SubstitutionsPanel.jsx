import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { usePolling } from '../../hooks/usePolling';
import FindReplacementModal from './FindReplacementModal';

// mode 'claim' (dipendente: può accettare, lista già filtrata dal backend per area/disponibilità)
// | 'manage' (responsabile/dirigente: vede tutte le sostituzioni pendenti di quest'area, può
// solo eliminare). areaId: area operativa di questo calendario (obbligatoria). areaName:
// opzionale, mostrato nel titolo quando un dipendente ha più aree "Turni" assegnate.
export default function SubstitutionsPanel({ mode, areaId, areaName }) {
  const { token } = useAuth();
  const [shifts, setShifts] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [candidatesShift, setCandidatesShift] = useState(null); // Sostituzione per cui cercare candidati

  function load() {
    api
      .listAvailableShifts(token, areaId)
      .then(({ shifts }) => setShifts(shifts))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token, areaId]);

  // Aggiornamenti quasi in tempo reale: un'altra persona può accettare/eliminare una Sostituzione
  // in ogni momento. Sospeso mentre una claim/delete locale è in corso (busyId già esistente).
  usePolling(load, { intervalMs: 5000, enabled: !busyId });

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
    <section className="card" data-tour="substitutions-panel">
      <h2>
        Sostituzioni disponibili{areaName ? ` — ${areaName}` : ''} {mode === 'manage' ? '(non ancora accettate)' : ''}
      </h2>

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
                <span className="shift-item-actions">
                  <button data-tour="find-replacement" className="table-action" onClick={() => setCandidatesShift(shift)}>
                    Trova sostituzione
                  </button>
                  <button
                    className="button-danger"
                    disabled={busyId === shift.id}
                    onClick={() => handleDelete(shift)}
                  >
                    Elimina
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {candidatesShift && (
        <FindReplacementModal shift={candidatesShift} onClose={() => setCandidatesShift(null)} />
      )}
    </section>
  );
}
