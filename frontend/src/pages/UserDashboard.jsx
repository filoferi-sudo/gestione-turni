import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import CalendarPage from '../components/calendar/CalendarPage';
import VolanteShiftsPanel from '../components/shifts/VolanteShiftsPanel';
import MyCancellationRequests from '../components/cancellation/MyCancellationRequests';

export default function UserDashboard() {
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
          <strong>Gestione Turni</strong> <span className="badge">Dipendente</span>
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
      </main>
    </div>
  );
}
