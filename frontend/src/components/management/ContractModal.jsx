import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Tipologie suggerite (decisione: testo libero + preset). Non è un elenco chiuso: il campo resta
// libero, questi valori compaiono solo come suggerimenti nel <datalist>, così aggiungere una
// tipologia non richiede modifiche al backend/schema.
const CONTRACT_TYPE_PRESETS = [
  'Full time',
  'Part time',
  'Apprendistato',
  'Tempo determinato',
  'Tempo indeterminato',
];

// I campi numerici del form: chiave (nome campo API), etichetta, unità e se è intero.
const NUMERIC_FIELDS = [
  { key: 'maxWeeklyHours', label: 'Ore max settimanali', step: '0.5' },
  { key: 'minWeeklyHours', label: 'Ore min settimanali', step: '0.5' },
  { key: 'maxMonthlyHours', label: 'Ore max mensili', step: '0.5' },
  { key: 'maxDailyHours', label: 'Ore max giornaliere', step: '0.5' },
  { key: 'maxConsecutiveDays', label: 'Giorni consecutivi max', step: '1' },
  { key: 'weeklyRestDays', label: 'Giorni di riposo settimanali', step: '1' },
];

const EMPTY_FORM = {
  contractType: '',
  maxWeeklyHours: '',
  minWeeklyHours: '',
  maxMonthlyHours: '',
  maxDailyHours: '',
  maxConsecutiveDays: '',
  weeklyRestDays: '',
  note: '',
};

// Converte un valore numerico ricevuto dal backend (number | null) in stringa per l'input
// controllato (null -> '', così il campo resta vuoto = "nessun vincolo").
function toInput(value) {
  return value === null || value === undefined ? '' : String(value);
}

export default function ContractModal({ targetUser, onClose, onDone }) {
  const { token } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getUserContract(targetUser.id, token)
      .then(({ contract }) => {
        if (!active) return;
        if (contract) {
          setForm({
            contractType: contract.contractType || '',
            maxWeeklyHours: toInput(contract.maxWeeklyHours),
            minWeeklyHours: toInput(contract.minWeeklyHours),
            maxMonthlyHours: toInput(contract.maxMonthlyHours),
            maxDailyHours: toInput(contract.maxDailyHours),
            maxConsecutiveDays: toInput(contract.maxConsecutiveDays),
            weeklyRestDays: toInput(contract.weeklyRestDays),
            note: contract.note || '',
          });
        }
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [targetUser.id, token]);

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      // I campi vuoti vengono inviati come '' e il backend li normalizza a null (nessun vincolo).
      await api.saveUserContract(targetUser.id, form, token);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form className="modal-card modal-card-wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Contratto di {targetUser.username}</h2>
        <p className="hint">
          Tutti i campi sono facoltativi: lasciandone uno vuoto non viene applicato alcun vincolo su
          quel parametro. Questi dati aiuteranno a suggerire le sostituzioni più compatibili.
        </p>

        {loading ? (
          <p className="hint">Caricamento...</p>
        ) : (
          <>
            <label htmlFor="contract-type">Tipo contratto</label>
            <input
              id="contract-type"
              list="contract-type-presets"
              value={form.contractType}
              onChange={(e) => setField('contractType', e.target.value)}
              placeholder="Es. Part time, Apprendistato..."
            />
            <datalist id="contract-type-presets">
              {CONTRACT_TYPE_PRESETS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>

            <div className="contract-grid">
              {NUMERIC_FIELDS.map((field) => (
                <div key={field.key} className="contract-field">
                  <label htmlFor={`contract-${field.key}`}>{field.label}</label>
                  <input
                    id={`contract-${field.key}`}
                    type="number"
                    min="0"
                    step={field.step}
                    value={form[field.key]}
                    onChange={(e) => setField(field.key, e.target.value)}
                  />
                </div>
              ))}
            </div>

            <label htmlFor="contract-note">Vincoli aziendali / note</label>
            <textarea
              id="contract-note"
              rows={3}
              value={form.note}
              onChange={(e) => setField('note', e.target.value)}
              placeholder="Vincoli specifici, preferenze contrattuali, ecc."
            />
          </>
        )}

        {error && <div className="error">{error}</div>}

        <div className="modal-actions">
          <button type="button" className="button-secondary" onClick={onClose}>
            Annulla
          </button>
          <button type="submit" disabled={submitting || loading}>
            {submitting ? 'Salvataggio...' : 'Salva'}
          </button>
        </div>
      </form>
    </div>
  );
}
