// Registro dei tour guidati. Aggiungere un tour = un file di definizione + una riga qui. I tour
// sono scenario-agnostici (referenziano solo id [data-tour], route con {base} e azioni/check per
// nome); quali tour siano pertinenti a uno scenario è dichiarato dallo scenario stesso (metadata).
import benvenuto from './benvenuto';
import commerciale from './tourCommerciale';

const TOURS = { benvenuto, commerciale };

// Tour proposto dal banner demo per default (la giornata lavorativa raccontata dal tour commerciale).
export const DEFAULT_TOUR_ID = 'commerciale';

export function getTour(tourId) {
  return TOURS[tourId] || null;
}

export function listTours() {
  return Object.values(TOURS);
}
