import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

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
  const showAreas = roles.includes('user');
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resetTarget, setResetTarget] = useState(null); // utente per cui reimpostare la password
  const [areasTarget, setAreasTarget] = useState(null); // utente per cui riassegnare le aree

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
            {showAreas && <th>Aree</th>}
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
                {showAreas && <td>{u.areas?.length ? u.areas.map((a) => a.name).join(', ') : '-'}</td>}
                <td>{u.initialCode || '-'}</td>
                <td>{u.mustChangePassword ? 'In attesa di primo accesso' : 'Attivo'}</td>
                <td className="actions-cell">
                  {manageable ? (
                    <>
                      {showAreas && (
                        <button className="table-action" onClick={() => setAreasTarget(u)}>
                          Modifica aree
                        </button>
                      )}
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
              <td colSpan={showAreas ? 8 : 7} className="hint">
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

      {areasTarget && (
        <UserAreasModal
          targetUser={areasTarget}
          onClose={() => setAreasTarget(null)}
          onDone={() => {
            setAreasTarget(null);
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

// Multi-select delle aree operative della società (raggruppate per sede), per riassegnare in
// qualsiasi momento a quali calendari ha accesso un dipendente esistente.
function UserAreasModal({ targetUser, onClose, onDone }) {
  const { token } = useAuth();
  const [sediWithAreas, setSediWithAreas] = useState([]);
  const [selectedAreaIds, setSelectedAreaIds] = useState((targetUser.areas || []).map((a) => a.id));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .listSedi(token)
      .then(async ({ sedi }) => {
        const grouped = await Promise.all(
          sedi.map(async (sede) => {
            const { areas } = await api.listAreas(sede.id, token);
            return { sede, areas };
          })
        );
        setSediWithAreas(grouped);
      })
      .catch((err) => setError(err.message));
  }, [token]);

  function toggleArea(areaId) {
    setSelectedAreaIds((ids) => (ids.includes(areaId) ? ids.filter((id) => id !== areaId) : [...ids, areaId]));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.updateUserAreas(targetUser.id, selectedAreaIds, token);
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
        <h2>Aree operative di {targetUser.username}</h2>

        {sediWithAreas.every((g) => g.areas.length === 0) ? (
          <p className="hint">Nessuna area operativa configurata in questa società.</p>
        ) : (
          sediWithAreas.map(
            ({ sede, areas }) =>
              areas.length > 0 && (
                <div key={sede.id} className="area-picker-group">
                  <p className="hint">{sede.name}</p>
                  <div className="checkbox-grid">
                    {areas.map((a) => (
                      <label key={a.id} className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={selectedAreaIds.includes(a.id)}
                          onChange={() => toggleArea(a.id)}
                        />
                        {a.name}
                      </label>
                    ))}
                  </div>
                </div>
              )
          )
        )}

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </form>
    </div>
  );
}
