import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import CalendarPage from '../../components/calendar/CalendarPage';
import TabbedCalendar from '../../components/calendar/TabbedCalendar';
import VolanteShiftsPanel from '../../components/shifts/VolanteShiftsPanel';
import MyCancellationRequests from '../../components/cancellation/MyCancellationRequests';
import MyProfile from '../../components/profile/MyProfile';
import HoursStats from '../../components/stats/HoursStats';
import CoursesCalendar from '../../components/courses/CoursesCalendar';
import CoursesAvailablePanel from '../../components/courses/CoursesAvailablePanel';

// "Turni" mostra il proprio calendario turni (mode="user"); "Corsi Istruttori" mostra l'intera
// programmazione corsi della struttura in sola lettura (vedi CoursesCalendar mode="view").
const CALENDAR_VIEWS = [
  { key: 'turni', label: 'Turni', render: () => <CalendarPage mode="user" /> },
  { key: 'corsi', label: 'Corsi Istruttori', render: () => <CoursesCalendar mode="view" /> },
];

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
        <p>Il tuo calendario turni e la programmazione corsi della struttura.</p>

        <section className="card">
          <TabbedCalendar views={CALENDAR_VIEWS} />
        </section>

        <VolanteShiftsPanel mode="claim" />

        <CoursesAvailablePanel mode="claim" />

        <MyCancellationRequests />

        <HoursStats />

        <MyProfile />
      </main>
    </div>
  );
}
