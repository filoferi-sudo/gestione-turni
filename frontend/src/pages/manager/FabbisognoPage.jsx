import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useManagerWorkspace } from '../../context/ManagerWorkspaceContext';
import StaffingWeeklySlotsModal from '../../components/staffing/StaffingWeeklySlotsModal';
import StaffingSingleModal from '../../components/staffing/StaffingSingleModal';

// Sezione Fabbisogno per Dirigente/Responsabile: punto d'ingresso dedicato alla pianificazione
// del fabbisogno di personale per area operativa (solo aree turni). Riusa invariati gli stessi
// modali già raggiungibili dalla toolbar del Calendario: qui si definiscono le regole (fasce
// fisse settimanali e fabbisogni singoli), mentre la copertura giorno per giorno resta visibile
// nel Calendario (chip sopra la griglia oraria) — scelta deliberata, vedi PROJECT_CONTEXT.md
// ("Copertura integrata direttamente nel calendario turni").
export default function FabbisognoPage() {
  const { user } = useAuth();
  const { areas, areasError, selectedSede } = useManagerWorkspace();
  const base = user.role === 'dirigente' ? '/dirigente' : '/admin';

  const [weeklyModalAreaId, setWeeklyModalAreaId] = useState(null);
  const [singleModalAreaId, setSingleModalAreaId] = useState(null);

  const shiftAreas = areas.filter((a) => a.calendarMode === 'shifts');

  return (
    <>
      <h1>Fabbisogno di personale{selectedSede ? ` — ${selectedSede.name}` : ''}</h1>
      <p className="subtitle">
        Qui definisci quante persone servono in ogni area e fascia oraria. La copertura effettiva
        (chi c'è, chi manca, "Genera" per pubblicare le Sostituzioni mancanti) è mostrata nel{' '}
        <Link to={`${base}/calendario`}>Calendario</Link>, sopra la griglia oraria.
      </p>

      {areasError && <div className="error">{areasError}</div>}

      {shiftAreas.length === 0 ? (
        <section className="card">
          <p className="hint">
            Il fabbisogno si applica solo alle aree operative con calendario a turni: in questa sede non ce ne
            sono.
          </p>
        </section>
      ) : (
        shiftAreas.map((area) => (
          <section className="card" key={area.id}>
            <div className="section-header">
              <h2>{area.name}</h2>
              <div className="shift-item-actions">
                <button type="button" onClick={() => setWeeklyModalAreaId(area.id)}>
                  Gestisci fabbisogno settimanale
                </button>
                <button type="button" onClick={() => setSingleModalAreaId(area.id)}>
                  + Fabbisogno singolo
                </button>
              </div>
            </div>
            <p className="hint">
              Le fasce fisse si ripetono ogni settimana (più fasce indipendenti in parallelo sono supportate);
              il fabbisogno singolo copre un'esigenza straordinaria per una sola data.
            </p>
          </section>
        ))
      )}

      {weeklyModalAreaId && (
        <StaffingWeeklySlotsModal areaId={weeklyModalAreaId} onClose={() => setWeeklyModalAreaId(null)} />
      )}

      {singleModalAreaId && (
        <StaffingSingleModal
          areaId={singleModalAreaId}
          requirement={null}
          onClose={() => setSingleModalAreaId(null)}
          onSaved={() => setSingleModalAreaId(null)}
          onDeleted={() => setSingleModalAreaId(null)}
        />
      )}
    </>
  );
}
