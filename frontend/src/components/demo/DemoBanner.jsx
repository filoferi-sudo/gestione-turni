import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { DEMO_PERSONA_KEY } from './DemoPersonaPicker';
import { useTour } from '../../tour/TourProvider';
import { defaultTourForRole } from '../../constants/tours';

// Banner permanente mostrato in ogni pagina quando la sessione è demo (user.isDemo). Comunica lo
// stato demo e offre il reset dell'ambiente. Il bottone "Tour guidato" viene agganciato in Fase D4
// (qui è predisposto lo spazio ma non ancora attivo). Nessuna logica di dominio.
export default function DemoBanner() {
  const { user, loginWithToken } = useAuth();
  const { start } = useTour();
  const [busy, setBusy] = useState(false);

  async function handleReset() {
    if (!window.confirm('Reinizializzare l\'ambiente demo? I dati modificati verranno ripristinati.')) return;
    setBusy(true);
    try {
      const persona = localStorage.getItem(DEMO_PERSONA_KEY) || undefined;
      const token = localStorage.getItem('turni_app_token');
      const result = await api.demoReset(persona, token);
      loginWithToken(result.token, result.user);
      // Ricarica per ripartire da uno stato pulito con i nuovi id.
      window.location.reload();
    } catch (err) {
      window.alert(`Reinizializzazione non riuscita: ${err.message}`);
      setBusy(false);
    }
  }

  if (!user || !user.isDemo) return null;

  // Tour pertinente al ruolo della persona demo (manager ⇒ commerciale, dipendente ⇒ giornata-
  // dipendente): mai proporre a un ruolo un tour con azioni che non può compiere.
  const tourId = defaultTourForRole(user.role);

  return (
    <div className="demo-banner" role="status">
      <span className="demo-banner-tag">MODALITÀ DEMO</span>
      <span className="demo-banner-text">
        Stai esplorando un ambiente dimostrativo. Puoi usare ogni funzionalità liberamente: nessun dato reale è coinvolto.
      </span>
      {tourId && (
        <button type="button" className="demo-banner-btn demo-banner-btn-primary" onClick={() => start(tourId)}>
          Tour guidato
        </button>
      )}
      <button type="button" className="demo-banner-btn" onClick={handleReset} disabled={busy}>
        {busy ? 'Reinizializzo…' : 'Reinizializza'}
      </button>
    </div>
  );
}
