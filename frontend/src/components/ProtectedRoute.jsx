import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// requireRole: se specificato, limita l'accesso al ruolo indicato ('admin' | 'user' | 'dirigente'),
// oppure a un elenco di ruoli ammessi (es. ['admin', 'dirigente'])
export function ProtectedRoute({ children, requireRole }) {
  const { user, token, loading } = useAuth();

  if (loading) return <div className="page-center">Caricamento...</div>;
  if (!token || !user) return <Navigate to="/login" replace />;

  if (requireRole) {
    const allowedRoles = Array.isArray(requireRole) ? requireRole : [requireRole];
    if (!allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  }

  return children;
}
