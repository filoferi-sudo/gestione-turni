import AppLayout from './AppLayout';

// Sezioni visibili al dipendente: niente Personale né Fabbisogno (funzioni manager). Le aree
// operative del dipendente arrivano da user.areas (AuthContext), quindi non serve alcun
// contesto workspace aggiuntivo.
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', end: true, tourId: 'nav-dashboard' },
  { to: '/dashboard/calendario', label: 'Calendario', tourId: 'nav-calendario' },
  { to: '/dashboard/turni', label: 'Turni', tourId: 'nav-turni' },
  { to: '/dashboard/sostituzioni', label: 'Sostituzioni', tourId: 'nav-sostituzioni' },
  { to: '/dashboard/comunicazioni', label: 'Comunicazioni', tourId: 'nav-comunicazioni' },
  { to: '/dashboard/report', label: 'Report', tourId: 'nav-report' },
  { to: '/dashboard/impostazioni', label: 'Impostazioni', tourId: 'nav-impostazioni' },
];

export default function EmployeeLayout() {
  return <AppLayout navItems={NAV_ITEMS} />;
}
