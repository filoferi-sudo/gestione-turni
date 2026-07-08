import AppLayout from './AppLayout';

// Sezioni visibili al dipendente: niente Personale né Fabbisogno (funzioni manager). Le aree
// operative del dipendente arrivano da user.areas (AuthContext), quindi non serve alcun
// contesto workspace aggiuntivo.
const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', end: true },
  { to: '/dashboard/calendario', label: 'Calendario' },
  { to: '/dashboard/turni', label: 'Turni' },
  { to: '/dashboard/sostituzioni', label: 'Sostituzioni' },
  { to: '/dashboard/comunicazioni', label: 'Comunicazioni' },
  { to: '/dashboard/report', label: 'Report' },
  { to: '/dashboard/impostazioni', label: 'Impostazioni' },
];

export default function EmployeeLayout() {
  return <AppLayout navItems={NAV_ITEMS} />;
}
