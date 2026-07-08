import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { useSedeSelection } from '../hooks/useSedeSelection';
import { createTimeWindow, DEFAULT_TIME_WINDOW } from '../utils/timeWindow';

const ManagerWorkspaceContext = createContext(null);

// Stato condiviso tra tutte le sezioni manager (Dirigente/Responsabile): sede selezionata e
// aree operative della sede attiva. Prima viveva dentro le due dashboard monolitiche; ora che
// le sezioni sono pagine separate (Calendario, Sostituzioni, Fabbisogno, Impostazioni...) il
// contesto vive a livello di layout, così la selezione della sede resta unica per tutta l'area
// manager e le aree non vengono ricaricate da ogni pagina per conto proprio.
export function ManagerWorkspaceProvider({ children }) {
  const { token } = useAuth();
  const sede = useSedeSelection();
  const [areas, setAreas] = useState([]);
  const [areasError, setAreasError] = useState('');

  function reloadAreas() {
    if (!sede.selectedSedeId) {
      setAreas([]);
      return;
    }
    api
      .listAreas(sede.selectedSedeId, token)
      .then(({ areas }) => setAreas(areas))
      .catch((err) => setAreasError(err.message));
  }

  useEffect(reloadAreas, [sede.selectedSedeId, token]);

  const timeWindow = sede.selectedSede
    ? createTimeWindow(sede.selectedSede.calendarStartTime, sede.selectedSede.calendarEndTime)
    : DEFAULT_TIME_WINDOW;

  const value = {
    sedi: sede.sedi,
    selectedSede: sede.selectedSede,
    selectedSedeId: sede.selectedSedeId,
    setSelectedSedeId: sede.setSelectedSedeId,
    sediLoading: sede.loading,
    sediError: sede.error,
    reloadSedi: sede.reload,
    areas,
    areasError,
    reloadAreas,
    timeWindow,
  };

  return <ManagerWorkspaceContext.Provider value={value}>{children}</ManagerWorkspaceContext.Provider>;
}

export function useManagerWorkspace() {
  return useContext(ManagerWorkspaceContext);
}
