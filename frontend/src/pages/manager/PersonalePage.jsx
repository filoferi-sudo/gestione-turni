import { useAuth } from '../../context/AuthContext';
import UserManagementSection from '../../components/management/UserManagementSection';

// Sezione Personale: gestione degli account della società. Il Dirigente vede e crea anche i
// Responsabili; il Responsabile gestisce solo i Dipendenti (stessi permessi di prima, è cambiata
// solo la collocazione). Da qui si accede anche a contratto, disponibilità e aree di ciascun
// dipendente (azioni per riga, invariate dentro UserManagementSection).
export default function PersonalePage() {
  const { user } = useAuth();
  const isDirigente = user.role === 'dirigente';
  const base = isDirigente ? '/dirigente' : '/admin';

  return (
    <>
      <h1>Personale</h1>

      {isDirigente && (
        <UserManagementSection
          roles={['admin']}
          title="Responsabili"
          createHref={`${base}/personale/nuovo`}
          createLabel="Nuovo responsabile"
        />
      )}

      <UserManagementSection
        roles={['user']}
        title="Dipendenti"
        createHref={`${base}/personale/nuovo`}
        createLabel="Nuovo utente"
      />
    </>
  );
}
