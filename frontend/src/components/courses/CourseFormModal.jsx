import { useEffect, useState } from 'react';
import Modal from '../common/Modal';

const WEEK_DAY_OPTIONS = [
  { code: 'MON', label: 'Lun' },
  { code: 'TUE', label: 'Mar' },
  { code: 'WED', label: 'Mer' },
  { code: 'THU', label: 'Gio' },
  { code: 'FRI', label: 'Ven' },
  { code: 'SAT', label: 'Sab' },
  { code: 'SUN', label: 'Dom' },
];

function parseInitialCourse(course) {
  if (!course) {
    return {
      name: '',
      instructorId: '',
      type: 'mobile',
      startTime: '09:00',
      endTime: '10:00',
      note: '',
      date: '',
      daily: false,
      weekDays: [],
    };
  }

  const isDaily = course.recurrenceRule === 'DAILY';
  const weekDays =
    course.recurrenceRule && course.recurrenceRule.startsWith('WEEKLY:')
      ? course.recurrenceRule.slice('WEEKLY:'.length).split(',')
      : [];

  return {
    name: course.name,
    instructorId: course.instructorId || '',
    type: course.type,
    startTime: course.startTime,
    endTime: course.endTime,
    note: course.note || '',
    date: course.type !== 'fixed' ? course.date : '',
    daily: isDaily,
    weekDays,
  };
}

// course: corso esistente da modificare (null per la creazione)
// instructors: elenco utenti categoria "istruttore" tra cui scegliere
// defaultDate: data preselezionata quando si crea un nuovo corso singolo
//
// Stessa logica/interazione di ShiftFormModal (turni): tipo fisso/singolo/disponibile con gli
// stessi campi condizionali, per un'esperienza identica tra gestione turni e gestione corsi.
export default function CourseFormModal({ course, instructors, defaultDate, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(parseInitialCourse(course));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!course) {
      setForm((f) => ({ ...f, date: defaultDate || '' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function toggleWeekDay(code) {
    setForm((f) => ({
      ...f,
      weekDays: f.weekDays.includes(code) ? f.weekDays.filter((d) => d !== code) : [...f.weekDays, code],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) {
      setError('Il nome del corso è obbligatorio');
      return;
    }
    if (form.type !== 'volante' && !form.instructorId) {
      setError('Seleziona un istruttore');
      return;
    }
    if (form.startTime >= form.endTime) {
      setError("L'orario di fine deve essere successivo a quello di inizio");
      return;
    }

    const payload = {
      name: form.name.trim(),
      instructorId: form.type === 'volante' ? null : Number(form.instructorId),
      type: form.type,
      startTime: form.startTime,
      endTime: form.endTime,
      note: form.note || null,
    };

    if (form.type === 'mobile' || form.type === 'volante') {
      if (!form.date) {
        setError('Seleziona la data del corso');
        return;
      }
      payload.date = form.date;
    } else {
      if (!form.daily && form.weekDays.length === 0) {
        setError('Seleziona almeno un giorno della settimana, oppure "Ogni giorno"');
        return;
      }
      payload.recurrenceRule = form.daily ? 'DAILY' : `WEEKLY:${form.weekDays.join(',')}`;
    }

    setSubmitting(true);
    try {
      await onSave(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{course ? 'Modifica corso' : 'Nuovo corso'}</h2>

        <label htmlFor="course-name">Nome del corso</label>
        <input id="course-name" value={form.name} onChange={(e) => update('name', e.target.value)} required />

        <label>Tipo di corso</label>
        <div className="segmented">
          <button
            type="button"
            className={form.type === 'mobile' ? 'active' : ''}
            onClick={() => update('type', 'mobile')}
          >
            Singolo
          </button>
          <button
            type="button"
            className={form.type === 'fixed' ? 'active' : ''}
            onClick={() => update('type', 'fixed')}
          >
            Fisso (ricorrente)
          </button>
          <button
            type="button"
            className={form.type === 'volante' ? 'active' : ''}
            onClick={() => update('type', 'volante')}
          >
            Disponibile
          </button>
        </div>

        {form.type === 'volante' ? (
          <p className="hint">
            Il corso disponibile non viene assegnato a nessun istruttore: comparirà tra i "corsi disponibili" e
            sarà del primo istruttore che lo accetta.
          </p>
        ) : (
          <>
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
          </>
        )}

        {form.type === 'mobile' || form.type === 'volante' ? (
          <>
            <label htmlFor="course-date">Data</label>
            <input
              id="course-date"
              type="date"
              value={form.date}
              onChange={(e) => update('date', e.target.value)}
              required
            />
          </>
        ) : (
          <>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.daily} onChange={(e) => update('daily', e.target.checked)} />
              Ogni giorno
            </label>
            {!form.daily && (
              <div className="weekday-picker">
                {WEEK_DAY_OPTIONS.map((d) => (
                  <button
                    type="button"
                    key={d.code}
                    className={form.weekDays.includes(d.code) ? 'active' : ''}
                    onClick={() => toggleWeekDay(d.code)}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <div className="time-row">
          <div>
            <label htmlFor="course-start">Inizio</label>
            <input
              id="course-start"
              type="time"
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
    </Modal>
  );
}
