import AppLayout from './AppLayout';

// Il Super Admin amministra solo la piattaforma (anagrafica società + statistiche aggregate),
// mai i dati operativi delle singole società: le sezioni sono quindi solo due. Niente campanella:
// le notifiche in-app sono un meccanismo interno alle società (company_id valorizzato), il super
// admin non ne riceve.
const NAV_ITEMS = [
  { to: '/superadmin', label: 'Dashboard', end: true },
  { to: '/superadmin/societa', label: 'Società' },
  { to: '/superadmin/piani', label: 'Piani' },
];

export default function SuperAdminLayout() {
  return <AppLayout navItems={NAV_ITEMS} showBell={false} />;
}
