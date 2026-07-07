import { useAuth } from '../../context/AuthContext';
import { EMPLOYEE_CATEGORY_LABELS } from '../../constants/employeeCategories';

// Scheda di sola lettura con i dati del proprio account. Condivisa da tutte le categorie di
// dipendente (bagnino, istruttore, e quelle future): non contiene nulla di specifico per una
// singola categoria.
export default function MyProfile() {
  const { user } = useAuth();

  return (
    <section className="card">
      <h2>Profilo personale</h2>
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
        {user.category && (
          <div className="profile-row">
            <dt>Categoria</dt>
            <dd>{EMPLOYEE_CATEGORY_LABELS[user.category] || user.category}</dd>
          </div>
        )}
      </dl>
    </section>
  );
}
