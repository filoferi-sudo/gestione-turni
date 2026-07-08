import { Link } from 'react-router-dom';
import MyCancellationRequests from '../../components/cancellation/MyCancellationRequests';

// Sezione Turni del dipendente: lo stato delle proprie richieste di cancellazione. La richiesta
// si apre dal proprio turno nel Calendario; qui se ne segue l'esito (in attesa / approvata /
// rifiutata). In futuro la sezione potrà ospitare altre viste sui propri turni (es. elenco
// prossimi turni) senza cambiare la navigazione.
export default function EmployeeTurni() {
  return (
    <>
      <h1>Turni</h1>
      <p className="subtitle">
        I tuoi turni sono nel <Link to="/dashboard/calendario">Calendario</Link>: da lì puoi chiedere la
        cancellazione di un turno. Qui vedi lo stato delle richieste inviate.
      </p>

      <MyCancellationRequests />
    </>
  );
}
