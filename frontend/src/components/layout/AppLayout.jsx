import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationsBell from '../notifications/NotificationsBell';

const ROLE_LABELS = { admin: 'Responsabile', dirigente: 'Dirigente', user: 'Dipendente', superadmin: 'Super Admin' };

// Guscio comune a tutte le aree autenticate: sidebar di navigazione sempre visibile (una voce
// per sezione, elenco costruito dal layout di ruolo che lo usa), topbar con notifiche e logout,
// contenuto della sezione corrente nell'Outlet. Nessuna logica di dominio qui dentro: aggiungere
// una nuova sezione significa aggiungere una voce all'elenco e una rotta figlia, senza toccare
// questo componente.
export default function AppLayout({ navItems, sidebarExtra, showBell = true }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <strong>Gestione Turni</strong>
          <span className={`badge${user.role === 'user' ? '' : ' badge-admin'}`}>{ROLE_LABELS[user.role]}</span>
        </div>

        {sidebarExtra}

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-main">
        <header className="topbar app-topbar">
          <span className="topbar-user">
            Ciao, <strong>{user.username}</strong>
          </span>
          <div className="topbar-actions">
            {showBell && <NotificationsBell />}
            <button className="link-button" onClick={handleLogout}>
              Esci
            </button>
          </div>
        </header>

        <main className="content content-wide">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
