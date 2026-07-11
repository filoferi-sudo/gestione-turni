import AppLayout from './AppLayout';
import { useAuth } from '../../context/AuthContext';

// Sezioni visibili al dipendente: niente Personale né Fabbisogno (funzioni manager). Le aree
// operative del dipendente arrivano da user.areas (AuthContext), quindi non serve alcun
// contesto workspace aggiuntivo. `requiresFeature`: nascosta se non inclusa nel piano (layer SaaS).
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', end: true, tourId: 'nav-dashboard' },
  { to: '/dashboard/calendario', label: 'Calendario', tourId: 'nav-calendario' },
  { to: '/dashboard/turni', label: 'Turni', tourId: 'nav-turni' },
  { to: '/dashboard/sostituzioni', label: 'Sostituzioni', tourId: 'nav-sostituzioni' },
  { to: '/dashboard/comunicazioni', label: 'Comunicazioni', tourId: 'nav-comunicazioni' },
  { to: '/dashboard/report', label: 'Report', tourId: 'nav-report', requiresFeature: 'reports' },
  { to: '/dashboard/impostazioni', label: 'Impostazioni', tourId: 'nav-impostazioni' },
];

export default function EmployeeLayout() {
  const { hasFeature } = useAuth();
  const navItems = NAV_ITEMS.filter((i) => !i.requiresFeature || hasFeature(i.requiresFeature));
  return <AppLayout navItems={navItems} />;
}
