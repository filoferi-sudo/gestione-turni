import { StatusBadge, fmtHours, fmtDiff, diffClass } from './reportFormat';

// Scheda riepilogativa di un dipendente nella vista generale. Solo dati oggettivi + stato
// operativo; nessuna classifica né giudizio. Cliccabile per aprire la scheda dettaglio.
export default function EmployeeReportCard({ employee, onOpen }) {
  const {
    username,
    areas,
    contract,
    expectedHours,
    workedHours,
    plannedHours,
    difference,
    shiftsPerformed,
    cancellations,
    substitutionsTaken,
    status,
    alerts,
  } = employee;

  const areaLabel = areas.length ? areas.map((a) => a.name).join(', ') : 'Nessuna area';

  return (
    <button type="button" className="report-card" onClick={() => onOpen(employee.userId)}>
      <div className="report-card-head">
        <div>
          <h3 className="report-card-name">{username}</h3>
          <p className="report-card-role">{areaLabel}</p>
        </div>
        <StatusBadge status={status} />
      </div>

      <p className="report-card-contract">
        {contract.contractType || 'Contratto non impostato'}
        {expectedHours != null && ` · ${fmtHours(expectedHours)} previste`}
      </p>

      <div className="report-card-grid">
        <div>
          <span className="report-metric-value">{fmtHours(workedHours)}</span>
          <span className="report-metric-label">Ore lavorate</span>
        </div>
        <div>
          <span className="report-metric-value">{fmtHours(plannedHours)}</span>
          <span className="report-metric-label">Ore pianificate</span>
        </div>
        <div>
          <span className={`report-metric-value ${diffClass(difference)}`}>{fmtDiff(difference)}</span>
          <span className="report-metric-label">Differenza</span>
        </div>
        <div>
          <span className="report-metric-value">{shiftsPerformed}</span>
          <span className="report-metric-label">Turni effettuati</span>
        </div>
        <div>
          <span className="report-metric-value">{cancellations.total}</span>
          <span className="report-metric-label">Richieste cancellazione</span>
        </div>
        <div>
          <span className="report-metric-value">{substitutionsTaken}</span>
          <span className="report-metric-label">Sostituzioni prese</span>
        </div>
      </div>

      {alerts.length > 0 && (
        <ul className="report-card-alerts">
          {alerts.map((a, i) => (
            <li key={i}>🟡 {a.message}</li>
          ))}
        </ul>
      )}
    </button>
  );
}
