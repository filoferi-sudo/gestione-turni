import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Formatta un periodo di opt-out per la lettura: "dal 01/08 al 20/08" oppure, se senza fine,
// "dal 01/08 (a tempo indeterminato)".
export function formatOptOutPeriod(o) {
  const from = o.startDate;
  return o.endDate ? `dal ${from} al ${o.endDate}` : `dal ${from} (a tempo indeterminato)`;
}

// Editor self-service dei propri periodi di opt-out "Non partecipare". Dichiarare un periodo evita
// di ricevere proposte e notifiche di sostituzione in quelle date; il responsabile lo vede e non ti
// propone. Resti comunque libero di accettare autonomamente una sostituzione se cambi idea.
export default function OptOutEditor() {
  const { user, token } = useAuth();
  const [optOuts, setOptOuts] = useState([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function load() {
    setLoading(true);
    api
      .getUserOptOuts(user.id, token)
      .then(({ optOuts }) => setOptOuts(optOuts))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [user.id, token]);

  async function handleAdd() {
    setError('');
    setNotice('');
    if (!startDate) {
      setError('Indica almeno la data di inizio.');
      return;
    }
    if (endDate && endDate < startDate) {
      setError('La data di fine deve essere successiva o uguale a quella di inizio.');
      return;
    }
    setSubmitting(true);
    try {
      const { optOuts } = await api.addUserOptOut(
        user.id,
        { startDate, endDate: endDate || null, note: note || null },
        token
      );
      setOptOuts(optOuts);
      setStartDate('');
      setEndDate('');
      setNote('');
      setNotice('Periodo aggiunto.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRemove(id) {
    setError('');
    setNotice('');
    try {
      const { optOuts } = await api.deleteUserOptOut(user.id, id, token);
      setOptOuts(optOuts);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <h2>Periodi in cui non partecipo</h2>
      <p className="hint">
        Dichiara i periodi in cui non vuoi essere considerato per le sostituzioni (es. ferie). In quei
        giorni non riceverai proposte né notifiche di nuove sostituzioni. Puoi comunque accettarne una
        autonomamente se cambi idea. Lascia vuota la data di fine per un periodo a tempo indeterminato.
      </p>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <div className="optout-form">
        <label>
          <span>Dal</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          <span>Al (facoltativo)</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label className="optout-note">
          <span>Nota (facoltativa)</span>
          <input type="text" value={note} maxLength={200} placeholder="es. ferie" onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="button" onClick={handleAdd} disabled={submitting}>
          {submitting ? 'Aggiunta...' : 'Aggiungi periodo'}
        </button>
      </div>

      {loading ? (
        <p className="hint">Caricamento...</p>
      ) : optOuts.length === 0 ? (
        <p className="hint">Nessun periodo dichiarato: partecipi normalmente alle sostituzioni.</p>
      ) : (
        <ul className="optout-list">
          {optOuts.map((o) => (
            <li key={o.id} className="optout-item">
              <span>
                {formatOptOutPeriod(o)}
                {o.note ? ` · ${o.note}` : ''}
              </span>
              <button type="button" className="table-action table-action-danger" onClick={() => handleRemove(o.id)}>
                Rimuovi
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
