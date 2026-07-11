// Rende attivabile da tastiera un elemento non-nativo con role="button" (div, li, ...): Invio o
// Barra spaziatrice invocano la stessa azione del click. Va usato insieme a role="button" e
// tabIndex={0} così che l'elemento sia anche raggiungibile in tab order.
export function activateOnKey(callback) {
  return (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      callback(e);
    }
  };
}
