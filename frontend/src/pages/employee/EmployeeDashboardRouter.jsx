import { useAuth } from '../../context/AuthContext';
import BagninoDashboard from './BagninoDashboard';
import IstruttoreDashboard from './IstruttoreDashboard';

// Unico punto in cui si decide quale dashboard mostrare a un dipendente in base alla categoria.
// Per aggiungere una nuova categoria (reception, segreteria, personal trainer, ...): creare il
// componente dashboard dedicato e registrarlo qui con la stessa chiave usata in
// constants/employeeCategories.js — nessun'altra parte del sistema (routing, permessi, layout
// generale) deve cambiare.
const DASHBOARD_BY_CATEGORY = {
  bagnino: BagninoDashboard,
  istruttore: IstruttoreDashboard,
};

export default function EmployeeDashboardRouter() {
  const { user } = useAuth();
  // Fallback su BagninoDashboard per account creati prima dell'introduzione delle categorie
  // (category null) o con una categoria non riconosciuta: nessuna regressione per chi già esiste.
  const Dashboard = DASHBOARD_BY_CATEGORY[user.category] || BagninoDashboard;
  return <Dashboard />;
}
