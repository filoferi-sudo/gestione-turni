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
import SediManagement from './dirigente/SediManagement';
import AreasManagement from '../components/areas/AreasManagement';
import NotificationsBell from '../components/notifications/NotificationsBell';

// Il calendario non è più una coppia fissa "Turni Bagnini"/"Corsi Istruttori": le tab si
// costruiscono dinamicamente dalle aree operative della sede selezionata (vedi
// AreasManagement/SediManagement). Solo il Dirigente può creare/modificare sedi e aree; il
// Responsabile (AdminDashboard) le seleziona ma non le gestisce.
export default function DirigenteDashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const { sedi, selectedSede, selectedSedeId, setSelectedSedeId, loading: sediLoading, reload: reloadSedi } =
    useSedeSelection();
  const [areas, setAreas] = useState([]);
  const [error, setError] = useState('');

  function loadAreas() {
    if (!selectedSedeId) {
      setAreas([]);
      return;
    }
    api
      .listAreas(selectedSedeId, token)
      .then(({ areas }) => setAreas(areas))
      .catch((err) => setError(err.message));
  }

  useEffect(loadAreas, [selectedSedeId, token]);

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
          <strong>Gestione Turni</strong> <span className="badge badge-admin">Dirigente</span>
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

        <SediManagement
          sedi={sedi}
          selectedSedeId={selectedSedeId}
          setSelectedSedeId={setSelectedSedeId}
          onReload={reloadSedi}
        />

        {!sediLoading && selectedSedeId && (
          <>
            <AreasManagement sedeId={selectedSedeId} onChange={loadAreas} />

            <section className="card">
              <h2>Calendario — {selectedSede?.name}</h2>
              {areas.length === 0 ? (
                <p className="hint">Nessuna area operativa in questa sede: creane una qui sopra per iniziare.</p>
              ) : (
                <TabbedCalendar views={calendarViews} />
              )}
            </section>
          </>
        )}

        <UserManagementSection
          roles={['admin']}
          title="Responsabili"
          createHref="/dirigente/users/new"
          createLabel="Nuovo responsabile"
        />

        <UserManagementSection
          roles={['user']}
          title="Dipendenti"
          createHref="/dirigente/users/new"
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
