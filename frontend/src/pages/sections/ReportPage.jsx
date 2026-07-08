import { useAuth } from '../../context/AuthContext';
import HoursStats from '../../components/stats/HoursStats';

// Sezione Report (tutti i ruoli di società): oggi contiene le statistiche delle ore lavorate
// (vista aggregata per manager, self-service per il dipendente — stesso componente HoursStats,
// il backend forza il filtro per i dipendenti). La sezione è volutamente predisposta a crescere
// (report avanzati, esportazioni, statistiche di copertura) senza cambiare la navigazione.
export default function ReportPage() {
  const { user } = useAuth();
  const isManager = user.role === 'admin' || user.role === 'dirigente';

  return (
    <>
      <h1>Report</h1>
      <p className="subtitle">
        {isManager
          ? 'Statistiche sulle ore lavorate del personale della società.'
          : 'Statistiche sulle tue ore lavorate.'}
      </p>

      <HoursStats />

      <section className="card placeholder">
        <h2>Report avanzati</h2>
        <p className="hint">
          In arrivo: esportazioni, statistiche di copertura del fabbisogno e report periodici. Questa sezione
          è predisposta per ospitarli.
        </p>
      </section>
    </>
  );
}
