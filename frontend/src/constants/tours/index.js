// Registro dei tour guidati. Aggiungere un tour = un file di definizione + una riga qui. I tour
// sono scenario-agnostici (referenziano solo id [data-tour], route con {base} e azioni/check per
// nome); quali tour siano pertinenti a uno scenario è dichiarato dallo scenario stesso (metadata).
// Ogni tour dichiara inoltre i RUOLI a cui è pertinente (`roles`): un tour da manager non deve
// essere proposto a un dipendente, che non potrebbe compiere le azioni raccontate.
import benvenuto from './benvenuto';
import commerciale from './tourCommerciale';
import giornataDipendente from './tourDipendente';

const TOURS = { benvenuto, commerciale, 'giornata-dipendente': giornataDipendente };

// Tour proposto dal banner demo per ruolo: la giornata lavorativa del manager (tour commerciale)
// per Dirigente/Responsabile, il percorso del dipendente per il ruolo user.
const DEFAULT_TOUR_BY_ROLE = {
  dirigente: 'commerciale',
  admin: 'commerciale',
  user: 'giornata-dipendente',
};

// Compatibilità: default storico (usato solo come fallback senza ruolo noto).
export const DEFAULT_TOUR_ID = 'commerciale';

export function defaultTourForRole(role) {
  return DEFAULT_TOUR_BY_ROLE[role] || null;
}

export function getTour(tourId) {
  return TOURS[tourId] || null;
}

export function listTours() {
  return Object.values(TOURS);
}
