import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import StaffingScheduleModal from './StaffingScheduleModal';
import Modal from '../common/Modal';

const WEEKDAYS = [
  { code: 'MON', label: 'Lun' },
  { code: 'TUE', label: 'Mar' },
  { code: 'WED', label: 'Mer' },
  { code: 'THU', label: 'Gio' },
  { code: 'FRI', label: 'Ven' },
  { code: 'SAT', label: 'Sab' },
  { code: 'SUN', label: 'Dom' },
];

// Raggruppa le righe 'fixed' (una per giorno della settimana) in "fasce" indipendenti: tutte le
// righe aperte (effective_until assente per semplicità di editing, si modificano comunque tutte)
// con lo stesso orario appartengono alla stessa fascia — stesso criterio usato lato backend per
// sostituire solo la fascia interessata (vedi staffingController.upsertWeeklySchedule). Nessuna
// tabella/colonna dedicata a "fascia": è un raggruppamento solo di visualizzazione.
function groupIntoSlots(requirements) {
  const bySlot = new Map();
  for (const r of requirements) {
    if (r.reqType !== 'fixed') continue;
    const key = `${r.startTime}|${r.endTime}`;
    if (!bySlot.has(key)) {
      bySlot.set(key, { startTime: r.startTime, endTime: r.endTime, effectiveFrom: r.effectiveFrom, note: r.note, counts: {} });
    }
    const slot = bySlot.get(key);
    slot.counts[r.weekday] = r.requiredCount;
    if (r.effectiveFrom < slot.effectiveFrom) slot.effectiveFrom = r.effectiveFrom;
  }
  return [...bySlot.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function weekdaySummary(counts) {
  return WEEKDAYS.filter((d) => counts[d.code] > 0)
    .map((d) => `${d.label} ${counts[d.code]}`)
    .join(' · ');
}

// Elenco delle fasce fisse settimanali indipendenti di un'area (un'area può averne più di una,
// es. mattina/sera): sostituisce il vecchio editor unico che sostituiva sempre l'intera
// programmazione dell'area. Ogni fascia si crea/modifica/elimina senza toccare le altre.
export default function StaffingWeeklySlotsModal({ areaId, onClose }) {
  const { token } = useAuth();
  const [requirements, setRequirements] = useState([]);
  const [error, setError] = useState('');
  const [formSlot, setFormSlot] = useState(undefined); // undefined = lista, null = nuova, {...} = modifica
  const [changed, setChanged] = useState(false);

  function load() {
    api
      .listStaffingRequirements(areaId, token)
      .then(({ requirements }) => setRequirements(requirements))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [areaId, token]);

  const slots = groupIntoSlots(requirements);

  function handleClose() {
    onClose(changed);
  }

  if (formSlot !== undefined) {
    return (
      <StaffingScheduleModal
        areaId={areaId}
        slot={formSlot}
        onClose={() => setFormSlot(undefined)}
        onSaved={() => {
          setChanged(true);
          setFormSlot(undefined);
          load();
        }}
      />
    );
  }

  return (
    <Modal onClose={handleClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Fasce fisse settimanali</h2>
        <p className="hint">
          Ogni fascia è una regola ricorrente indipendente (es. mattina e sera): puoi averne quante ne servono nella
          stessa area, anche nello stesso giorno.
        </p>

        {error && <div className="error">{error}</div>}

        {slots.length === 0 ? (
          <p className="hint">Nessuna fascia fissa configurata in quest'area.</p>
        ) : (
          <ul className="shift-list">
            {slots.map((slot) => (
              <li key={`${slot.startTime}-${slot.endTime}`} className="shift-list-item">
                <span>
                  <strong>
                    {slot.startTime}-{slot.endTime}
                  </strong>{' '}
                  · {weekdaySummary(slot.counts) || 'nessun giorno attivo'}
                </span>
                <span>
                  <button className="button-secondary" onClick={() => setFormSlot(slot)}>
                    Modifica
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button type="button" onClick={() => setFormSlot(null)}>
            + Nuova fascia fissa
          </button>
          <button type="button" className="button-secondary" onClick={handleClose}>
            Chiudi
          </button>
        </div>
      </div>
    </Modal>
  );
}
