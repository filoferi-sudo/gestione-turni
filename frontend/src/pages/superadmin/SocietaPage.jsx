import { useEffect, useRef, useState } from 'react';
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
  const [dirigentiModal, setDirigentiModal] = useState(null); // { company } | null
  // Esito di creazione dirigente / rigenerazione codice: { user, company, initialCode, regenerated }
  const [credentials, setCredentials] = useState(null);

  function load() {
    api.listCompanies(token).then(({ companies }) => setCompanies(companies)).catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  async function handleSaveCompany(payload) {
    if (companyModal.company) {
      await api.updateCompany(companyModal.company.id, payload, token);
      setCompanyModal(null);
    } else {
      // Società nuova: si prosegue subito con il primo dirigente, così l'onboarding non resta a metà.
      // Se lo si rimanda (o fallisce), la società resta creata una sola volta e si riprende da
      // "+ Dirigente" sulla sua riga, senza ricrearla.
      const { company } = await api.createCompany(payload, token);
      setCompanyModal(null);
      setDirigenteModal({ company, afterCompanyCreate: true });
    }
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

  // Prima il codice iniziale finiva in una riga di notifica in cima alla pagina, facile da perdere
  // e non più recuperabile: ora apre un riepilogo dedicato che va chiuso esplicitamente.
  async function handleCreateDirigente(payload) {
    const result = await api.createCompanyDirigente(dirigenteModal.company.id, payload, token);
    setDirigenteModal(null);
    setNotice('');
    setCredentials({ ...result, regenerated: false });
    load();
  }

  function handleRegenerated(result) {
    setDirigentiModal(null);
    setCredentials({ ...result, regenerated: true });
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
                <td>
                  {c.dirigentiCount > 0 ? (
                    <button
                      className="table-action"
                      title="Stato di accesso dei dirigenti e nuovo codice di primo accesso"
                      onClick={() => setDirigentiModal({ company: c })}
                    >
                      {c.dirigentiCount} · Gestisci
                    </button>
                  ) : (
                    <span className="hint">Nessuno</span>
                  )}
                </td>
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
          afterCompanyCreate={dirigenteModal.afterCompanyCreate}
          onSave={handleCreateDirigente}
          onClose={() => setDirigenteModal(null)}
        />
      )}

      {dirigentiModal && (
        <DirigentiModal
          company={dirigentiModal.company}
          token={token}
          onRegenerated={handleRegenerated}
          onClose={() => setDirigentiModal(null)}
        />
      )}

      {credentials && <CredentialsModal result={credentials} onClose={() => setCredentials(null)} />}

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

function DirigenteFormModal({ company, afterCompanyCreate, onSave, onClose }) {
  const [form, setForm] = useState({ username: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Guardia sincrona contro il doppio invio (doppio clic/Invio prima che `submitting` sia renderizzato).
  const inFlight = useRef(false);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setError('');
    setSubmitting(true);
    try {
      await onSave({ username: form.username.trim(), email: form.email.trim(), phone: form.phone.trim() });
    } catch (err) {
      setError(err.message);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{afterCompanyCreate ? 'Primo dirigente' : 'Nuovo dirigente'} per "{company.name}"</h2>
        {afterCompanyCreate && (
          <p className="notice">
            Società creata. Ora crea il suo primo dirigente: riceverai il codice di primo accesso da consegnargli.
          </p>
        )}

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

        {afterCompanyCreate && (
          <p className="hint">Puoi farlo anche più tardi con "+ Dirigente" sulla riga della società.</p>
        )}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            {afterCompanyCreate ? 'Più tardi' : 'Annulla'}
          </button>
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creazione...' : 'Crea dirigente'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const DIRIGENTE_STATUS = {
  pending_first_access: { label: 'In attesa del primo accesso', className: 'request-status-pending' },
  active: { label: 'Attivo', className: 'request-status-approved' },
};

// Elenco dei dirigenti di una società con lo stato di attivazione. È il punto di recupero
// dell'onboarding: se il codice iniziale è andato perso (o il dirigente ha bloccato l'account con
// troppi tentativi) il Super Admin genera un nuovo codice, senza creare un secondo account.
function DirigentiModal({ company, token, onRegenerated, onClose }) {
  const [dirigenti, setDirigenti] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api
      .listCompanyDirigenti(company.id, token)
      .then(({ dirigenti }) => setDirigenti(dirigenti))
      .catch((err) => setError(err.message));
  }, [company.id, token]);

  async function handleRegenerate(d) {
    const message =
      d.status === 'active'
        ? `"${d.username}" ha già una password personale. Generando un nuovo codice la password attuale ` +
          'verrà invalidata e dovrà rifare il primo accesso. Continuare?'
        : `Generare un nuovo codice di primo accesso per "${d.username}"? Il codice precedente non sarà più valido.`;
    if (!window.confirm(message)) return;
    setError('');
    setBusyId(d.id);
    try {
      const result = await api.regenerateDirigenteCode(company.id, d.id, token);
      onRegenerated(result);
    } catch (err) {
      setError(err.message);
      setBusyId(null);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Dirigenti di "{company.name}"</h2>

        {error && <div className="error">{error}</div>}
        {!dirigenti && !error && <p className="hint">Caricamento…</p>}

        {dirigenti && (
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {dirigenti.map((d) => {
                const status = DIRIGENTE_STATUS[d.status];
                return (
                  <tr key={d.id}>
                    <td>{d.username}</td>
                    <td>{d.email}</td>
                    <td>
                      <span className={`request-status ${status.className}`}>{status.label}</span>
                      {d.locked && (
                        <span className="request-status request-status-rejected" title="Troppi tentativi falliti">
                          Bloccato
                        </span>
                      )}
                    </td>
                    <td>
                      <button className="table-action" disabled={busyId !== null} onClick={() => handleRegenerate(d)}>
                        {busyId === d.id ? 'Generazione...' : 'Nuovo codice'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Chiudi
          </button>
        </div>
      </div>
    </Modal>
  );
}

function loginUrl() {
  return `${window.location.origin}${import.meta.env.BASE_URL}login`;
}

// Riepilogo delle credenziali di primo accesso del dirigente. Il codice è mostrato solo qui, una
// volta: il modale non si chiude con un clic fuori o con ESC (perderlo per sbaglio era proprio il
// problema), ma solo con il pulsante esplicito. Nessuna email viene inviata: lo si dice chiaramente.
function CredentialsModal({ result, onClose }) {
  const { user, company, initialCode, regenerated } = result;
  const [copied, setCopied] = useState(false);

  const instructions =
    `Accesso a Planivo per ${company.name}\n` +
    `Indirizzo: ${loginUrl()}\n` +
    `Username: ${user.username}\n` +
    `Codice di primo accesso: ${initialCode}\n\n` +
    'Al primo accesso inserisci lo username e, nel campo password, il codice qui sopra: ' +
    'ti verrà chiesto di scegliere la tua password personale. Il codice vale una sola volta.';

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(instructions);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Modal onClose={KEEP_OPEN}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{regenerated ? 'Nuovo codice generato' : 'Dirigente creato'}</h2>
        <p>
          Consegna queste credenziali a <strong>{user.username}</strong> per il primo accesso a{' '}
          <strong>{company.name}</strong>.
        </p>

        <table className="table">
          <tbody>
            <tr><th>Società</th><td>{company.name}</td></tr>
            <tr><th>Username di accesso</th><td>{user.username}</td></tr>
            <tr><th>Email</th><td>{user.email}</td></tr>
            <tr>
              <th>Stato account</th>
              <td>
                <span className="request-status request-status-pending">In attesa del primo accesso</span>
              </td>
            </tr>
            <tr><th>Indirizzo di accesso</th><td>{loginUrl()}</td></tr>
          </tbody>
        </table>

        <label>Codice di primo accesso</label>
        <p className="code" data-testid="initial-code">{initialCode}</p>

        <ol className="hint">
          <li>Il dirigente apre l'indirizzo di accesso.</li>
          <li>Inserisce lo username e, nel campo password, il codice qui sopra.</li>
          <li>Sceglie la propria password personale: da quel momento il codice non vale più.</li>
        </ol>

        {company.isActive === false && (
          <div className="error">
            La società è disattivata: il dirigente non potrà accedere finché non la riattivi.
          </div>
        )}

        <p className="hint">
          Nessuna email è stata inviata: consegna tu queste credenziali tramite un canale sicuro. Il codice non
          sarà più mostrato dopo la chiusura di questa finestra; se va perso, generane uno nuovo da
          "Dirigenti → Gestisci".
        </p>

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={handleCopy}>
            {copied ? 'Copiato!' : 'Copia istruzioni'}
          </button>
          <button type="button" onClick={onClose}>
            Fatto, credenziali consegnate
          </button>
        </div>
      </div>
    </Modal>
  );
}

// Callback stabile (il Modal ri-esegue il proprio effetto se onClose cambia identità).
function KEEP_OPEN() {}
