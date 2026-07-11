import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

const TOKEN_KEY = 'turni_app_token';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Entitlements della società (layer SaaS): piano + feature attive, per adattare la UI (sidebar
  // condizionale, sezione Organizzazione). null finché non caricati / per il super admin (senza
  // società). Il backend resta comunque l'unico punto autoritativo di enforcement.
  const [entitlements, setEntitlements] = useState(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .me(token)
      .then(({ user }) => setUser(user))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
      })
      .finally(() => setLoading(false));
  }, [token]);

  // Carica gli entitlements quando c'è un utente con una società (il super admin non ne ha).
  useEffect(() => {
    if (!token || !user || !user.companyId) {
      setEntitlements(null);
      return;
    }
    api
      .getCompanyEntitlements(token)
      .then(({ entitlements }) => setEntitlements(entitlements))
      .catch(() => setEntitlements(null)); // best-effort: la UI ricade sul default "tutto visibile"
  }, [token, user]);

  // Una feature è considerata attiva se non è esplicitamente disabilitata (default permissivo,
  // coerente col backend). Se gli entitlements non sono ancora caricati, non nascondere nulla.
  function hasFeature(key) {
    if (!entitlements || !entitlements.features) return true;
    return entitlements.features[key] !== false;
  }

  function loginWithToken(newToken, newUser) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  }

  // Ricarica l'utente dal backend (dopo cambi che non passano da un nuovo login: verifica/cambio
  // email, ecc.). Aggiorna in place `user` con i campi freschi (emailVerified/pendingEmail/...).
  async function refreshUser() {
    if (!token) return null;
    const { user: fresh } = await api.me(token);
    setUser(fresh);
    return fresh;
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ token, user, loading, loginWithToken, logout, refreshUser, entitlements, hasFeature }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve essere usato dentro AuthProvider');
  return ctx;
}
