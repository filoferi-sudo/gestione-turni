import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CalendarPage from '../components/calendar/CalendarPage';
import UserManagementSection from '../components/management/UserManagementSection';
import HoursStats from '../components/stats/HoursStats';
import VolanteShiftsPanel from '../components/shifts/VolanteShiftsPanel';
import CancellationRequestsPanel from '../components/cancellation/CancellationRequestsPanel';
import CoursesCalendar from '../components/courses/CoursesCalendar';

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
          <h2>Calendario turni</h2>
          <CalendarPage mode="admin" />
        </section>

        <UserManagementSection
          roles={['user']}
          title="Dipendenti"
          createHref="/admin/users/new"
          createLabel="Nuovo utente"
        />

        <HoursStats />

        <VolanteShiftsPanel mode="manage" />

        <CancellationRequestsPanel />

        <section className="card">
          <h2>Gestione corsi</h2>
          <CoursesCalendar mode="manage" />
        </section>
      </main>
    </div>
  );
}
