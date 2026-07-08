import { useAuth } from '../../context/AuthContext';
import MyProposalsPanel from '../../components/shifts/MyProposalsPanel';
import SubstitutionsPanel from '../../components/shifts/SubstitutionsPanel';
import CoursesAvailablePanel from '../../components/courses/CoursesAvailablePanel';

// Sezione Sostituzioni del dipendente: le proposte mirate ricevute (da accettare/rifiutare) e
// le Sostituzioni/corsi disponibili nelle proprie aree, reclamabili in autonomia. Stessi
// pannelli di prima (MyProposalsPanel, SubstitutionsPanel/CoursesAvailablePanel in modalità
// claim), raccolti in una pagina dedicata.
export default function EmployeeSostituzioni() {
  const { user } = useAuth();
  const areas = user.areas || [];

  const shiftAreas = areas.filter((a) => a.calendarMode === 'shifts');
  const courseAreas = areas.filter((a) => a.calendarMode === 'courses');

  return (
    <>
      <h1>Sostituzioni</h1>
      <p className="subtitle">
        Le proposte ricevute dal responsabile e i turni/corsi disponibili nelle tue aree operative.
      </p>

      <MyProposalsPanel />

      {areas.length === 0 && (
        <section className="card">
          <p className="hint">
            Non sei ancora assegnato a nessuna area operativa: non ci sono sostituzioni disponibili per te.
          </p>
        </section>
      )}

      {shiftAreas.map((area) => (
        <SubstitutionsPanel
          key={`sub-${area.id}`}
          mode="claim"
          areaId={area.id}
          areaName={shiftAreas.length > 1 ? area.name : undefined}
        />
      ))}

      {courseAreas.map((area) => (
        <CoursesAvailablePanel
          key={`course-${area.id}`}
          mode="claim"
          areaId={area.id}
          areaName={courseAreas.length > 1 ? area.name : undefined}
        />
      ))}
    </>
  );
}
