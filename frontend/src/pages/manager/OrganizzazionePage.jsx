import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Sezione "Organizzazione" del Dirigente (layer SaaS): panoramica del piano e dei consumi della
// propria società + gestione dei permessi granulari dei responsabili (RBAC con override). Il piano
// è impostato dal Super Admin (qui è in sola lettura); i permessi del team sono di competenza del
// Dirigente. Riservata al Dirigente (gli endpoint permessi sono requireDirigente).
export default function OrganizzazionePage() {
  const { token, user, entitlements } = useAuth();
  const [users, setUsers] = useState([]);
  const [sediCount, setSediCount] = useState(0);
  const [auditLogs, setAuditLogs] = useState([]);
  const [billing, setBilling] = useState(null); // { enabled, ... } | null
  const [billingPlans, setBillingPlans] = useState([]);
  const [error, setError] = useState('');
  const [permModal, setPermModal] = useState(null); // { user } | null

  function load() {
    Promise.all([api.listUsers(token), api.listSedi(token)])
      .then(([{ users }, { sedi }]) => {
        setUsers(users);
        setSediCount(sedi.length);
      })
      .catch((err) => setError(err.message));
    // Registro attività: best-effort, un errore qui non deve svuotare la pagina.
    api.listAuditLogs(token, { limit: 15 }).then(({ logs }) => setAuditLogs(logs)).catch(() => {});
    // Stato billing (Step 8): la card abbonamento compare solo se i pagamenti sono attivi.
    api.getBillingStatus(token)
      .then((s) => {
        setBilling(s);
        if (s.enabled) api.listBillingPlans(token).then(({ plans }) => setBillingPlans(plans)).catch(() => {});
      })
      .catch(() => setBilling(null));
  }

  useEffect(load, [token]);

  async function handleCheckout(planId) {
    try {
      const { url } = await api.createBillingCheckout(planId, token);
      if (url) window.location.href = url;
    } catch (err) {
      setError(err.message);
    }
  }

  if (user.role !== 'dirigente') {
    return (
      <>
        <h1>Organizzazione</h1>
        <div className="card"><p className="hint">Questa sezione è riservata al Dirigente.</p></div>
      </>
    );
  }

  const responsabili = users.filter((u) => u.role === 'admin');
  const usage = {
    employees: users.filter((u) => u.role === 'user').length,
    managers: responsabili.length,
    sedi: sediCount,
  };
  const limits = (entitlements && entitlements.limits) || {};
  const features = (entitlements && entitlements.features) || {};

  return (
    <>
      <h1>Organizzazione</h1>
      {error && <div className="error">{error}</div>}

      <section className="card" data-tour="org-plan">
        <h2>Piano attuale</h2>
        <p>
          <strong>{(entitlements && entitlements.planName) || 'Piano non assegnato'}</strong>
          {entitlements && entitlements.status && <span className="badge" style={{ marginLeft: 8 }}>{entitlements.status}</span>}
        </p>

        <h3 className="modal-subhead">Utilizzo</h3>
        <div className="dash-grid">
          <UsageTile label="Dipendenti" used={usage.employees} limit={limits.maxEmployees} />
          <UsageTile label="Responsabili" used={usage.managers} limit={limits.maxManagers} />
          <UsageTile label="Sedi" used={usage.sedi} limit={limits.maxSedi} />
        </div>

        <h3 className="modal-subhead">Funzioni incluse</h3>
        <ul className="org-features">
          {FEATURE_LABELS.map(([key, label]) => (
            <li key={key} className={features[key] === false ? 'org-feature-off' : 'org-feature-on'}>
              {features[key] === false ? '✕' : '✓'} {label}
            </li>
          ))}
        </ul>
        <p className="hint">Il piano e i limiti sono gestiti dall'amministratore della piattaforma.</p>
      </section>

      <section className="card">
        <h2>Permessi dei responsabili</h2>
        <p className="hint">
          Personalizza cosa può fare ciascun responsabile. In assenza di modifiche vale il comportamento
          predefinito del ruolo.
        </p>
        <table className="table">
          <thead>
            <tr><th>Responsabile</th><th>Email</th><th>Azioni</th></tr>
          </thead>
          <tbody>
            {responsabili.map((u) => (
              <tr key={u.id}>
                <td>{u.username}</td>
                <td>{u.email}</td>
                <td className="actions-cell">
                  <button className="table-action" onClick={() => setPermModal({ user: u })}>Permessi</button>
                </td>
              </tr>
            ))}
            {responsabili.length === 0 && (
              <tr><td colSpan={3} className="hint">Nessun responsabile. Creane uno dalla sezione Personale.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {billing && billing.enabled && (
        <section className="card">
          <h2>Abbonamento</h2>
          <p className="hint">
            Piano attuale: <strong>{billing.planName || '—'}</strong>. Scegli un piano per attivare o
            cambiare l'abbonamento (verrai reindirizzato al pagamento sicuro).
          </p>
          <table className="table">
            <thead>
              <tr><th>Piano</th><th>Descrizione</th><th></th></tr>
            </thead>
            <tbody>
              {billingPlans.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.description || '—'}</td>
                  <td className="actions-cell">
                    <button className="table-action" disabled={!p.hasPrice || p.code === billing.planCode} onClick={() => handleCheckout(p.id)}>
                      {p.code === billing.planCode ? 'Piano attuale' : p.hasPrice ? 'Passa a questo piano' : 'Prezzo non configurato'}
                    </button>
                  </td>
                </tr>
              ))}
              {billingPlans.length === 0 && (
                <tr><td colSpan={3} className="hint">Nessun piano acquistabile disponibile.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <h2>Registro attività</h2>
        <p className="hint">Le operazioni recenti della società (accessi, gestione account, piano, permessi).</p>
        <table className="table">
          <thead>
            <tr><th>Quando</th><th>Chi</th><th>Azione</th></tr>
          </thead>
          <tbody>
            {auditLogs.map((l) => (
              <tr key={l.id}>
                <td>{new Date(l.createdAt).toLocaleString('it-IT')}</td>
                <td>{l.actorUsername || '—'}</td>
                <td>{ACTION_LABELS[l.action] || l.action}</td>
              </tr>
            ))}
            {auditLogs.length === 0 && (
              <tr><td colSpan={3} className="hint">Nessuna attività registrata.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {permModal && (
        <PermissionsModal user={permModal.user} token={token} onClose={() => setPermModal(null)} />
      )}
    </>
  );
}

// Etichette leggibili per le azioni di audit più comuni (fallback = codice grezzo).
const ACTION_LABELS = {
  'auth.login': 'Accesso effettuato',
  'auth.login_failed': 'Accesso fallito',
  'user.create': 'Creazione account',
  'user.delete': 'Eliminazione account',
  'user.reset_password': 'Reset password',
  'user.regenerate_code': 'Nuovo codice di accesso',
  'user.update_areas': 'Modifica aree',
  'user.set_permissions': 'Modifica permessi',
  'plan.limit_reached': 'Limite del piano raggiunto',
  'subscription.set': 'Piano aggiornato',
  'shift.create': 'Creazione turno',
  'shift.update': 'Modifica turno',
  'shift.delete': 'Eliminazione turno',
  'cancellation.approve': 'Cancellazione approvata',
  'cancellation.reject': 'Cancellazione rifiutata',
};

const FEATURE_LABELS = [
  ['reports', 'Report analisi del personale'],
  ['substitutionEngine', 'Motore compatibilità + proposte mirate'],
  ['emailAutomation', 'Automazioni email e storico'],
];

function UsageTile({ label, used, limit }) {
  const hasLimit = limit !== undefined && limit !== null;
  const atLimit = hasLimit && used >= limit;
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {used}{hasLimit ? ` / ${limit}` : ''}
      </span>
      <span className="hint">{hasLimit ? (atLimit ? 'Limite raggiunto' : 'Entro il limite') : 'Illimitato'}</span>
    </div>
  );
}

// Matrice permessi di un responsabile: per ogni permesso override 'Predefinito / Consentito / Negato'.
function PermissionsModal({ user, token, onClose }) {
  const [permissions, setPermissions] = useState([]);
  const [choices, setChoices] = useState({}); // key -> 'default'|'allow'|'deny'
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getUserPermissions(user.id, token)
      .then(({ permissions }) => {
        setPermissions(permissions);
        const init = {};
        for (const p of permissions) init[p.key] = p.override === null ? 'default' : p.override ? 'allow' : 'deny';
        setChoices(init);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [user.id, token]);

  async function handleSave() {
    setError('');
    const overrides = {};
    for (const p of permissions) {
      if (!p.overridable) continue;
      const sel = choices[p.key];
      overrides[p.key] = sel === 'allow' ? true : sel === 'deny' ? false : null;
    }
    setSubmitting(true);
    try {
      await api.setUserPermissions(user.id, overrides, token);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Permessi di "{user.username}"</h2>
        {loading ? (
          <p className="hint">Caricamento…</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>Permesso</th><th>Predefinito</th><th>Impostazione</th></tr>
            </thead>
            <tbody>
              {permissions.map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  <td>{p.default ? 'Consentito' : 'Negato'}</td>
                  <td>
                    <select
                      value={choices[p.key]}
                      disabled={!p.overridable}
                      onChange={(e) => setChoices((c) => ({ ...c, [p.key]: e.target.value }))}
                    >
                      <option value="default">Predefinito ({p.default ? 'consentito' : 'negato'})</option>
                      <option value="allow">Consentito</option>
                      <option value="deny">Negato</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>Annulla</button>
          <button type="button" disabled={submitting || loading} onClick={handleSave}>
            {submitting ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </div>
    </div>
  );
}
