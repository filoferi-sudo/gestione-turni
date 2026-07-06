import { Fragment, useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function HoursStats() {
  const { token } = useAuth();
  const [stats, setStats] = useState([]);
  const [error, setError] = useState('');
  const [expandedUserId, setExpandedUserId] = useState(null);

  useEffect(() => {
    api
      .getHoursStats(token)
      .then(({ stats }) => setStats(stats))
      .catch((err) => setError(err.message));
  }, [token]);

  return (
    <section className="card">
      <h2>Statistiche ore lavorate</h2>
      <p className="hint">
        Ore settimana/mese calcolate sul periodo corrente; totale ed elenco turni si riferiscono ai turni già
        svolti da inizio anno.
      </p>

      {error && <div className="error">{error}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Dipendente</th>
            <th>Ore settimana</th>
            <th>Ore mese</th>
            <th>Totale ore (anno)</th>
            <th>Turni effettuati</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <Fragment key={s.userId}>
              <tr>
                <td>{s.username}</td>
                <td>{s.weekHours.toFixed(1)}</td>
                <td>{s.monthHours.toFixed(1)}</td>
                <td>{s.totalHours.toFixed(1)}</td>
                <td>
                  <button
                    className="table-action"
                    onClick={() => setExpandedUserId(expandedUserId === s.userId ? null : s.userId)}
                  >
                    {expandedUserId === s.userId ? 'Nascondi' : `Vedi elenco (${s.shifts.length})`}
                  </button>
                </td>
              </tr>
              {expandedUserId === s.userId && (
                <tr>
                  <td colSpan={5}>
                    {s.shifts.length === 0 ? (
                      <span className="hint">Nessun turno effettuato quest'anno.</span>
                    ) : (
                      <ul className="shift-list">
                        {s.shifts.map((shift) => (
                          <li key={shift.id}>
                            {shift.date} · {shift.startTime}-{shift.endTime} ·{' '}
                            {shift.type === 'fixed' ? 'fisso' : shift.type === 'volante' ? 'volante' : 'mobile'}
                            {shift.note ? ` · ${shift.note}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {stats.length === 0 && (
            <tr>
              <td colSpan={5} className="hint">
                Nessun dipendente registrato.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
