import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Il super admin gestisce solo l'anagrafica delle società (crea, modifica, attiva/disattiva,
// crea il primo dirigente) e vede statistiche aggregate: non entra mai nel calendario turni/corsi
// di una specifica società, che resta di esclusiva competenza di quella società.
export default function SuperAdminDashboard() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [companies, setCompanies] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [companyModal, setCompanyModal] = useState(null); // { company } | null
  const [dirigenteModal, setDirigenteModal] = useState(null); // { company } | null

  function handleLogout() {
    logout();
    navigate('/login');
  }

  function load() {
    api.listCompanies(token).then(({ companies }) => setCompanies(companies)).catch((err) => setError(err.message));
    api.getPlatformStats(token).then(setStats).catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  async function handleSaveCompany(payload) {
    if (companyModal.company) {
      await api.updateCompany(companyModal.company.id, payload, token);
    } else {
      await api.createCompany(payload, token);
    }
    setCompanyModal(null);
    load();
  }

  async function handleToggleActive(company) {
    setError('');
    setNotice('');
    try {
      await api.updateCompany(company.id, { isActive: !company.isActive }, token);
      setNotice(`"${company.name}" ${company.isActive ? 'disattivata' : 'riattivata'}.`);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleCreateDirigente(payload) {
    const result = await api.createCompanyDirigente(dirigenteModal.company.id, payload, token);
    setDirigenteModal(null);
    setNotice(
      `Dirigente "${result.user.username}" creato per "${dirigenteModal.company.name}". ` +
        `Codice iniziale: ${result.initialCode}`
    );
    load();
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <strong>Gestione Turni</strong> <span className="badge badge-admin">Super Admin</span>
        </div>
        <button className="link-button" onClick={handleLogout}>
          Esci
        </button>
      </header>

      <main className="content content-wide">
        <h1>Ciao, {user.username}</h1>

        {error && <div className="error">{error}</div>}
        {notice && <div className="notice">{notice}</div>}

        {stats && (
          <section className="card">
            <h2>Statistiche piattaforma</h2>
            <dl className="profile-list">
              <div className="profile-row">
                <dt>Società totali</dt>
                <dd>{stats.companiesTotal}</dd>
              </div>
              <div className="profile-row">
                <dt>Società attive</dt>
                <dd>{stats.companiesActive}</dd>
              </div>
              <div className="profile-row">
                <dt>Dirigenti</dt>
                <dd>{stats.usersByRole.dirigente}</dd>
              </div>
              <div className="profile-row">
                <dt>Responsabili</dt>
                <dd>{stats.usersByRole.admin}</dd>
              </div>
              <div className="profile-row">
                <dt>Dipendenti</dt>
                <dd>{stats.usersByRole.user}</dd>
              </div>
              <div className="profile-row">
                <dt>Utenti totali</dt>
                <dd>{stats.usersTotal}</dd>
              </div>
            </dl>
          </section>
        )}

        <section className="card">
          <div className="section-header">
            <h2>Società</h2>
            <button className="button-link" onClick={() => setCompanyModal({ company: null })}>
              + Nuova società
            </button>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Email</th>
                <th>Telefono</th>
                <th>Stato</th>
                <th>Dirigenti</th>
                <th>Utenti totali</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.email || '-'}</td>
                  <td>{c.phone || '-'}</td>
                  <td>
                    <span className={`request-status ${c.isActive ? 'request-status-approved' : 'request-status-rejected'}`}>
                      {c.isActive ? 'Attiva' : 'Disattivata'}
                    </span>
                  </td>
                  <td>{c.dirigentiCount}</td>
                  <td>{c.usersCount}</td>
                  <td className="actions-cell">
                    <button className="table-action" onClick={() => setCompanyModal({ company: c })}>
                      Modifica
                    </button>
                    <button className="table-action" onClick={() => setDirigenteModal({ company: c })}>
                      + Dirigente
                    </button>
                    <button
                      className={`table-action ${c.isActive ? 'table-action-danger' : ''}`}
                      onClick={() => handleToggleActive(c)}
                    >
                      {c.isActive ? 'Disattiva' : 'Riattiva'}
                    </button>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={7} className="hint">
                    Nessuna società ancora creata.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>

      {companyModal && (
        <CompanyFormModal
          company={companyModal.company}
          onSave={handleSaveCompany}
          onClose={() => setCompanyModal(null)}
        />
      )}

      {dirigenteModal && (
        <DirigenteFormModal
          company={dirigenteModal.company}
          onSave={handleCreateDirigente}
          onClose={() => setDirigenteModal(null)}
        />
      )}
    </div>
  );
}

function CompanyFormModal({ company, onSave, onClose }) {
  const [form, setForm] = useState({
    name: company?.name || '',
    email: company?.email || '',
    phone: company?.phone || '',
    address: company?.address || '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) {
      setError('Il nome della società è obbligatorio');
      return;
    }
    setSubmitting(true);
    try {
      await onSave({
        name: form.name.trim(),
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{company ? 'Modifica società' : 'Nuova società'}</h2>

        <label htmlFor="company-name">Nome</label>
        <input id="company-name" value={form.name} onChange={(e) => update('name', e.target.value)} required />

        <label htmlFor="company-email">Email (opzionale)</label>
        <input id="company-email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} />

        <label htmlFor="company-phone">Telefono (opzionale)</label>
        <input id="company-phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} />

        <label htmlFor="company-address">Indirizzo (opzionale)</label>
        <input id="company-address" value={form.address} onChange={(e) => update('address', e.target.value)} />

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

function DirigenteFormModal({ company, onSave, onClose }) {
  const [form, setForm] = useState({ username: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await onSave(form);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Nuovo dirigente per "{company.name}"</h2>

        <label htmlFor="dirigente-username">Username</label>
        <input id="dirigente-username" value={form.username} onChange={(e) => update('username', e.target.value)} required />

        <label htmlFor="dirigente-email">Email</label>
        <input
          id="dirigente-email"
          type="email"
          value={form.email}
          onChange={(e) => update('email', e.target.value)}
          required
        />

        <label htmlFor="dirigente-phone">Telefono</label>
        <input id="dirigente-phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} required />

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creazione...' : 'Crea dirigente'}
          </button>
        </div>
      </form>
    </div>
  );
}
