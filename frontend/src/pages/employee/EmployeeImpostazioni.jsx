import MyProfile from '../../components/profile/MyProfile';

// Sezione Impostazioni del dipendente: dati del proprio account, disponibilità dichiarate
// (lette dal motore di compatibilità delle sostituzioni) e periodi di opt-out "Non partecipare".
// Tutto self-service, invariato rispetto a prima (componente MyProfile riusato integralmente).
export default function EmployeeImpostazioni() {
  return (
    <>
      <h1>Impostazioni</h1>
      <p className="subtitle">
        Il tuo profilo, le tue disponibilità settimanali e i periodi in cui non vuoi ricevere richieste di
        sostituzione.
      </p>

      <MyProfile />
    </>
  );
}
