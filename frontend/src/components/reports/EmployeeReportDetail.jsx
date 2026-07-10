import { StatusBadge, fmtHours, fmtDiff, diffClass, fmtDelta, deltaClass } from './reportFormat';
import { formatPeriodLabel } from './reportPeriods';

const SHIFT_TYPE_LABEL = { fixed: 'Fisso', volante: 'Sostituzione', mobile: 'Singolo' };

// Scheda dettaglio di un dipendente: informazioni generali, analisi ore, analisi richieste,
// statistiche operative (dati oggettivi, nessun giudizio), confronto col periodo precedente,
// alert informativi e storico turni. `onBack` è presente solo per la vista manager (torna
// all'elenco); assente per il dipendente che vede i propri dati.
export default function EmployeeReportDetail({ detail, onBack }) {
  const { employee, current, previous, shifts, period } = detail;
  const { contract, areas } = employee;

  const areaLabel = areas.length ? areas.map((a) => `${a.name} (${a.sedeName})`).join(', ') : 'Nessuna area';

  // Statistiche operative (calcolate lato client dai dati del periodo corrente): dati oggettivi.
  const substitutionShare =
    current.shiftsTotal > 0 ? Math.round((current.substitutionsTaken / current.shiftsTotal) * 100) : 0;

  return (
    <div className="report-detail">
      {onBack && (
        <button type="button" className="report-back" onClick={onBack}>
          ← Torna all'elenco
        </button>
      )}

      <div className="report-detail-head">
        <div>
          <h2>{employee.username}</h2>
          <p className="subtitle">{areaLabel}</p>
        </div>
        <StatusBadge status={current.status} />
      </div>
      <p className="report-period-label">Periodo analizzato: {formatPeriodLabel(period.start, period.end)}</p>

      {/* Informazioni generali */}
      <section className="card">
        <h3>Informazioni generali</h3>
        <dl className="report-info">
          <div>
            <dt>Contratto</dt>
            <dd>{contract.contractType || 'Non impostato'}</dd>
          </div>
          <div>
            <dt>Monte ore settimanale</dt>
            <dd>{fmtHours(contract.maxWeeklyHours)}</dd>
          </div>
          <div>
            <dt>Monte ore mensile</dt>
            <dd>{fmtHours(contract.maxMonthlyHours)}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{employee.email || '—'}</dd>
          </div>
        </dl>
        {contract.note && <p className="hint report-note">Note contratto: {contract.note}</p>}
      </section>

      {/* Analisi ore */}
      <section className="card">
        <h3>Analisi ore</h3>
        <div className="dash-grid">
          <div className="stat-card">
            <span className="stat-value">{fmtHours(current.expectedHours)}</span>
            <span className="stat-label">Monte ore previsto (contratto)</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{fmtHours(current.plannedHours)}</span>
            <span className="stat-label">Ore pianificate (turni assegnati)</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{fmtHours(current.workedHours)}</span>
            <span className="stat-label">Ore effettivamente lavorate</span>
          </div>
          <div className="stat-card">
            <span className={`stat-value ${diffClass(current.difference)}`}>{fmtDiff(current.difference)}</span>
            <span className="stat-label">Differenza sul previsto</span>
          </div>
        </div>
        {current.expectedHours == null && (
          <p className="hint">
            Nessun monte ore configurato nel contratto: la differenza non è calcolabile. Imposta le ore
            contrattuali dalla sezione Personale.
          </p>
        )}
      </section>

      {/* Analisi richieste */}
      <section className="card">
        <h3>Analisi richieste</h3>
        <div className="report-requests">
          <div className="report-request-block">
            <h4>Richieste di cancellazione turno</h4>
            <ul className="report-breakdown">
              <li>
                <span>Totali</span>
                <strong>{current.cancellations.total}</strong>
              </li>
              <li>
                <span>Approvate</span>
                <strong>{current.cancellations.approved}</strong>
              </li>
              <li>
                <span>Rifiutate</span>
                <strong>{current.cancellations.rejected}</strong>
              </li>
              <li>
                <span>In attesa</span>
                <strong>{current.cancellations.pending}</strong>
              </li>
            </ul>
          </div>
          <div className="report-request-block">
            <h4>Proposte di sostituzione ricevute</h4>
            <ul className="report-breakdown">
              <li>
                <span>Totali</span>
                <strong>{current.proposals.total}</strong>
              </li>
              <li>
                <span>Accettate</span>
                <strong>{current.proposals.accepted}</strong>
              </li>
              <li>
                <span>Rifiutate</span>
                <strong>{current.proposals.declined}</strong>
              </li>
              <li>
                <span>In attesa</span>
                <strong>{current.proposals.pending}</strong>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Statistiche operative — solo dati oggettivi, nessuna classifica o giudizio */}
      <section className="card">
        <h3>Statistiche operative</h3>
        <p className="hint">
          Dati oggettivi sull'attività del dipendente nel periodo. Non costituiscono una valutazione.
        </p>
        <div className="dash-grid">
          <div className="stat-card">
            <span className="stat-value">{current.shiftsPerformed}</span>
            <span className="stat-label">Turni effettuati</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{current.shiftsTotal}</span>
            <span className="stat-label">Turni pianificati (periodo)</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{substitutionShare}%</span>
            <span className="stat-label">Quota turni da sostituzione</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{current.cancellations.total}</span>
            <span className="stat-label">Richieste effettuate</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{current.substitutionsTaken}</span>
            <span className="stat-label">Sostituzioni prese</span>
          </div>
        </div>
      </section>

      {/* Confronto periodi */}
      <section className="card">
        <h3>Confronto con il periodo precedente</h3>
        <p className="report-period-label">
          {formatPeriodLabel(previous.period.start, previous.period.end)} → {formatPeriodLabel(period.start, period.end)}
        </p>
        <table className="table report-compare">
          <thead>
            <tr>
              <th>Indicatore</th>
              <th>Periodo precedente</th>
              <th>Periodo attuale</th>
              <th>Variazione</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Ore lavorate</td>
              <td>{fmtHours(previous.workedHours)}</td>
              <td>{fmtHours(current.workedHours)}</td>
              <td className={deltaClass(current.workedHours, previous.workedHours)}>
                {fmtDelta(current.workedHours, previous.workedHours, ' h')}
              </td>
            </tr>
            <tr>
              <td>Ore pianificate</td>
              <td>{fmtHours(previous.plannedHours)}</td>
              <td>{fmtHours(current.plannedHours)}</td>
              <td className={deltaClass(current.plannedHours, previous.plannedHours)}>
                {fmtDelta(current.plannedHours, previous.plannedHours, ' h')}
              </td>
            </tr>
            <tr>
              <td>Turni effettuati</td>
              <td>{previous.shiftsPerformed}</td>
              <td>{current.shiftsPerformed}</td>
              <td className={deltaClass(current.shiftsPerformed, previous.shiftsPerformed)}>
                {fmtDelta(current.shiftsPerformed, previous.shiftsPerformed)}
              </td>
            </tr>
            <tr>
              <td>Richieste di cancellazione</td>
              <td>{previous.cancellations.total}</td>
              <td>{current.cancellations.total}</td>
              <td className={deltaClass(current.cancellations.total, previous.cancellations.total)}>
                {fmtDelta(current.cancellations.total, previous.cancellations.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* Alert automatici (informativi) */}
      {current.alerts.length > 0 && (
        <section className="card report-alerts-card">
          <h3>Segnalazioni informative</h3>
          <ul className="report-alerts">
            {current.alerts.map((a, i) => (
              <li key={i}>🟡 {a.message}</li>
            ))}
          </ul>
          <p className="hint">
            Le segnalazioni sono di solo supporto: non costituiscono una valutazione né una decisione. La
            valutazione finale spetta sempre al responsabile.
          </p>
        </section>
      )}

      {/* Storico turni */}
      <section className="card">
        <h3>Storico turni del periodo</h3>
        {shifts.length === 0 ? (
          <p className="hint">Nessun turno nel periodo selezionato.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Orario</th>
                <th>Tipo</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id}>
                  <td>{s.date}</td>
                  <td>
                    {s.startTime}–{s.endTime}
                  </td>
                  <td>{SHIFT_TYPE_LABEL[s.type] || s.type}</td>
                  <td>{s.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
