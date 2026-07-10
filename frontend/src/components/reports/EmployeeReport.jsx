import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import EmployeeReportDetail from './EmployeeReportDetail';
import { getPeriodPresets, DEFAULT_PERIOD_ID } from './reportPeriods';

// Vista Report self-service per il dipendente: vede solo i PROPRI dati (il backend rifiuta con 403
// la lettura del report di un altro dipendente). Selettore di periodo + scheda dettaglio, senza
// "Torna all'elenco" (non c'è elenco per il dipendente).
export default function EmployeeReport() {
  const { token, user } = useAuth();
  const presets = getPeriodPresets();
  const initialPreset = presets.find((p) => p.id === DEFAULT_PERIOD_ID);

  const [period, setPeriod] = useState({
    periodId: DEFAULT_PERIOD_ID,
    start: initialPreset.start,
    end: initialPreset.end,
  });
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  function selectPreset(id) {
    const preset = presets.find((p) => p.id === id);
    if (preset) setPeriod({ periodId: id, start: preset.start, end: preset.end });
  }

  useEffect(() => {
    setDetail(null);
    api
      .getEmployeeReport(token, user.id, { start: period.start, end: period.end })
      .then((data) => {
        setDetail(data);
        setError('');
      })
      .catch((err) => setError(err.message));
  }, [token, user.id, period.start, period.end]);

  return (
    <>
      <section className="card report-filters" data-tour="hours-stats">
        <div className="report-filter">
          <label>Periodo</label>
          <div className="segmented">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={period.periodId === p.id ? 'active' : ''}
                onClick={() => selectPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="error">{error}</div>}

      {detail ? (
        <EmployeeReportDetail detail={detail} />
      ) : (
        !error && <p className="hint">Caricamento report…</p>
      )}
    </>
  );
}
