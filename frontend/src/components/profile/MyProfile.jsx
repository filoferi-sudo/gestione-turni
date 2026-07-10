import { useAuth } from '../../context/AuthContext';
import AvailabilityEditor from './AvailabilityEditor';
import OptOutEditor from './OptOutEditor';
import EmailManager from './EmailManager';
import NotificationPreferences from '../notifications/NotificationPreferences';

// Scheda con i dati del proprio account (sola lettura) + editor delle proprie disponibilità
// dichiarate. Condivisa da tutti i dipendenti, qualunque area operativa a cui siano assegnati:
// non contiene nulla di specifico per una singola area.
export default function MyProfile() {
  const { user } = useAuth();
  const areas = user.areas || [];

  return (
    <>
      <section className="card">
        <h2>Profilo personale</h2>
        <dl className="profile-list">
          <div className="profile-row">
            <dt>Username</dt>
            <dd>{user.username}</dd>
          </div>
          <div className="profile-row">
            <dt>Telefono</dt>
            <dd>{user.phone || '-'}</dd>
          </div>
          {areas.length > 0 && (
            <div className="profile-row">
              <dt>Aree operative</dt>
              <dd>{areas.map((a) => a.name).join(', ')}</dd>
            </div>
          )}
        </dl>
      </section>

      <EmailManager />

      <NotificationPreferences />

      <AvailabilityEditor />

      <OptOutEditor />
    </>
  );
}
