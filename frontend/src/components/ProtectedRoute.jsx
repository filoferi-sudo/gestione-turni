import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Logo } from './common/Logo';

// requireRole: se specificato, limita l'accesso al ruolo indicato ('admin' | 'user' | 'dirigente'),
// oppure a un elenco di ruoli ammessi (es. ['admin', 'dirigente'])
export function ProtectedRoute({ children, requireRole }) {
  const { user, token, loading } = useAuth();

  if (loading)
    return (
      <div className="page-center app-loading">
        <Logo size={40} />
        <span className="app-loading-label">Caricamento…</span>
      </div>
    );
  if (!token || !user) return <Navigate to="/login" replace />;

  if (requireRole) {
    const allowedRoles = Array.isArray(requireRole) ? requireRole : [requireRole];
    if (!allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  }

  return children;
}
