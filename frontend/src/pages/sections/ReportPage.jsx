import { useAuth } from '../../context/AuthContext';
import ManagerReport from '../../components/reports/ManagerReport';
import EmployeeReport from '../../components/reports/EmployeeReport';

// Sezione Report: strumento di analisi del personale.
// - Responsabile/Dirigente: vista generale di tutti i dipendenti (schede riepilogative) con filtri
//   per periodo/sede/area/dipendente, e scheda dettaglio per ciascuno (ore, richieste, statistiche
//   operative, confronto periodi, alert informativi).
// - Dipendente: vede solo i propri dati (self-service), stessa scheda dettaglio.
// Tutti i dati sono aggregati da tabelle già esistenti (turni, contratti, richieste): nessun
// sistema parallelo. Il Report raccoglie e organizza dati oggettivi — non valuta i dipendenti né
// prende decisioni HR: la decisione finale resta sempre al responsabile.
export default function ReportPage() {
  const { user } = useAuth();
  const isManager = user.role === 'admin' || user.role === 'dirigente';

  return (
    <>
      <h1>Report</h1>
      <p className="subtitle">
        {isManager
          ? 'Analisi operativa del personale: ore, contratto, turni e richieste per periodo.'
          : 'Analisi delle tue ore, dei tuoi turni e delle tue richieste per periodo.'}
      </p>

      {isManager ? <ManagerReport /> : <EmployeeReport />}
    </>
  );
}
