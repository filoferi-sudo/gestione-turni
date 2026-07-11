import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/common/Modal';

// Sezione Società del Super Admin: anagrafica delle società della piattaforma (creazione,
// modifica, attivazione/disattivazione, creazione del primo dirigente). Il Super Admin non entra
// mai nei dati operativi di una società (decisione esplicita, vedi PROJECT_CONTEXT.md).
export default function SocietaPage() {
  const { token } = useAuth();

  const [companies, setCompanies] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [companyModal, setCompanyModal] = useState(null); // { company } | null
  const [dirigenteModal, setDirigenteModal] = useState(null); // { company } | null
  const [subscriptionModal, setSubscriptionModal] = useState(null); // { company } | null

  function load() {
    api.listCompanies(token).then(({ companies }) => setCompanies(companies)).catch((err) => setError(err.message));
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
    <>
      <h1>Società</h1>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

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
              <th>Piano</th>
              <th>Dirigenti</th>
              <th>Utenti totali</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id}>
                <td>
                  {c.name}
                  {c.isDemo && <span className="demo-tag" title="Ambiente dimostrativo, escluso dalle statistiche">Demo</span>}
                </td>
                <td>{c.email || '-'}</td>
                <td>{c.phone || '-'}</td>
                <td>
                  <span
                    className={`request-status ${c.isActive ? 'request-status-approved' : 'request-status-rejected'}`}
                  >
                    {c.isActive ? 'Attiva' : 'Disattivata'}
                  </span>
                </td>
                <td>{c.planName || <span className="hint">—</span>}</td>
                <td>{c.dirigentiCount}</td>
                <td>{c.usersCount}</td>
                <td className="actions-cell">
                  <button className="table-action" onClick={() => setCompanyModal({ company: c })}>
                    Modifica
                  </button>
                  <button className="table-action" onClick={() => setSubscriptionModal({ company: c })}>
                    Piano
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
                <td colSpan={8} className="hint">
                  Nessuna società ancora creata.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

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

      {subscriptionModal && (
        <SubscriptionModal
          company={subscriptionModal.company}
          token={token}
          onSaved={() => { setSubscriptionModal(null); setNotice('Piano aggiornato.'); load(); }}
          onClose={() => setSubscriptionModal(null)}
        />
      )}
    </>
  );
}

// Assegnazione del piano a una società + override per-cliente + consumi correnti (layer SaaS).
function SubscriptionModal({ company, token, onSaved, onClose }) {
  const [plans, setPlans] = useState([]);
  const [catalog, setCatalog] = useState({ limits: {}, features: {} });
  const [usage, setUsage] = useState(null);
  const [entitlements, setEntitlements] = useState(null);
  const [form, setForm] = useState({ planId: '', status: 'active' });
  const [limitOverrides, setLimitOverrides] = useState({}); // key -> string ('' = nessun override)
  const [featureOverrides, setFeatureOverrides] = useState({}); // key -> 'inherit'|'on'|'off'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([api.listPlans(token), api.getPlanCatalog(token), api.getCompanySubscription(company.id, token)])
      .then(([{ plans }, cat, sub]) => {
        setPlans(plans);
        setCatalog({ limits: cat.limits || {}, features: cat.features || {} });
        setUsage(sub.usage);
        setEntitlements(sub.entitlements);
        const s = sub.subscription;
        setForm({ planId: s ? String(s.planId) : '', status: s ? s.status : 'active' });
        const lo = {};
        for (const k of Object.keys(cat.limits || {})) lo[k] = s && s.limitOverrides && s.limitOverrides[k] != null ? String(s.limitOverrides[k]) : '';
        setLimitOverrides(lo);
        const fo = {};
        for (const k of Object.keys(cat.features || {})) {
          const v = s && s.featureOverrides ? s.featureOverrides[k] : undefined;
          fo[k] = v === true ? 'on' : v === false ? 'off' : 'inherit';
        }
        setFeatureOverrides(fo);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [company.id, token]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!form.planId) return setError('Seleziona un piano');

    const limitOverridesPayload = {};
    for (const [k, raw] of Object.entries(limitOverrides)) {
      if (raw !== '' && raw !== null && raw !== undefined) {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) return setError(`Override "${catalog.limits[k].label}" non valido`);
        limitOverridesPayload[k] = n;
      }
    }
    const featureOverridesPayload = {};
    for (const [k, v] of Object.entries(featureOverrides)) {
      if (v === 'on') featureOverridesPayload[k] = true;
      else if (v === 'off') featureOverridesPayload[k] = false;
    }

    setSubmitting(true);
    try {
      await api.setCompanySubscription(company.id, {
        planId: Number(form.planId),
        status: form.status,
        limitOverrides: limitOverridesPayload,
        featureOverrides: featureOverridesPayload,
      }, token);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Piano di "{company.name}"</h2>

        {loading ? (
          <p className="hint">Caricamento…</p>
        ) : (
          <>
            {usage && (
              <p className="hint">
                Consumi attuali: {usage.employees} dipendenti · {usage.managers} responsabili · {usage.sedi} sedi.
              </p>
            )}

            <label htmlFor="sub-plan">Piano</label>
            <select id="sub-plan" value={form.planId} onChange={(e) => setForm((f) => ({ ...f, planId: e.target.value }))} required>
              <option value="">— Seleziona —</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.isActive}>
                  {p.name}{!p.isActive ? ' (disattivato)' : ''}
                </option>
              ))}
            </select>

            <label htmlFor="sub-status">Stato</label>
            <select id="sub-status" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="active">Attivo</option>
              <option value="trialing">In prova</option>
              <option value="past_due">Pagamento scaduto</option>
              <option value="canceled">Annullato</option>
            </select>

            <h3 className="modal-subhead">Override limiti (opzionale, vuoto = come da piano)</h3>
            <div className="contract-grid">
              {Object.entries(catalog.limits).map(([k, meta]) => (
                <div key={k}>
                  <label htmlFor={`ov-${k}`}>{meta.label}</label>
                  <input
                    id={`ov-${k}`}
                    type="number"
                    min="0"
                    value={limitOverrides[k] ?? ''}
                    placeholder="Come da piano"
                    onChange={(e) => setLimitOverrides((l) => ({ ...l, [k]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <h3 className="modal-subhead">Override funzioni (opzionale)</h3>
            <div className="contract-grid">
              {Object.entries(catalog.features).map(([k, meta]) => (
                <div key={k}>
                  <label htmlFor={`fo-${k}`}>{meta.label}</label>
                  <select id={`fo-${k}`} value={featureOverrides[k] ?? 'inherit'} onChange={(e) => setFeatureOverrides((f) => ({ ...f, [k]: e.target.value }))}>
                    <option value="inherit">Come da piano</option>
                    <option value="on">Forza attiva</option>
                    <option value="off">Forza disattivata</option>
                  </select>
                </div>
              ))}
            </div>
          </>
        )}

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>Annulla</button>
          <button type="submit" disabled={submitting || loading}>{submitting ? 'Salvataggio...' : 'Salva'}</button>
        </div>
      </form>
    </Modal>
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
    <Modal onClose={onClose}>
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
    </Modal>
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
    <Modal onClose={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Nuovo dirigente per "{company.name}"</h2>

        <label htmlFor="dirigente-username">Username</label>
        <input
          id="dirigente-username"
          value={form.username}
          onChange={(e) => update('username', e.target.value)}
          required
        />

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
    </Modal>
  );
}
