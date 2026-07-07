import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { addDays, formatRangeLabel, getWeekDays } from '../../utils/dates';
import { usePolling } from '../../hooks/usePolling';
import StaffingScheduleModal from './StaffingScheduleModal';
import StaffingSingleModal from './StaffingSingleModal';
import StaffingOccurrenceModal from './StaffingOccurrenceModal';

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_LABELS = { MON: 'Lun', TUE: 'Mar', WED: 'Mer', THU: 'Gio', FRI: 'Ven', SAT: 'Sab', SUN: 'Dom' };

function weekdayLabel(dateStr) {
  return WEEKDAY_LABELS[DAY_CODES[new Date(`${dateStr}T00:00:00`).getDay()]];
}

// Pannello riepilogativo del fabbisogno di personale di un'area "Turni": non è un calendario (non
// tocca CalendarGrid/ShiftBlock), mostra la settimana corrente occorrenza per occorrenza con la
// copertura calcolata dal backend (staffingCoverage.computeCoverage). areaId: area operativa
// (obbligatoria, calendar_mode='shifts'). areaName: opzionale, per disambiguare più aree Turni.
export default function StaffingPanel({ areaId, areaName }) {
  const { token } = useAuth();
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [requirements, setRequirements] = useState([]);
  const [coverage, setCoverage] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyKey, setBusyKey] = useState(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [singleModalState, setSingleModalState] = useState(null); // { requirement } | null
  const [occurrenceModalState, setOccurrenceModalState] = useState(null); // { requirement, occurrence }

  const days = getWeekDays(referenceDate);
  const start = days[0].date;
  const end = days[days.length - 1].date;

  const requirementsById = new Map(requirements.map((r) => [r.id, r]));

  function load() {
    Promise.all([api.listStaffingRequirements(areaId, token), api.getStaffingCoverage(token, { areaId, start, end })])
      .then(([reqRes, covRes]) => {
        setRequirements(reqRes.requirements);
        setCoverage(covRes.coverage);
      })
      .catch((err) => setError(err.message));
  }

  useEffect(load, [areaId, start, end, token]);

  // Aggiornamenti quasi in tempo reale: la copertura cambia quando altri utenti accettano
  // Sostituzioni o quando cambia un turno assegnato. Sospeso mentre uno dei modali di modifica è
  // aperto; il refetch riprende comunque subito alla chiusura (vedi ciascun onClose sotto).
  usePolling(load, {
    intervalMs: 10000,
    enabled: !scheduleModalOpen && !singleModalState && !occurrenceModalState,
  });

  function goPrev() {
    setReferenceDate((d) => addDays(d, -7));
  }
  function goNext() {
    setReferenceDate((d) => addDays(d, 7));
  }
  function goToday() {
    setReferenceDate(new Date());
  }

  async function handleGenerateGap(occ) {
    setError('');
    setNotice('');
    const key = `${occ.requirementId}-${occ.date}`;
    setBusyKey(key);
    try {
      const { created } = await api.generateStaffingGap(occ.requirementId, occ.date, token);
      setNotice(
        created > 0
          ? `Create ${created} sostituzioni disponibili per il ${occ.date}.`
          : 'Nessuna sostituzione da creare: il fabbisogno risulta già coperto o già pubblicato.'
      );
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyKey(null);
    }
  }

  function handleOccurrenceClick(occ) {
    const requirement = requirementsById.get(occ.requirementId);
    if (!requirement) return;
    if (requirement.reqType === 'single') {
      setSingleModalState({ requirement });
    } else {
      setOccurrenceModalState({ requirement, occurrence: occ });
    }
  }

  return (
    <section className="card">
      <div className="section-header">
        <h2>Fabbisogno di personale{areaName ? ` — ${areaName}` : ''}</h2>
        <div className="calendar-admin-controls">
          <button onClick={() => setScheduleModalOpen(true)}>Gestisci fabbisogno settimanale</button>
          <button onClick={() => setSingleModalState({ requirement: null })}>+ Fabbisogno singolo</button>
        </div>
      </div>

      <div className="calendar-nav">
        <button onClick={goPrev}>&larr;</button>
        <button onClick={goToday}>Oggi</button>
        <button onClick={goNext}>&rarr;</button>
        <span className="calendar-range-label">{formatRangeLabel(days)}</span>
      </div>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {coverage.length === 0 ? (
        <p className="hint">Nessun fabbisogno configurato per questa settimana in quest'area.</p>
      ) : (
        <ul className="shift-list">
          {coverage.map((occ) => {
            const key = `${occ.requirementId}-${occ.date}`;
            const covered = occ.assignedUsers.length + occ.openSlots;
            return (
              <li key={key} className="shift-list-item">
                <span>
                  <strong>
                    {weekdayLabel(occ.date)} {occ.date}
                  </strong>{' '}
                  · {occ.startTime}-{occ.endTime} · Copertura: {covered}/{occ.requiredCount}
                  {occ.assignedUsers.length > 0 && (
                    <span className="hint"> · {occ.assignedUsers.map((u) => u.username).join(', ')}</span>
                  )}
                  {occ.openSlots > 0 && <span className="hint"> · {occ.openSlots} già pubblicati come sostituzione</span>}
                  {occ.missingSlots > 0 && <span className="badge badge-warning"> ⚠️ {occ.missingSlots} posti scoperti</span>}
                </span>
                <span>
                  {occ.missingSlots > 0 && (
                    <button disabled={busyKey === key} onClick={() => handleGenerateGap(occ)}>
                      {busyKey === key ? 'Attendere...' : 'Genera sostituzioni'}
                    </button>
                  )}
                  <button className="button-secondary" onClick={() => handleOccurrenceClick(occ)}>
                    Modifica
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {scheduleModalOpen && (
        <StaffingScheduleModal
          areaId={areaId}
          onClose={() => {
            setScheduleModalOpen(false);
            load();
          }}
          onSaved={() => {
            setScheduleModalOpen(false);
            load();
          }}
        />
      )}

      {singleModalState && (
        <StaffingSingleModal
          areaId={areaId}
          requirement={singleModalState.requirement}
          onClose={() => {
            setSingleModalState(null);
            load();
          }}
          onSaved={() => {
            setSingleModalState(null);
            load();
          }}
          onDeleted={() => {
            setSingleModalState(null);
            load();
          }}
        />
      )}

      {occurrenceModalState && (
        <StaffingOccurrenceModal
          requirement={occurrenceModalState.requirement}
          occurrence={occurrenceModalState.occurrence}
          onClose={() => {
            setOccurrenceModalState(null);
            load();
          }}
          onSaved={() => {
            setOccurrenceModalState(null);
            load();
          }}
        />
      )}
    </section>
  );
}
