import AppLayout from './AppLayout';
import { ManagerWorkspaceProvider, useManagerWorkspace } from '../../context/ManagerWorkspaceContext';

// Le sezioni dell'area manager (stesse voci per Dirigente e Responsabile: le differenze di
// permesso vivono dentro le singole pagine, es. Impostazioni mostra la gestione struttura solo
// al Dirigente). `end: true` sulla Dashboard evita che resti evidenziata su tutte le sottopagine.
const SECTIONS = [
  { path: '', label: 'Dashboard', end: true },
  { path: 'calendario', label: 'Calendario' },
  { path: 'turni', label: 'Turni' },
  { path: 'personale', label: 'Personale' },
  { path: 'sostituzioni', label: 'Sostituzioni' },
  { path: 'fabbisogno', label: 'Fabbisogno' },
  { path: 'comunicazioni', label: 'Comunicazioni' },
  { path: 'report', label: 'Report' },
  { path: 'impostazioni', label: 'Impostazioni' },
];

// Selettore della sede attiva, sempre visibile nella sidebar: la scelta vale per tutte le
// sezioni (Calendario, Sostituzioni, Fabbisogno, Impostazioni) ed è persistita in localStorage
// tramite useSedeSelection. Con una sola sede mostra solo il nome, senza select.
function SedeSwitcher() {
  const { sedi, selectedSedeId, setSelectedSedeId, sediLoading } = useManagerWorkspace();

  if (sediLoading || sedi.length === 0) return null;

  return (
    <div className="sidebar-sede">
      <label htmlFor="sidebar-sede-select">Sede</label>
      {sedi.length === 1 ? (
        <span className="sidebar-sede-name">{sedi[0].name}</span>
      ) : (
        <select
          id="sidebar-sede-select"
          value={selectedSedeId || ''}
          onChange={(e) => setSelectedSedeId(Number(e.target.value))}
        >
          {sedi.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

// base: '/dirigente' oppure '/admin' — stesse pagine, rotte separate per ruolo (vedi App.jsx).
export default function ManagerLayout({ base }) {
  const navItems = SECTIONS.map((s) => ({
    to: s.path ? `${base}/${s.path}` : base,
    label: s.label,
    end: s.end,
    // Gancio stabile per il Tour Guidato, indipendente dal ruolo/base (la home è 'nav-dashboard').
    tourId: `nav-${s.path || 'dashboard'}`,
  }));

  return (
    <ManagerWorkspaceProvider>
      <AppLayout navItems={navItems} sidebarExtra={<SedeSwitcher />} />
    </ManagerWorkspaceProvider>
  );
}
