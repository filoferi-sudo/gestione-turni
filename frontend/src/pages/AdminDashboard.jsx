import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useSedeSelection } from '../hooks/useSedeSelection';
import { createTimeWindow, DEFAULT_TIME_WINDOW } from '../utils/timeWindow';
import CalendarPage from '../components/calendar/CalendarPage';
import TabbedCalendar from '../components/calendar/TabbedCalendar';
import UserManagementSection from '../components/management/UserManagementSection';
import HoursStats from '../components/stats/HoursStats';
import SubstitutionsPanel from '../components/shifts/SubstitutionsPanel';
import CancellationRequestsPanel from '../components/cancellation/CancellationRequestsPanel';
import CoursesCalendar from '../components/courses/CoursesCalendar';
import CoursesAvailablePanel from '../components/courses/CoursesAvailablePanel';
import NotificationsBell from '../components/notifications/NotificationsBell';

// Il Responsabile opera dentro le sedi/aree già configurate dal Dirigente: può selezionare quale
// sede vedere ma non crearle/modificarle (vedi DirigenteDashboard per la gestione struttura).
export default function AdminDashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const { sedi, selectedSede, selectedSedeId, setSelectedSedeId, loading: sediLoading } = useSedeSelection();
  const [areas, setAreas] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!selectedSedeId) {
      setAreas([]);
      return;
    }
    api
      .listAreas(selectedSedeId, token)
      .then(({ areas }) => setAreas(areas))
      .catch((err) => setError(err.message));
  }, [selectedSedeId, token]);

  function handleLogout() {
    logout();
    navigate('/login');
  }

  const timeWindow = selectedSede
    ? createTimeWindow(selectedSede.calendarStartTime, selectedSede.calendarEndTime)
    : DEFAULT_TIME_WINDOW;

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

  const shiftAreas = areas.filter((a) => a.calendarMode === 'shifts');
  const courseAreas = areas.filter((a) => a.calendarMode === 'courses');

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <strong>Gestione Turni</strong> <span className="badge badge-admin">Responsabile</span>
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

        {error && <div className="error">{error}</div>}

        {!sediLoading && sedi.length > 1 && (
          <section className="card">
            <div className="section-header">
              <h2>Sede</h2>
              <select value={selectedSedeId || ''} onChange={(e) => setSelectedSedeId(Number(e.target.value))}>
                {sedi.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </section>
        )}

        {!sediLoading && selectedSedeId && (
          <section className="card">
            <h2>Calendario{sedi.length > 1 ? ` — ${selectedSede?.name}` : ''}</h2>
            {areas.length === 0 ? (
              <p className="hint">
                Nessuna area operativa in questa sede: chiedi al dirigente di crearne una.
              </p>
            ) : (
              <TabbedCalendar views={calendarViews} />
            )}
          </section>
        )}

        <UserManagementSection
          roles={['user']}
          title="Dipendenti"
          createHref="/admin/users/new"
          createLabel="Nuovo utente"
        />

        <HoursStats />

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

        <CancellationRequestsPanel />
      </main>
    </div>
  );
}
