import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { EMPLOYEE_CATEGORIES } from '../constants/employeeCategories';

const ROLE_LABELS = { admin: 'Responsabile', dirigente: 'Dirigente', user: 'Dipendente' };

export default function CreateUser() {
  const { token, user } = useAuth();
  const location = useLocation();
  const isDirigente = user.role === 'dirigente';
  const defaultRole = location.state?.defaultRole === 'admin' ? 'admin' : 'user';

  const [form, setForm] = useState({
    username: '',
    email: '',
    phone: '',
    role: defaultRole,
    category: EMPLOYEE_CATEGORIES[0].value,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  const backHref = user.role === 'dirigente' ? '/dirigente' : '/admin';

  function updateField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...form, category: form.role === 'user' ? form.category : undefined };
      const result = await api.createUser(payload, token);
      setCreated(result);
      setForm({ username: '', email: '', phone: '', role: form.role, category: form.category });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <strong>Gestione Turni</strong> <span className="badge badge-admin">{ROLE_LABELS[user.role]}</span>
        </div>
        <Link to={backHref} className="link-button">
          Torna alla dashboard
        </Link>
      </header>

      <main className="content">
        <h1>{form.role === 'admin' ? 'Nuovo responsabile' : 'Nuovo utente'}</h1>

        <form className="card" onSubmit={handleSubmit}>
          {isDirigente && (
            <>
              <label>Ruolo</label>
              <div className="segmented">
                <button
                  type="button"
                  className={form.role === 'user' ? 'active' : ''}
                  onClick={() => setForm((f) => ({ ...f, role: 'user' }))}
                >
                  Dipendente
                </button>
                <button
                  type="button"
                  className={form.role === 'admin' ? 'active' : ''}
                  onClick={() => setForm((f) => ({ ...f, role: 'admin' }))}
                >
                  Responsabile
                </button>
              </div>
            </>
          )}

          {form.role === 'user' && (
            <>
              <label>Categoria</label>
              <div className="segmented">
                {EMPLOYEE_CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={form.category === c.value ? 'active' : ''}
                    onClick={() => setForm((f) => ({ ...f, category: c.value }))}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <p className="hint">
                Determina quale dashboard e quali funzionalità vedrà il dipendente dopo l'accesso.
              </p>
            </>
          )}

          <label htmlFor="username">Username</label>
          <input id="username" value={form.username} onChange={updateField('username')} required />

          <label htmlFor="email">Email</label>
          <input id="email" type="email" value={form.email} onChange={updateField('email')} required />

          <label htmlFor="phone">Telefono</label>
          <input id="phone" value={form.phone} onChange={updateField('phone')} required />

          {error && <div className="error">{error}</div>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Creazione...' : 'Crea utente'}
          </button>
        </form>

        {created && (
          <section className="card success">
            <h2>Utente creato</h2>
            <p>
              Comunica queste credenziali a <strong>{created.user.username}</strong> per il primo accesso:
            </p>
            <p className="code">Codice iniziale: {created.initialCode}</p>
            <p className="hint">Il codice non sarà più visibile dopo il primo accesso dell'utente.</p>
          </section>
        )}
      </main>
    </div>
  );
}
