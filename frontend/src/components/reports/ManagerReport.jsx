import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useManagerWorkspace } from '../../context/ManagerWorkspaceContext';
import { usePolling } from '../../hooks/usePolling';
import ReportFilters from './ReportFilters';
import EmployeeReportCard from './EmployeeReportCard';
import EmployeeReportDetail from './EmployeeReportDetail';
import { getPeriodPresets, DEFAULT_PERIOD_ID } from './reportPeriods';

// Vista Report per responsabile/dirigente: filtri + elenco schede dipendente; il click su una
// scheda apre la scheda dettaglio (inline, con "Torna all'elenco") senza cambiare rotta.
// Riusa esclusivamente gli endpoint /api/reports/* e le liste sedi/aree già disponibili.
export default function ManagerReport() {
  const { token } = useAuth();
  const { sedi } = useManagerWorkspace();

  const initialPreset = getPeriodPresets().find((p) => p.id === DEFAULT_PERIOD_ID);
  const [filters, setFilters] = useState({
    periodId: DEFAULT_PERIOD_ID,
    start: initialPreset.start,
    end: initialPreset.end,
    sedeId: null,
    areaId: null,
    userId: null,
  });

  const [allAreas, setAllAreas] = useState([]);
  const [overview, setOverview] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');

  // Aree operative di tutte le sedi della società, per il filtro "Area / reparto".
  useEffect(() => {
    if (!sedi || sedi.length === 0) {
      setAllAreas([]);
      return;
    }
    Promise.all(
      sedi.map((s) =>
        api.listAreas(s.id, token).then(({ areas }) => areas.map((a) => ({ ...a, sedeName: s.name })))
      )
    )
      .then((results) => setAllAreas(results.flat()))
      .catch((err) => setError(err.message));
  }, [sedi, token]);

  // Aree mostrate nel filtro: se è selezionata una sede, solo le sue; l'etichetta include la sede
  // quando la società ha più sedi (evita ambiguità tra aree omonime).
  const areaOptions = useMemo(() => {
    const filtered = filters.sedeId
      ? allAreas.filter((a) => String(a.sedeId) === String(filters.sedeId))
      : allAreas;
    const multiSede = (sedi || []).length > 1 && !filters.sedeId;
    return filtered.map((a) => ({ id: a.id, name: multiSede ? `${a.sedeName} · ${a.name}` : a.name }));
  }, [allAreas, filters.sedeId, sedi]);

  function loadOverview() {
    api
      .getReportOverview(token, {
        start: filters.start,
        end: filters.end,
        sedeId: filters.sedeId,
        areaId: filters.areaId,
        userId: filters.userId,
      })
      .then((data) => {
        setOverview(data);
        setError('');
      })
      .catch((err) => setError(err.message));
  }

  useEffect(loadOverview, [token, filters.start, filters.end, filters.sedeId, filters.areaId, filters.userId]);
  // Aggiornamento leggero solo quando si è sull'elenco (non mentre si consulta un dettaglio).
  usePolling(loadOverview, { intervalMs: 60000, enabled: selectedId === null });

  function handleFilterChange(next) {
    // Cambiando sede, azzera l'area se non appartiene più alla sede selezionata.
    if (next.sedeId !== filters.sedeId && next.areaId) {
      const stillValid = allAreas.some(
        (a) => String(a.id) === String(next.areaId) && (!next.sedeId || String(a.sedeId) === String(next.sedeId))
      );
      if (!stillValid) next = { ...next, areaId: null };
    }
    setFilters(next);
  }

  function openDetail(id) {
    setSelectedId(id);
    setDetail(null);
    api
      .getEmployeeReport(token, id, { start: filters.start, end: filters.end })
      .then(setDetail)
      .catch((err) => setError(err.message));
  }

  function back() {
    setSelectedId(null);
    setDetail(null);
    loadOverview();
  }

  if (selectedId !== null) {
    return (
      <>
        {error && <div className="error">{error}</div>}
        {detail ? (
          <EmployeeReportDetail detail={detail} onBack={back} />
        ) : (
          <p className="hint">Caricamento scheda…</p>
        )}
      </>
    );
  }

  const employees = overview?.employees || [];

  return (
    <>
      <ReportFilters
        value={filters}
        onChange={handleFilterChange}
        sedi={sedi || []}
        areas={areaOptions}
        employees={employees}
        dataTour="hours-stats"
      />

      {error && <div className="error">{error}</div>}

      {overview === null ? (
        <p className="hint">Caricamento report…</p>
      ) : employees.length === 0 ? (
        <section className="card">
          <p className="hint">Nessun dipendente corrisponde ai filtri selezionati.</p>
        </section>
      ) : (
        <div className="report-grid">
          {employees.map((emp) => (
            <EmployeeReportCard key={emp.userId} employee={emp} onOpen={openDetail} />
          ))}
        </div>
      )}
    </>
  );
}
