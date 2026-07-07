import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import CalendarPage from '../../components/calendar/CalendarPage';
import VolanteShiftsPanel from '../../components/shifts/VolanteShiftsPanel';
import MyCancellationRequests from '../../components/cancellation/MyCancellationRequests';
import MyProfile from '../../components/profile/MyProfile';
import HoursStats from '../../components/stats/HoursStats';
import CoursesCalendar from '../../components/courses/CoursesCalendar';

// Dashboard della categoria "istruttore": funzioni comuni (calendario turni, turni singoli/
// volanti, ore lavorate, profilo) più il Calendario Corsi, in sola lettura: la gestione dei
// corsi (creazione, modifica, assegnazione istruttore) spetta solo a responsabile e dirigente.
export default function IstruttoreDashboard() {
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
          <strong>Gestione Turni</strong> <span className="badge">Istruttore</span>
        </div>
        <button className="link-button" onClick={handleLogout}>
          Esci
        </button>
      </header>

      <main className="content content-wide">
        <h1>Ciao, {user.username}</h1>
        <p>Il tuo calendario turni. Puoi consultarlo e richiedere la cancellazione dei tuoi turni.</p>

        <section className="card">
          <CalendarPage mode="user" />
        </section>

        <VolanteShiftsPanel mode="claim" />

        <MyCancellationRequests />

        <section className="card">
          <h2>Calendario Corsi</h2>
          <CoursesCalendar mode="view" />
        </section>

        <HoursStats />

        <MyProfile />
      </main>
    </div>
  );
}
