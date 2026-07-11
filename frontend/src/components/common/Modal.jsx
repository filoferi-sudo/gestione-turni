import { cloneElement, useEffect, useRef } from 'react';

// Wrapper di accessibilità per i modali dell'app. NON cambia il markup della card esistente
// (il <form>/<div> con classe .modal-card...): la clona per iniettare la semantica dialog e un
// ref, poi aggiunge il comportamento accessibile attorno:
//   - overlay con chiusura al click sul backdrop (invariato rispetto a prima)
//   - chiusura con ESC
//   - focus trap (Tab/Shift+Tab restano dentro il dialog)
//   - focus iniziale sul primo campo e ritorno del focus all'elemento che aveva aperto il modale
//   - accessible name automatico dal primo heading interno (aria-labelledby)
// Nessuna modifica a logica, dati, stili o struttura dei contenuti: la card resta identica.
//
// Uso: sostituire
//   <div className="modal-overlay" onClick={onClose}> <form className="modal-card" ...> ... </form> </div>
// con
//   <Modal onClose={onClose}> <form className="modal-card" ...> ... </form> </Modal>

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isVisible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function focusableWithin(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isVisible);
}

export default function Modal({ onClose, children }) {
  const cardRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const card = cardRef.current;

    // Accessible name: se la card ha un heading, lo colleghiamo via aria-labelledby (senza toccare
    // i call site). In assenza di heading il dialog resta senza nome esplicito (fallback accettabile).
    if (card) {
      const heading = card.querySelector('h1, h2, h3, h4');
      if (heading) {
        if (!heading.id) heading.id = `modal-title-${Math.random().toString(36).slice(2, 9)}`;
        card.setAttribute('aria-labelledby', heading.id);
      }
    }

    // Focus iniziale: primo elemento focusabile, altrimenti la card stessa (tabIndex -1 iniettato).
    const initial = focusableWithin(card)[0] || card;
    initial?.focus();

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !card) return;

      const focusables = focusableWithin(card);
      if (focusables.length === 0) {
        e.preventDefault();
        card.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      // Se il focus è sfuggito fuori dalla card (o è sulla card stessa), riportalo dentro.
      if (!card.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      const prev = previouslyFocused.current;
      if (prev && typeof prev.focus === 'function') prev.focus();
    };
  }, [onClose]);

  const card = cloneElement(children, {
    ref: cardRef,
    role: 'dialog',
    'aria-modal': 'true',
    tabIndex: -1,
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      {card}
    </div>
  );
}
