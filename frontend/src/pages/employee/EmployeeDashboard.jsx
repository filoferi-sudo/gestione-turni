import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import CalendarPage from '../../components/calendar/CalendarPage';
import CoursesCalendar from '../../components/courses/CoursesCalendar';
import TabbedCalendar from '../../components/calendar/TabbedCalendar';
import SubstitutionsPanel from '../../components/shifts/SubstitutionsPanel';
import CoursesAvailablePanel from '../../components/courses/CoursesAvailablePanel';
import MyCancellationRequests from '../../components/cancellation/MyCancellationRequests';
import MyProfile from '../../components/profile/MyProfile';
import HoursStats from '../../components/stats/HoursStats';
import NotificationsBell from '../../components/notifications/NotificationsBell';
import { createTimeWindow } from '../../utils/timeWindow';

// Dashboard unica per qualunque dipendente, qualunque sia la sua mansione: le tab del calendario
// e i pannelli "disponibili" si costruiscono dinamicamente dalle aree operative assegnate
// (user.areas, arrivate da /api/auth/login o /api/auth/me), non più da una categoria fissa
// hardcoded nel codice. Sostituisce EmployeeDashboardRouter + BagninoDashboard/
// IstruttoreDashboard: un dipendente con più aree vede semplicemente più tab, un dipendente con
// una nuova area creata dal Dirigente (es. "Reception") la vede comparire senza alcuna modifica
// al codice.
export default function EmployeeDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const areas = user.areas || [];

  function handleLogout() {
    logout();
    navigate('/login');
  }

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

  const shiftAreas = areas.filter((a) => a.calendarMode === 'shifts');
  const courseAreas = areas.filter((a) => a.calendarMode === 'courses');

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <strong>Gestione Turni</strong> <span className="badge">Dipendente</span>
        </div>
        <div className="topbar-actions">
          <NotificationsBell />
          <button className="link-button" onClick={handleLogout}>
            Esci
          </button>
        </div>
      </header>

      <main className="content content-wide">
        <h1>Ciao, {user.username}</h1>

        {areas.length === 0 ? (
          <section className="card">
            <p className="hint">
              Non sei ancora assegnato a nessuna area operativa. Contatta il responsabile o il dirigente della tua
              società per essere aggiunto a un'area (es. Bagnini, Istruttori, Reception...).
            </p>
          </section>
        ) : (
          <>
            <section className="card">
              <TabbedCalendar views={calendarViews} />
            </section>

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
        )}

        <MyCancellationRequests />

        <HoursStats />

        <MyProfile />
      </main>
    </div>
  );
}
