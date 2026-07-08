import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

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
    areaIds: [],
  });
  const [sediWithAreas, setSediWithAreas] = useState([]); // [{ sede, areas: Area[] }]
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  // Pagina figlia della sezione Personale (dentro il layout con sidebar): si torna all'elenco.
  const backHref = user.role === 'dirigente' ? '/dirigente/personale' : '/admin/personale';

  // Aree operative disponibili, raggruppate per sede: un dipendente può appartenere a più aree
  // anche di sedi diverse.
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

  function updateField(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  function toggleArea(areaId) {
    setForm((f) => ({
      ...f,
      areaIds: f.areaIds.includes(areaId) ? f.areaIds.filter((id) => id !== areaId) : [...f.areaIds, areaId],
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = { ...form, areaIds: form.role === 'user' ? form.areaIds : undefined };
      const result = await api.createUser(payload, token);
      setCreated(result);
      setForm({ username: '', email: '', phone: '', role: form.role, areaIds: [] });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <h1>{form.role === 'admin' ? 'Nuovo responsabile' : 'Nuovo utente'}</h1>
      <p className="subtitle">
        <Link to={backHref}>← Torna a Personale</Link>
      </p>

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
              <label>Aree operative</label>
              {sediWithAreas.every((g) => g.areas.length === 0) ? (
                <p className="hint">
                  Nessuna area operativa configurata: puoi crearne una dalla gestione sedi, oppure creare comunque il
                  dipendente e assegnargli le aree in un secondo momento.
                </p>
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
                                checked={form.areaIds.includes(a.id)}
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
              <p className="hint">Determina quali calendari vedrà il dipendente dopo l'accesso. Modificabile in seguito.</p>
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
    </>
  );
}
