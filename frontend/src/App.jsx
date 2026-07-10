import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { TourProvider } from './tour/TourProvider';
import Login from './pages/Login';
import FirstAccessSetup from './pages/FirstAccessSetup';
import CreateUser from './pages/CreateUser';

import ManagerLayout from './components/layout/ManagerLayout';
import EmployeeLayout from './components/layout/EmployeeLayout';
import SuperAdminLayout from './components/layout/SuperAdminLayout';

import ManagerDashboard from './pages/manager/ManagerDashboard';
import CalendarioPage from './pages/manager/CalendarioPage';
import TurniPage from './pages/manager/TurniPage';
import PersonalePage from './pages/manager/PersonalePage';
import SostituzioniPage from './pages/manager/SostituzioniPage';
import FabbisognoPage from './pages/manager/FabbisognoPage';
import ImpostazioniPage from './pages/manager/ImpostazioniPage';

import EmployeeHome from './pages/employee/EmployeeHome';
import EmployeeCalendario from './pages/employee/EmployeeCalendario';
import EmployeeTurni from './pages/employee/EmployeeTurni';
import EmployeeSostituzioni from './pages/employee/EmployeeSostituzioni';
import EmployeeImpostazioni from './pages/employee/EmployeeImpostazioni';

import ComunicazioniPage from './pages/sections/ComunicazioniPage';
import ReportPage from './pages/sections/ReportPage';

import SuperAdminHome from './pages/superadmin/SuperAdminHome';
import SocietaPage from './pages/superadmin/SocietaPage';

const ROLE_HOME = { admin: '/admin', dirigente: '/dirigente', user: '/dashboard', superadmin: '/superadmin' };

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME[user.role] || '/dashboard'} replace />;
}

// Le rotte figlie delle due aree manager (Dirigente su /dirigente, Responsabile su /admin) sono
// identiche: stesse pagine di sezione, che adattano internamente i permessi al ruolo (es.
// Impostazioni mostra la gestione sedi/aree solo al Dirigente). Aggiungere una sezione = una
// voce in ManagerLayout + una rotta figlia qui.
function managerRoutes(base) {
  return (
    <>
      <Route index element={<ManagerDashboard />} />
      <Route path="calendario" element={<CalendarioPage />} />
      <Route path="turni" element={<TurniPage />} />
      <Route path="personale" element={<PersonalePage />} />
      <Route path="personale/nuovo" element={<CreateUser />} />
      <Route path="sostituzioni" element={<SostituzioniPage />} />
      <Route path="fabbisogno" element={<FabbisognoPage />} />
      <Route path="comunicazioni" element={<ComunicazioniPage />} />
      <Route path="report" element={<ReportPage />} />
      <Route path="impostazioni" element={<ImpostazioniPage />} />
      {/* Compatibilità con il vecchio percorso di creazione utente */}
      <Route path="users/new" element={<Navigate to={`${base}/personale/nuovo`} replace />} />
      <Route path="*" element={<Navigate to={base} replace />} />
    </>
  );
}

export default function App() {
  return (
    <TourProvider>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/first-access" element={<FirstAccessSetup />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requireRole="user">
            <EmployeeLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<EmployeeHome />} />
        <Route path="calendario" element={<EmployeeCalendario />} />
        <Route path="turni" element={<EmployeeTurni />} />
        <Route path="sostituzioni" element={<EmployeeSostituzioni />} />
        <Route path="comunicazioni" element={<ComunicazioniPage />} />
        <Route path="report" element={<ReportPage />} />
        <Route path="impostazioni" element={<EmployeeImpostazioni />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>

      <Route
        path="/admin"
        element={
          <ProtectedRoute requireRole="admin">
            <ManagerLayout base="/admin" />
          </ProtectedRoute>
        }
      >
        {managerRoutes('/admin')}
      </Route>

      <Route
        path="/dirigente"
        element={
          <ProtectedRoute requireRole="dirigente">
            <ManagerLayout base="/dirigente" />
          </ProtectedRoute>
        }
      >
        {managerRoutes('/dirigente')}
      </Route>

      <Route
        path="/superadmin"
        element={
          <ProtectedRoute requireRole="superadmin">
            <SuperAdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<SuperAdminHome />} />
        <Route path="societa" element={<SocietaPage />} />
        <Route path="*" element={<Navigate to="/superadmin" replace />} />
      </Route>

      <Route path="/" element={<RoleHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TourProvider>
  );
}
