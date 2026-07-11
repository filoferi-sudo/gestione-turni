import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Modal from '../common/Modal';

const CALENDAR_MODE_LABELS = { shifts: 'Turni', courses: 'Corsi' };

// Aree operative della sede selezionata: il Dirigente le crea liberamente (Bagnini, Reception,
// Bar, Manutenzione, ...), sceglie il motore di calendario alla creazione (Turni o Corsi), le
// riordina, disattiva o elimina. Ogni area genera automaticamente il proprio calendario: non
// c'è altro da configurare perché appaia nelle dashboard. onChange: notifica il componente
// padre dopo ogni modifica, così può risincronizzare la propria lista aree (usata per le tab
// calendario), che altrimenti resterebbe una copia indipendente e non aggiornata.
export default function AreasManagement({ sedeId, onChange }) {
  const { token } = useAuth();
  const [areas, setAreas] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalState, setModalState] = useState(null); // { area } | null (area null = creazione)

  function load() {
    if (!sedeId) return;
    api
      .listAreas(sedeId, token)
      .then(({ areas }) => setAreas(areas))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [sedeId, token]);

  function notifyChange() {
    onChange?.();
  }

  async function handleSave(payload) {
    if (modalState.area) {
      await api.updateArea(modalState.area.id, payload, token);
    } else {
      await api.createArea(sedeId, payload, token);
    }
    setModalState(null);
    load();
    notifyChange();
  }

  async function handleToggleActive(area) {
    setError('');
    setNotice('');
    try {
      await api.updateArea(area.id, { isActive: !area.isActive }, token);
      setNotice(`"${area.name}" ${area.isActive ? 'disattivata' : 'riattivata'}.`);
      load();
      notifyChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(area) {
    if (!window.confirm(`Eliminare l'area "${area.name}"? Possibile solo se non ha turni, corsi o dipendenti assegnati.`))
      return;
    setError('');
    try {
      await api.deleteArea(area.id, token);
      load();
      notifyChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function moveArea(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= areas.length) return;
    const reordered = [...areas];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setError('');
    try {
      const { areas: updated } = await api.reorderAreas(sedeId, reordered.map((a) => a.id), token);
      setAreas(updated);
      notifyChange();
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  if (!sedeId) {
    return (
      <section className="card">
        <h2>Aree operative</h2>
        <p className="hint">Seleziona o crea prima una sede.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <div className="section-header">
        <h2>Aree operative</h2>
        <button className="button-link" onClick={() => setModalState({ area: null })}>
          + Nuova area
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {areas.length === 0 ? (
        <p className="hint">Nessuna area operativa in questa sede: creane una per iniziare a programmare turni o corsi.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Ordine</th>
              <th>Nome</th>
              <th>Tipo calendario</th>
              <th>Stato</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((a, index) => (
              <tr key={a.id}>
                <td className="actions-cell">
                  <button className="table-action" disabled={index === 0} onClick={() => moveArea(index, -1)}>
                    ↑
                  </button>
                  <button className="table-action" disabled={index === areas.length - 1} onClick={() => moveArea(index, 1)}>
                    ↓
                  </button>
                </td>
                <td>{a.name}</td>
                <td>{CALENDAR_MODE_LABELS[a.calendarMode]}</td>
                <td>
                  <span className={`request-status ${a.isActive ? 'request-status-approved' : 'request-status-rejected'}`}>
                    {a.isActive ? 'Attiva' : 'Disattivata'}
                  </span>
                </td>
                <td className="actions-cell">
                  <button className="table-action" onClick={() => setModalState({ area: a })}>
                    Modifica
                  </button>
                  <button
                    className={`table-action ${a.isActive ? 'table-action-danger' : ''}`}
                    onClick={() => handleToggleActive(a)}
                  >
                    {a.isActive ? 'Disattiva' : 'Riattiva'}
                  </button>
                  <button className="table-action table-action-danger" onClick={() => handleDelete(a)}>
                    Elimina
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {modalState && (
        <AreaFormModal area={modalState.area} onSave={handleSave} onClose={() => setModalState(null)} />
      )}
    </section>
  );
}

function AreaFormModal({ area, onSave, onClose }) {
  const [form, setForm] = useState({
    name: area?.name || '',
    calendarMode: area?.calendarMode || 'shifts',
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
      setError("Il nome dell'area è obbligatorio");
      return;
    }
    setSubmitting(true);
    try {
      await onSave({ name: form.name.trim(), calendarMode: form.calendarMode });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{area ? 'Modifica area operativa' : 'Nuova area operativa'}</h2>

        <label htmlFor="area-name">Nome</label>
        <input
          id="area-name"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="es. Bagnini, Reception, Bar, Manutenzione..."
          required
        />

        <label>Tipo di calendario</label>
        <div className="segmented">
          <button
            type="button"
            className={form.calendarMode === 'shifts' ? 'active' : ''}
            onClick={() => update('calendarMode', 'shifts')}
          >
            Turni
          </button>
          <button
            type="button"
            className={form.calendarMode === 'courses' ? 'active' : ''}
            onClick={() => update('calendarMode', 'courses')}
          >
            Corsi
          </button>
        </div>
        <p className="hint">
          {form.calendarMode === 'shifts'
            ? 'Turni di lavoro dei dipendenti (fisso/singolo/Sostituzione): la scelta giusta per la maggior parte delle aree.'
            : 'Lezioni con un nome (es. "Corso Nuoto Bambini"), possono sovrapporsi nello stesso orario: usalo per aree come Istruttori.'}
        </p>
        {area && (
          <p className="hint">
            Il tipo di calendario si può cambiare solo finché l'area non ha ancora turni o corsi.
          </p>
        )}

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
