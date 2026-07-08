import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useManagerWorkspace } from '../../context/ManagerWorkspaceContext';
import CalendarPage from '../../components/calendar/CalendarPage';
import CoursesCalendar from '../../components/courses/CoursesCalendar';
import TabbedCalendar from '../../components/calendar/TabbedCalendar';

// Sezione Calendario per Dirigente/Responsabile: una tab per ogni area operativa della sede
// selezionata (motore turni o corsi secondo calendar_mode). Qui vive anche la copertura del
// fabbisogno integrata nel calendario (chip per occorrenza, solo aree turni) e la creazione/
// modifica di turni, corsi e fabbisogni: comportamento invariato rispetto a prima, è cambiata
// solo la collocazione (pagina dedicata invece di card dentro la dashboard monolitica).
export default function CalendarioPage() {
  const { user } = useAuth();
  const { areas, areasError, selectedSede, selectedSedeId, sediLoading, timeWindow } = useManagerWorkspace();
  const isDirigente = user.role === 'dirigente';

  const calendarViews = areas.map((area) => ({
    key: `area-${area.id}`,
    label: area.name,
    render: () =>
      area.calendarMode === 'shifts' ? (
        <CalendarPage mode="admin" areaId={area.id} timeWindow={timeWindow} />
      ) : (
        <CoursesCalendar mode="manage" areaId={area.id} timeWindow={timeWindow} />
      ),
  }));

  return (
    <>
      <h1>Calendario{selectedSede ? ` — ${selectedSede.name}` : ''}</h1>

      {areasError && <div className="error">{areasError}</div>}

      {!sediLoading && !selectedSedeId && (
        <section className="card">
          <p className="hint">
            Nessuna sede disponibile.{' '}
            {isDirigente ? (
              <>
                Creane una da <Link to="/dirigente/impostazioni">Impostazioni</Link>.
              </>
            ) : (
              'Chiedi al dirigente di configurare una sede.'
            )}
          </p>
        </section>
      )}

      {!sediLoading && selectedSedeId && (
        <section className="card">
          {areas.length === 0 ? (
            <p className="hint">
              Nessuna area operativa in questa sede.{' '}
              {isDirigente ? (
                <>
                  Creane una da <Link to="/dirigente/impostazioni">Impostazioni</Link> per iniziare.
                </>
              ) : (
                'Chiedi al dirigente di crearne una.'
              )}
            </p>
          ) : (
            <TabbedCalendar views={calendarViews} />
          )}
        </section>
      )}
    </>
  );
}
