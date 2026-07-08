import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import CancellationRequestsPanel from '../../components/cancellation/CancellationRequestsPanel';

// Sezione Turni per Dirigente/Responsabile: le operazioni sui turni che non sono legate alla
// griglia oraria. Oggi contiene le richieste di cancellazione da approvare/rifiutare; in futuro
// potrà ospitare altre viste (es. storico dei turni cancellati, approvazioni di altro tipo)
// senza toccare la struttura di navigazione. La creazione/modifica dei turni resta nel
// Calendario, dentro l'area operativa di appartenenza.
export default function TurniPage() {
  const { user } = useAuth();
  const base = user.role === 'dirigente' ? '/dirigente' : '/admin';

  return (
    <>
      <h1>Turni</h1>
      <p className="subtitle">
        Per creare o modificare i turni usa il <Link to={`${base}/calendario`}>Calendario</Link>, nella tab
        dell'area operativa. Qui trovi le richieste dei dipendenti da approvare.
      </p>

      <CancellationRequestsPanel />
    </>
  );
}
