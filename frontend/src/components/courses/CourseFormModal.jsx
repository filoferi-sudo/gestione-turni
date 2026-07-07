import { useState } from 'react';

// course: corso esistente da modificare (null per la creazione)
// instructors: elenco utenti categoria "istruttore" tra cui scegliere
// defaultDate: data preselezionata quando si crea un nuovo corso
export default function CourseFormModal({ course, instructors, defaultDate, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    name: course?.name || '',
    date: course?.date || defaultDate || '',
    startTime: course?.startTime || '09:00',
    endTime: course?.endTime || '10:00',
    instructorId: course?.instructorId || (instructors[0]?.id ?? ''),
    note: course?.note || '',
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
      setError('Il nome del corso è obbligatorio');
      return;
    }
    if (!form.date) {
      setError('Seleziona la data del corso');
      return;
    }
    if (!form.instructorId) {
      setError('Seleziona un istruttore');
      return;
    }
    if (form.startTime >= form.endTime) {
      setError("L'orario di fine deve essere successivo a quello di inizio");
      return;
    }

    setSubmitting(true);
    try {
      await onSave({
        name: form.name.trim(),
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        instructorId: Number(form.instructorId),
        note: form.note || null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{course ? 'Modifica corso' : 'Nuovo corso'}</h2>

        <label htmlFor="course-name">Nome del corso</label>
        <input id="course-name" value={form.name} onChange={(e) => update('name', e.target.value)} required />

        <label htmlFor="course-instructor">Istruttore</label>
        <select
          id="course-instructor"
          value={form.instructorId}
          onChange={(e) => update('instructorId', e.target.value)}
          required
        >
          <option value="">Seleziona...</option>
          {instructors.map((i) => (
            <option key={i.id} value={i.id}>
              {i.username}
            </option>
          ))}
        </select>
        {instructors.length === 0 && (
          <p className="hint">Nessun istruttore disponibile: creane uno dalla gestione dipendenti.</p>
        )}

        <label htmlFor="course-date">Data</label>
        <input id="course-date" type="date" value={form.date} onChange={(e) => update('date', e.target.value)} required />

        <div className="time-row">
          <div>
            <label htmlFor="course-start">Inizio</label>
            <input
              id="course-start"
              type="time"
              min="07:30"
              max="23:00"
              value={form.startTime}
              onChange={(e) => update('startTime', e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="course-end">Fine</label>
            <input
              id="course-end"
              type="time"
              min="07:30"
              max="23:00"
              value={form.endTime}
              onChange={(e) => update('endTime', e.target.value)}
              required
            />
          </div>
        </div>

        <label htmlFor="course-note">Nota (opzionale)</label>
        <textarea id="course-note" value={form.note} onChange={(e) => update('note', e.target.value)} rows={2} />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          {course && (
            <button type="button" className="button-danger" onClick={() => onDelete(course)}>
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
