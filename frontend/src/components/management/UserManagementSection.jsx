import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { EMPLOYEE_CATEGORY_LABELS } from '../../constants/employeeCategories';

const ROLE_LABELS = { admin: 'Responsabile', dirigente: 'Dirigente', user: 'Dipendente' };

// Solo il dirigente può gestire account 'admin'/'dirigente'; sugli account 'user' possono
// operare sia responsabili che dirigente. Rispecchia la stessa regola applicata dal backend.
function canManage(currentRole, targetRole) {
  if (targetRole === 'user') return currentRole === 'admin' || currentRole === 'dirigente';
  return currentRole === 'dirigente';
}

// roles: elenco di ruoli da mostrare in questa sezione (es. ['user'] oppure ['admin'])
// createHref/createLabel: opzionali, mostrano un link per creare un nuovo account di quel tipo
export default function UserManagementSection({ roles, title, createHref, createLabel }) {
  const showCategory = roles.includes('user');
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetTarget, setResetTarget] = useState(null); // utente per cui reimpostare la password

  function load() {
    api
      .listUsers(token)
      .then(({ users }) => setUsers(users.filter((u) => roles.includes(u.role))))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  async function handleRegenerateCode(targetUser) {
    setError('');
    setNotice('');
    try {
      const { initialCode } = await api.regenerateCode(targetUser.id, token);
      setNotice(`Nuovo codice per ${targetUser.username}: ${initialCode}`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(targetUser) {
    if (!window.confirm(`Eliminare l'account "${targetUser.username}"? L'operazione non è reversibile.`)) return;
    setError('');
    try {
      await api.deleteUser(targetUser.id, token);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="card">
      <div className="section-header">
        <h2>{title}</h2>
        {createHref && (
          <Link to={createHref} state={{ defaultRole: roles[0] }} className="button-link">
            + {createLabel}
          </Link>
        )}
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      <table className="table">
        <thead>
          <tr>
            <th>Username</th>
            <th>Email</th>
            <th>Telefono</th>
            <th>Ruolo</th>
            {showCategory && <th>Categoria</th>}
            <th>Codice primo accesso</th>
            <th>Stato</th>
            <th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => {
            const manageable = canManage(currentUser.role, u.role);
            return (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td>{u.phone || '-'}</td>
                <td>{ROLE_LABELS[u.role] || u.role}</td>
                {showCategory && <td>{EMPLOYEE_CATEGORY_LABELS[u.category] || '-'}</td>}
                <td>{u.initialCode || '-'}</td>
                <td>{u.mustChangePassword ? 'In attesa di primo accesso' : 'Attivo'}</td>
                <td className="actions-cell">
                  {manageable ? (
                    <>
                      <button className="table-action" onClick={() => setResetTarget(u)}>
                        Reimposta password
                      </button>
                      <button className="table-action" onClick={() => handleRegenerateCode(u)}>
                        Rigenera codice
                      </button>
                      {u.id !== currentUser.id && (
                        <button className="table-action table-action-danger" onClick={() => handleDelete(u)}>
                          Elimina
                        </button>
                      )}
                    </>
                  ) : (
                    <span className="hint">-</span>
                  )}
                </td>
              </tr>
            );
          })}
          {users.length === 0 && (
            <tr>
              <td colSpan={showCategory ? 8 : 7} className="hint">
                Nessun utente in questa categoria.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {resetTarget && (
        <ResetPasswordModal
          targetUser={resetTarget}
          onClose={() => setResetTarget(null)}
          onDone={() => {
            setResetTarget(null);
            load();
          }}
        />
      )}
    </section>
  );
}

function ResetPasswordModal({ targetUser, onClose, onDone }) {
  const { token } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('La password deve avere almeno 8 caratteri');
      return;
    }
    setSubmitting(true);
    try {
      await api.resetPassword(targetUser.id, newPassword, token);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Reimposta password</h2>
        <p className="hint">
          Stai impostando una nuova password per <strong>{targetUser.username}</strong>. Potrà accedere
          subito con questa password.
        </p>

        <label htmlFor="reset-password">Nuova password</label>
        <input
          id="reset-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Salvataggio...' : 'Conferma'}
          </button>
        </div>
      </form>
    </div>
  );
}
