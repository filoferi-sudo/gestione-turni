import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import FirstAccessSetup from './pages/FirstAccessSetup';
import AdminDashboard from './pages/AdminDashboard';
import DirigenteDashboard from './pages/DirigenteDashboard';
import EmployeeDashboardRouter from './pages/employee/EmployeeDashboardRouter';
import CreateUser from './pages/CreateUser';
import SuperAdminDashboard from './pages/superadmin/SuperAdminDashboard';

const ROLE_HOME = { admin: '/admin', dirigente: '/dirigente', user: '/dashboard', superadmin: '/superadmin' };

function RoleHome() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={ROLE_HOME[user.role] || '/dashboard'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/first-access" element={<FirstAccessSetup />} />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requireRole="user">
            <EmployeeDashboardRouter />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute requireRole="admin">
            <AdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin/users/new"
        element={
          <ProtectedRoute requireRole="admin">
            <CreateUser />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dirigente"
        element={
          <ProtectedRoute requireRole="dirigente">
            <DirigenteDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dirigente/users/new"
        element={
          <ProtectedRoute requireRole="dirigente">
            <CreateUser />
          </ProtectedRoute>
        }
      />

      <Route
        path="/superadmin"
        element={
          <ProtectedRoute requireRole="superadmin">
            <SuperAdminDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<RoleHome />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
