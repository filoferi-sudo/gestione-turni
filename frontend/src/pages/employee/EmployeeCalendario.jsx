import { useAuth } from '../../context/AuthContext';
import CalendarPage from '../../components/calendar/CalendarPage';
import CoursesCalendar from '../../components/courses/CoursesCalendar';
import TabbedCalendar from '../../components/calendar/TabbedCalendar';
import { createTimeWindow } from '../../utils/timeWindow';

// Sezione Calendario del dipendente: una tab per ogni area operativa assegnata (user.areas),
// motore turni o corsi secondo calendar_mode dell'area. Stesso comportamento della vecchia
// dashboard monolitica, solo in una pagina dedicata. Dal calendario il dipendente chiede anche
// la cancellazione di un proprio turno (lo stato delle richieste è nella sezione Turni).
export default function EmployeeCalendario() {
  const { user } = useAuth();
  const areas = user.areas || [];

  const calendarViews = areas.map((area) => {
    const timeWindow = createTimeWindow(area.calendarStartTime, area.calendarEndTime);
    return {
      key: `area-${area.id}`,
      label: area.name,
      render: () =>
        area.calendarMode === 'shifts' ? (
          <CalendarPage mode="user" areaId={area.id} timeWindow={timeWindow} />
        ) : (
          <CoursesCalendar mode="view" areaId={area.id} timeWindow={timeWindow} />
        ),
    };
  });

  return (
    <>
      <h1>Calendario</h1>

      {areas.length === 0 ? (
        <section className="card">
          <p className="hint">
            Non sei ancora assegnato a nessuna area operativa: contatta il responsabile o il dirigente della
            tua società.
          </p>
        </section>
      ) : (
        <section className="card">
          <TabbedCalendar views={calendarViews} />
        </section>
      )}
    </>
  );
}
