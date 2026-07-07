import { useEffect, useRef } from 'react';

// Polling leggero per dati condivisi tra utenti (calendari, Sostituzioni/Corsi disponibili,
// Fabbisogno, richieste di cancellazione): affianca l'useEffect di fetch già esistente in ogni
// componente, non lo sostituisce. `callback` è sempre la funzione `load`/`loadCalendar` già
// presente nel componente chiamante, passata per riferimento (nessuna duplicazione della logica
// di fetch). Nessun polling quando la tab non è visibile (risparmia richieste); refetch immediato
// al ritorno di focus della tab, per non far aspettare il prossimo tick a chi torna su una
// finestra già aperta. `enabled=false` sospende del tutto il polling (es. mentre un modale di
// modifica è aperto sullo stesso componente).
export function usePolling(callback, { intervalMs, enabled = true }) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    if (!enabled) return undefined;

    let intervalId = null;

    function tick() {
      if (document.visibilityState === 'visible') callbackRef.current();
    }

    function startInterval() {
      if (intervalId) return;
      intervalId = setInterval(tick, intervalMs);
    }
    function stopInterval() {
      clearInterval(intervalId);
      intervalId = null;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        callbackRef.current();
        startInterval();
      } else {
        stopInterval();
      }
    }

    if (document.visibilityState === 'visible') startInterval();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [intervalMs, enabled]);
}
