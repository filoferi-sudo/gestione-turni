import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'turni_app_selected_sede';

// Stato "sede selezionata" condiviso dalle dashboard Dirigente/Responsabile: elenco sedi della
// società + sede attualmente attiva, persistita in localStorage così la scelta sopravvive ai
// reload. Un semplice hook (non un Context) perché è usato solo dentro le due dashboard manager,
// non serve condividerlo con l'intero albero dei componenti come AuthContext.
export function useSedeSelection() {
  const { token } = useAuth();
  const [sedi, setSedi] = useState([]);
  const [selectedSedeId, setSelectedSedeId] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  function load() {
    setLoading(true);
    api
      .listSedi(token)
      .then(({ sedi: list }) => {
        setSedi(list);
        setSelectedSedeId((current) => {
          if (current && list.some((s) => s.id === current)) return current;
          return list[0]?.id || null;
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [token]);

  useEffect(() => {
    if (selectedSedeId) localStorage.setItem(STORAGE_KEY, String(selectedSedeId));
  }, [selectedSedeId]);

  const selectedSede = sedi.find((s) => s.id === selectedSedeId) || null;

  return { sedi, selectedSede, selectedSedeId, setSelectedSedeId, loading, error, reload: load };
}
