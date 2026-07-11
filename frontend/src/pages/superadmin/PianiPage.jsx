import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import Modal from '../../components/common/Modal';

// Sezione Piani del Super Admin (layer SaaS): crea/modifica i piani commerciali. I VALORI (limiti,
// feature incluse) sono interamente configurabili qui a runtime — non esistono valori commerciali
// hardcoded nel codice. Le chiavi configurabili arrivano dal catalogo del backend
// (GET /api/plans/catalog), così aggiungere una chiave lato server la fa comparire qui senza
// modifiche al frontend.
export default function PianiPage() {
  const { token } = useAuth();
  const [plans, setPlans] = useState([]);
  const [catalog, setCatalog] = useState({ limits: {}, features: {} });
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null); // { plan } | null

  function load() {
    Promise.all([api.listPlans(token), api.getPlanCatalog(token)])
      .then(([{ plans }, cat]) => {
        setPlans(plans);
        setCatalog({ limits: cat.limits || {}, features: cat.features || {} });
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  async function handleSave(payload) {
    if (modal.plan) {
      await api.updatePlan(modal.plan.id, payload, token);
    } else {
      await api.createPlan(payload, token);
    }
    setModal(null);
    load();
  }

  return (
    <>
      <h1>Piani</h1>
      <p className="hint">
        I piani sono configurabili: limiti e funzioni incluse si impostano qui e valgono subito, senza
        interventi tecnici. Un limite lasciato vuoto significa «illimitato».
      </p>

      {error && <div className="error">{error}</div>}

      <section className="card">
        <div className="section-header">
          <h2>Catalogo piani</h2>
          <button className="button-link" onClick={() => setModal({ plan: null })}>
            + Nuovo piano
          </button>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Codice</th>
              <th>Listino</th>
              <th>Stato</th>
              <th>Limiti</th>
              <th>Funzioni</th>
              <th>Società</th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td><code>{p.code}</code></td>
                <td>{p.isPublic ? 'Pubblico' : 'Interno'}</td>
                <td>
                  <span className={`request-status ${p.isActive ? 'request-status-approved' : 'request-status-rejected'}`}>
                    {p.isActive ? 'Attivo' : 'Disattivato'}
                  </span>
                </td>
                <td>{summarizeLimits(p.limits, catalog.limits)}</td>
                <td>{summarizeFeatures(p.features, catalog.features)}</td>
                <td>{p.companiesCount ?? 0}</td>
                <td className="actions-cell">
                  <button className="table-action" onClick={() => setModal({ plan: p })}>Modifica</button>
                </td>
              </tr>
            ))}
            {plans.length === 0 && (
              <tr><td colSpan={8} className="hint">Nessun piano ancora creato.</td></tr>
            )}
          </tbody>
        </table>
      </section>

      {modal && (
        <PlanFormModal plan={modal.plan} catalog={catalog} onSave={handleSave} onClose={() => setModal(null)} />
      )}
    </>
  );
}

function summarizeLimits(limits, catalogLimits) {
  const keys = Object.keys(catalogLimits);
  const set = keys.filter((k) => limits && limits[k] !== undefined && limits[k] !== null);
  if (set.length === 0) return <span className="hint">Illimitato</span>;
  return set.map((k) => `${catalogLimits[k].label}: ${limits[k]}`).join(' · ');
}

function summarizeFeatures(features, catalogFeatures) {
  const keys = Object.keys(catalogFeatures);
  const disabled = keys.filter((k) => features && features[k] === false);
  if (disabled.length === 0) return <span className="hint">Tutte incluse</span>;
  return `Escluse: ${disabled.map((k) => catalogFeatures[k].label).join(', ')}`;
}

function PlanFormModal({ plan, catalog, onSave, onClose }) {
  const limitKeys = Object.entries(catalog.limits);
  const featureKeys = Object.entries(catalog.features);

  const [form, setForm] = useState({
    code: plan?.code || '',
    name: plan?.name || '',
    description: plan?.description || '',
    isPublic: plan ? plan.isPublic : true,
    isActive: plan ? plan.isActive : true,
    displayOrder: plan?.displayOrder ?? 0,
    externalPriceRef: plan?.externalPriceRef || '',
  });
  // Limiti come stringhe (input): vuoto = illimitato. Feature come booleani: default = inclusa
  // (assente o != false).
  const [limits, setLimits] = useState(() => {
    const init = {};
    for (const [k] of limitKeys) init[k] = plan && plan.limits && plan.limits[k] != null ? String(plan.limits[k]) : '';
    return init;
  });
  const [features, setFeatures] = useState(() => {
    const init = {};
    for (const [k] of featureKeys) init[k] = !(plan && plan.features && plan.features[k] === false);
    return init;
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) { setForm((f) => ({ ...f, [field]: value })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!plan && !form.code.trim()) return setError('Il codice è obbligatorio');
    if (!form.name.trim()) return setError('Il nome è obbligatorio');

    // Limiti: includo solo le chiavi valorizzate (le altre = illimitato). Feature: esplicite true/false.
    const limitsPayload = {};
    for (const [k] of limitKeys) {
      const raw = limits[k];
      if (raw !== '' && raw !== null && raw !== undefined) {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0) return setError(`"${catalog.limits[k].label}" deve essere un intero ≥ 0 (o vuoto)`);
        limitsPayload[k] = n;
      }
    }
    const featuresPayload = {};
    for (const [k] of featureKeys) featuresPayload[k] = features[k] === true;

    const payload = {
      name: form.name.trim(),
      description: form.description || null,
      isPublic: form.isPublic,
      isActive: form.isActive,
      displayOrder: Number(form.displayOrder) || 0,
      limits: limitsPayload,
      features: featuresPayload,
      externalPriceRef: form.externalPriceRef.trim() || null,
    };
    if (!plan) payload.code = form.code.trim().toLowerCase();

    setSubmitting(true);
    try {
      await onSave(payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <form className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{plan ? `Modifica piano "${plan.name}"` : 'Nuovo piano'}</h2>

        {!plan && (
          <>
            <label htmlFor="plan-code">Codice (identificatore stabile, non modificabile dopo)</label>
            <input id="plan-code" value={form.code} onChange={(e) => update('code', e.target.value)} placeholder="es. starter" required />
          </>
        )}

        <label htmlFor="plan-name">Nome</label>
        <input id="plan-name" value={form.name} onChange={(e) => update('name', e.target.value)} required />

        <label htmlFor="plan-desc">Descrizione (opzionale)</label>
        <input id="plan-desc" value={form.description} onChange={(e) => update('description', e.target.value)} />

        <label htmlFor="plan-price">Riferimento prezzo per i pagamenti (es. Stripe Price ID, opzionale)</label>
        <input id="plan-price" value={form.externalPriceRef} onChange={(e) => update('externalPriceRef', e.target.value)} placeholder="price_..." />

        <div className="checkbox-grid">
          <label className="checkbox-label">
            <input type="checkbox" checked={form.isPublic} onChange={(e) => update('isPublic', e.target.checked)} />
            In listino (pubblico)
          </label>
          <label className="checkbox-label">
            <input type="checkbox" checked={form.isActive} onChange={(e) => update('isActive', e.target.checked)} />
            Attivo (assegnabile)
          </label>
        </div>

        <h3 className="modal-subhead">Limiti (vuoto = illimitato)</h3>
        <div className="contract-grid">
          {limitKeys.map(([k, meta]) => (
            <div key={k}>
              <label htmlFor={`limit-${k}`}>{meta.label}</label>
              <input
                id={`limit-${k}`}
                type="number"
                min="0"
                value={limits[k]}
                placeholder="Illimitato"
                onChange={(e) => setLimits((l) => ({ ...l, [k]: e.target.value }))}
              />
            </div>
          ))}
          {limitKeys.length === 0 && <span className="hint">Nessun limite configurabile.</span>}
        </div>

        <h3 className="modal-subhead">Funzioni incluse</h3>
        <div className="checkbox-grid">
          {featureKeys.map(([k, meta]) => (
            <label key={k} className="checkbox-label">
              <input
                type="checkbox"
                checked={features[k] === true}
                onChange={(e) => setFeatures((f) => ({ ...f, [k]: e.target.checked }))}
              />
              {meta.label}
            </label>
          ))}
          {featureKeys.length === 0 && <span className="hint">Nessuna funzione configurabile.</span>}
        </div>

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>Annulla</button>
          <button type="submit" disabled={submitting}>{submitting ? 'Salvataggio...' : 'Salva'}</button>
        </div>
      </form>
    </Modal>
  );
}
