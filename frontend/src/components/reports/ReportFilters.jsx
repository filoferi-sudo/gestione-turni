import { getPeriodPresets, formatPeriodLabel } from './reportPeriods';

// Filtri della sezione Report: periodo (preset o personalizzato), sede, area operativa (usata come
// "ruolo/reparto"), singolo dipendente. Le opzioni sede/area arrivano dalle liste già caricate dal
// contesto manager; nessuna nuova chiamata dedicata.
export default function ReportFilters({ value, onChange, sedi = [], areas = [], employees = [], dataTour }) {
  const presets = getPeriodPresets();

  function selectPreset(id) {
    if (id === 'custom') {
      onChange({ ...value, periodId: 'custom' });
      return;
    }
    const preset = presets.find((p) => p.id === id);
    if (preset) onChange({ ...value, periodId: id, start: preset.start, end: preset.end });
  }

  return (
    <section className="card report-filters" data-tour={dataTour}>
      <div className="report-filter-row">
        <div className="report-filter">
          <label>Periodo</label>
          <div className="segmented">
            {presets.map((p) => (
              <button
                key={p.id}
                type="button"
                className={value.periodId === p.id ? 'active' : ''}
                onClick={() => selectPreset(p.id)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={value.periodId === 'custom' ? 'active' : ''}
              onClick={() => selectPreset('custom')}
            >
              Personalizzato
            </button>
          </div>
        </div>
      </div>

      {value.periodId === 'custom' && (
        <div className="report-filter-row">
          <div className="report-filter">
            <label htmlFor="report-start">Dal</label>
            <input
              id="report-start"
              type="date"
              value={value.start}
              max={value.end}
              onChange={(e) => onChange({ ...value, start: e.target.value })}
            />
          </div>
          <div className="report-filter">
            <label htmlFor="report-end">Al</label>
            <input
              id="report-end"
              type="date"
              value={value.end}
              min={value.start}
              onChange={(e) => onChange({ ...value, end: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="report-filter-row">
        {sedi.length > 1 && (
          <div className="report-filter">
            <label htmlFor="report-sede">Sede</label>
            <select
              id="report-sede"
              value={value.sedeId || ''}
              onChange={(e) => onChange({ ...value, sedeId: e.target.value || null })}
            >
              <option value="">Tutte le sedi</option>
              {sedi.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="report-filter">
          <label htmlFor="report-area">Area / reparto</label>
          <select
            id="report-area"
            value={value.areaId || ''}
            onChange={(e) => onChange({ ...value, areaId: e.target.value || null })}
          >
            <option value="">Tutte le aree</option>
            {areas.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        <div className="report-filter">
          <label htmlFor="report-user">Dipendente</label>
          <select
            id="report-user"
            value={value.userId || ''}
            onChange={(e) => onChange({ ...value, userId: e.target.value || null })}
          >
            <option value="">Tutti i dipendenti</option>
            {employees.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.username}
              </option>
            ))}
          </select>
        </div>
      </div>

      <p className="report-period-label">Periodo analizzato: {formatPeriodLabel(value.start, value.end)}</p>
    </section>
  );
}
