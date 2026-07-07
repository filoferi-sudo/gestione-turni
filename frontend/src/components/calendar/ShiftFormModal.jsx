import { useEffect, useState } from 'react';

const WEEK_DAY_OPTIONS = [
  { code: 'MON', label: 'Lun' },
  { code: 'TUE', label: 'Mar' },
  { code: 'WED', label: 'Mer' },
  { code: 'THU', label: 'Gio' },
  { code: 'FRI', label: 'Ven' },
  { code: 'SAT', label: 'Sab' },
  { code: 'SUN', label: 'Dom' },
];

function parseInitialShift(shift) {
  if (!shift) {
    return {
      userId: '',
      type: 'mobile',
      startTime: '09:00',
      endTime: '13:00',
      note: '',
      date: '',
      daily: false,
      weekDays: [],
    };
  }

  const isDaily = shift.recurrenceRule === 'DAILY';
  const weekDays =
    shift.recurrenceRule && shift.recurrenceRule.startsWith('WEEKLY:')
      ? shift.recurrenceRule.slice('WEEKLY:'.length).split(',')
      : [];

  return {
    userId: shift.userId || '',
    type: shift.type,
    startTime: shift.startTime,
    endTime: shift.endTime,
    note: shift.note || '',
    date: shift.type !== 'fixed' ? shift.date : '',
    daily: isDaily,
    weekDays,
  };
}

// shift: turno esistente da modificare (null per la creazione)
// users: dipendenti assegnati all'area di questo calendario (già filtrati dal chiamante)
// defaultDate: data preselezionata quando si crea un nuovo turno singolo
export default function ShiftFormModal({ shift, users, defaultUserId, defaultDate, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(parseInitialShift(shift));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!shift) {
      setForm((f) => ({ ...f, userId: defaultUserId || '', date: defaultDate || '' }));
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

    if (form.type !== 'volante' && !form.userId) {
      setError('Seleziona un dipendente');
      return;
    }
    if (form.startTime >= form.endTime) {
      setError("L'orario di fine deve essere successivo a quello di inizio");
      return;
    }

    const payload = {
      userId: form.type === 'volante' ? null : Number(form.userId),
      type: form.type,
      startTime: form.startTime,
      endTime: form.endTime,
      note: form.note || null,
    };

    if (form.type === 'mobile' || form.type === 'volante') {
      if (!form.date) {
        setError('Seleziona la data del turno');
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
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{shift ? 'Modifica turno' : 'Nuovo turno'}</h2>

        <label>Tipo di turno</label>
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
            Sostituzione
          </button>
        </div>

        {form.type === 'volante' ? (
          <p className="hint">
            La sostituzione non viene assegnata a nessun dipendente: comparirà solo ai dipendenti di quest'area che
            non hanno già un turno in quell'orario, e sarà del primo che la accetta.
          </p>
        ) : (
          <>
            <label htmlFor="shift-user">Dipendente</label>
            <select id="shift-user" value={form.userId} onChange={(e) => update('userId', e.target.value)} required>
              <option value="">Seleziona...</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
            {users.length === 0 && (
              <p className="hint">Nessun dipendente assegnato a quest'area: aggiungine uno dalla gestione dipendenti.</p>
            )}
          </>
        )}

        {form.type === 'mobile' || form.type === 'volante' ? (
          <>
            <label htmlFor="shift-date">Data</label>
            <input id="shift-date" type="date" value={form.date} onChange={(e) => update('date', e.target.value)} required />
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
            <label htmlFor="shift-start">Inizio</label>
            <input
              id="shift-start"
              type="time"
              value={form.startTime}
              onChange={(e) => update('startTime', e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="shift-end">Fine</label>
            <input
              id="shift-end"
              type="time"
              value={form.endTime}
              onChange={(e) => update('endTime', e.target.value)}
              required
            />
          </div>
        </div>

        <label htmlFor="shift-note">Nota (opzionale)</label>
        <textarea id="shift-note" value={form.note} onChange={(e) => update('note', e.target.value)} rows={2} />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          {shift && (
            <button type="button" className="button-danger" onClick={() => onDelete(shift)}>
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
