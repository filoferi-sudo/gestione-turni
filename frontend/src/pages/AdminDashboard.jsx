import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CalendarPage from '../components/calendar/CalendarPage';
import TabbedCalendar from '../components/calendar/TabbedCalendar';
import UserManagementSection from '../components/management/UserManagementSection';
import HoursStats from '../components/stats/HoursStats';
import VolanteShiftsPanel from '../components/shifts/VolanteShiftsPanel';
import CancellationRequestsPanel from '../components/cancellation/CancellationRequestsPanel';
import CoursesCalendar from '../components/courses/CoursesCalendar';
import CoursesAvailablePanel from '../components/courses/CoursesAvailablePanel';

const CALENDAR_VIEWS = [
  { key: 'turni', label: 'Turni Bagnini', render: () => <CalendarPage mode="admin" /> },
  { key: 'corsi', label: 'Corsi Istruttori', render: () => <CoursesCalendar mode="manage" /> },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <strong>Gestione Turni</strong> <span className="badge badge-admin">Responsabile</span>
        </div>
        <button className="link-button" onClick={handleLogout}>
          Esci
        </button>
      </header>

      <main className="content content-wide">
        <h1>Ciao, {user.username}</h1>

        <section className="card">
          <h2>Calendario</h2>
          <TabbedCalendar views={CALENDAR_VIEWS} />
        </section>

        <UserManagementSection
          roles={['user']}
          title="Dipendenti"
          createHref="/admin/users/new"
          createLabel="Nuovo utente"
        />

        <HoursStats />

        <VolanteShiftsPanel mode="manage" />

        <CoursesAvailablePanel mode="manage" />

        <CancellationRequestsPanel />
      </main>
    </div>
  );
}
