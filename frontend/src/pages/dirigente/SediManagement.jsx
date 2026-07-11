import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/common/Modal';

// Elenco sedi della società (la "vista complessiva"): crea/modifica/disattiva/elimina, e
// permette di scegliere rapidamente quale sede è "attiva" (quella di cui si vedono aree e
// calendari sotto, vedi useSedeSelection). Riservato al Dirigente (routing lato dashboard).
export default function SediManagement({ sedi, selectedSedeId, setSelectedSedeId, onReload }) {
  const { token } = useAuth();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalState, setModalState] = useState(null); // { sede } | null (sede null = creazione)

  async function handleSave(payload) {
    if (modalState.sede) {
      await api.updateSede(modalState.sede.id, payload, token);
    } else {
      const { sede } = await api.createSede(payload, token);
      setSelectedSedeId(sede.id);
    }
    setModalState(null);
    onReload();
  }

  async function handleToggleActive(sede) {
    setError('');
    setNotice('');
    try {
      await api.updateSede(sede.id, { isActive: !sede.isActive }, token);
      setNotice(`"${sede.name}" ${sede.isActive ? 'disattivata' : 'riattivata'}.`);
      onReload();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(sede) {
    if (!window.confirm(`Eliminare la sede "${sede.name}"? Possibile solo se non ha aree operative.`)) return;
    setError('');
    try {
      await api.deleteSede(sede.id, token);
      onReload();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <div className="section-header">
        <h2>Sedi</h2>
        <button className="button-link" onClick={() => setModalState({ sede: null })}>
          + Nuova sede
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Orari calendario</th>
            <th>Aree operative</th>
            <th>Stato</th>
            <th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {sedi.map((s) => (
            <tr key={s.id}>
              <td>
                {s.name}
                {s.id === selectedSedeId && <span className="badge">selezionata</span>}
              </td>
              <td>
                {s.calendarStartTime} - {s.calendarEndTime}
              </td>
              <td>{s.areasCount}</td>
              <td>
                <span className={`request-status ${s.isActive ? 'request-status-approved' : 'request-status-rejected'}`}>
                  {s.isActive ? 'Attiva' : 'Disattivata'}
                </span>
              </td>
              <td className="actions-cell">
                {s.id !== selectedSedeId && (
                  <button className="table-action" onClick={() => setSelectedSedeId(s.id)}>
                    Seleziona
                  </button>
                )}
                <button className="table-action" onClick={() => setModalState({ sede: s })}>
                  Modifica
                </button>
                <button
                  className={`table-action ${s.isActive ? 'table-action-danger' : ''}`}
                  onClick={() => handleToggleActive(s)}
                >
                  {s.isActive ? 'Disattiva' : 'Riattiva'}
                </button>
                <button className="table-action table-action-danger" onClick={() => handleDelete(s)}>
                  Elimina
                </button>
              </td>
            </tr>
          ))}
          {sedi.length === 0 && (
            <tr>
              <td colSpan={5} className="hint">
                Nessuna sede ancora creata.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {modalState && (
        <SedeFormModal sede={modalState.sede} onSave={handleSave} onClose={() => setModalState(null)} />
      )}
    </section>
  );
}

function SedeFormModal({ sede, onSave, onClose }) {
  const [form, setForm] = useState({
    name: sede?.name || '',
    calendarStartTime: sede?.calendarStartTime || '07:30',
    calendarEndTime: sede?.calendarEndTime || '23:00',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Il nome della sede è obbligatorio');
      return;
    }
    if (form.calendarStartTime >= form.calendarEndTime && form.calendarEndTime !== '00:00') {
      setError("L'ora di fine calendario deve essere successiva a quella di inizio");
      return;
    }
    setSubmitting(true);
    try {
      await onSave({
        name: form.name.trim(),
        calendarStartTime: form.calendarStartTime,
        calendarEndTime: form.calendarEndTime,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{sede ? 'Modifica sede' : 'Nuova sede'}</h2>

        <label htmlFor="sede-name">Nome</label>
        <input id="sede-name" value={form.name} onChange={(e) => update('name', e.target.value)} required />

        <p className="hint">
          Intervallo orario mostrato nel calendario di questa sede (es. 05:00 → 00:00 per coprire fino a
          mezzanotte).
        </p>
        <div className="time-row">
          <div>
            <label htmlFor="sede-start">Inizio calendario</label>
            <input
              id="sede-start"
              type="time"
              value={form.calendarStartTime}
              onChange={(e) => update('calendarStartTime', e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="sede-end">Fine calendario</label>
            <input
              id="sede-end"
              type="time"
              value={form.calendarEndTime}
              onChange={(e) => update('calendarEndTime', e.target.value)}
              required
            />
          </div>
        </div>

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
    </Modal>
  );
}
