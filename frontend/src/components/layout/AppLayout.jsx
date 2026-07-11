import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import NotificationsBell from '../notifications/NotificationsBell';
import DemoBanner from '../demo/DemoBanner';
import EmailVerificationBanner from '../notifications/EmailVerificationBanner';
import { Logo } from '../common/Logo';

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
      <a href="#main-content" className="skip-link">
        Salta al contenuto
      </a>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo size={22} className="sidebar-logo" />
          <span className={`badge${user.role === 'user' ? '' : ' badge-admin'}`}>{ROLE_LABELS[user.role]}</span>
        </div>

        {sidebarExtra}

        <nav className="sidebar-nav" aria-label="Navigazione principale">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              // data-tour: gancio stabile per il Tour Guidato (nessuna coordinata hardcoded). Deriva
              // dall'ultimo segmento della rotta (es. 'nav-calendario'), 'nav-dashboard' per la home.
              data-tour={item.tourId || `nav-${item.to.split('/').filter(Boolean).pop() || 'dashboard'}`}
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

        <DemoBanner />
        <EmailVerificationBanner />

        <main id="main-content" tabIndex={-1} className="content content-wide">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
