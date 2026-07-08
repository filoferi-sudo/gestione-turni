import { useAuth } from '../../context/AuthContext';
import { useManagerWorkspace } from '../../context/ManagerWorkspaceContext';
import SediManagement from '../dirigente/SediManagement';
import AreasManagement from '../../components/areas/AreasManagement';
import SubstitutionSettingsCard from '../../components/management/SubstitutionSettingsCard';

// Sezione Impostazioni per Dirigente/Responsabile. Il Dirigente gestisce la struttura della
// società (sedi, aree operative, regole aziendali come l'escalation delle Sostituzioni); il
// Responsabile qui trova solo i propri dati account, perché la gestione struttura è riservata
// al Dirigente (permesso deliberato, vedi PROJECT_CONTEXT.md). Predisposta per future
// impostazioni (notifiche automatiche, email, integrazioni...): ogni nuova card si aggiunge qui
// senza toccare la navigazione.
export default function ImpostazioniPage() {
  const { user } = useAuth();
  const { sedi, selectedSedeId, setSelectedSedeId, reloadSedi, reloadAreas, sediLoading } = useManagerWorkspace();
  const isDirigente = user.role === 'dirigente';

  return (
    <>
      <h1>Impostazioni</h1>

      <section className="card">
        <h2>Il mio account</h2>
        <dl className="profile-list">
          <div className="profile-row">
            <dt>Username</dt>
            <dd>{user.username}</dd>
          </div>
          <div className="profile-row">
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div className="profile-row">
            <dt>Telefono</dt>
            <dd>{user.phone || '-'}</dd>
          </div>
          <div className="profile-row">
            <dt>Ruolo</dt>
            <dd>{isDirigente ? 'Dirigente' : 'Responsabile'}</dd>
          </div>
        </dl>
      </section>

      {isDirigente ? (
        <>
          <SediManagement
            sedi={sedi}
            selectedSedeId={selectedSedeId}
            setSelectedSedeId={setSelectedSedeId}
            onReload={reloadSedi}
          />

          {!sediLoading && selectedSedeId && <AreasManagement sedeId={selectedSedeId} onChange={reloadAreas} />}

          <SubstitutionSettingsCard />
        </>
      ) : (
        <section className="card">
          <h2>Struttura della società</h2>
          <p className="hint">
            Sedi, aree operative e regole aziendali (es. escalation delle Sostituzioni) sono gestite dal
            Dirigente della tua società.
          </p>
        </section>
      )}
    </>
  );
}
