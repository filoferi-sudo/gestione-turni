import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useManagerWorkspace } from '../../context/ManagerWorkspaceContext';
import SubstitutionsPanel from '../../components/shifts/SubstitutionsPanel';
import CoursesAvailablePanel from '../../components/courses/CoursesAvailablePanel';

// Sezione Sostituzioni per Dirigente/Responsabile: tutte le Sostituzioni pendenti delle aree
// turni della sede selezionata (con "Trova sostituzione" e proposte mirate) e i corsi ancora
// disponibili delle aree corsi. I pannelli sono gli stessi di prima (SubstitutionsPanel /
// CoursesAvailablePanel in modalità manage), raccolti in una pagina dedicata.
export default function SostituzioniPage() {
  const { user } = useAuth();
  const { areas, areasError, selectedSede } = useManagerWorkspace();
  const base = user.role === 'dirigente' ? '/dirigente' : '/admin';

  const shiftAreas = areas.filter((a) => a.calendarMode === 'shifts');
  const courseAreas = areas.filter((a) => a.calendarMode === 'courses');

  return (
    <>
      <h1>Sostituzioni{selectedSede ? ` — ${selectedSede.name}` : ''}</h1>
      <p className="subtitle">
        Le Sostituzioni si creano dal <Link to={`${base}/calendario`}>Calendario</Link> (bottone "+ Nuovo
        turno" o "Genera" sui chip di fabbisogno) oppure nascono da una richiesta di cancellazione approvata.
      </p>

      {areasError && <div className="error">{areasError}</div>}

      {shiftAreas.length === 0 && courseAreas.length === 0 && (
        <section className="card">
          <p className="hint">Nessuna area operativa in questa sede: non ci sono sostituzioni da gestire.</p>
        </section>
      )}

      {shiftAreas.map((area) => (
        <SubstitutionsPanel
          key={`sub-${area.id}`}
          mode="manage"
          areaId={area.id}
          areaName={shiftAreas.length > 1 ? area.name : undefined}
        />
      ))}

      {courseAreas.map((area) => (
        <CoursesAvailablePanel
          key={`course-${area.id}`}
          mode="manage"
          areaId={area.id}
          areaName={courseAreas.length > 1 ? area.name : undefined}
        />
      ))}
    </>
  );
}
