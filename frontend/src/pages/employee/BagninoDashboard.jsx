import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import CalendarPage from '../../components/calendar/CalendarPage';
import SubstitutionsPanel from '../../components/shifts/SubstitutionsPanel';
import MyCancellationRequests from '../../components/cancellation/MyCancellationRequests';
import MyProfile from '../../components/profile/MyProfile';
import HoursStats from '../../components/stats/HoursStats';

// Dashboard della categoria "bagnino": calendario turni, turni singoli/sostituzioni, ore lavorate,
// profilo personale. Nessuna sezione specifica oltre a queste funzioni di base.
export default function BagninoDashboard() {
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
          <strong>Gestione Turni</strong> <span className="badge">Bagnino</span>
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

        <SubstitutionsPanel mode="claim" />

        <MyCancellationRequests />

        <HoursStats />

        <MyProfile />
      </main>
    </div>
  );
}
