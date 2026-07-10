import { useEffect, useState } from 'react';

// Risolve un selettore CSS (es. '[data-tour="nav-calendario"]') nel suo rettangolo sullo schermo,
// con retry: l'elemento può non essere ancora montato quando lo step parte (cambio di pagina,
// render asincrono). Ricalcola su scroll/resize e con un intervallo leggero (le griglie del
// calendario cambiano layout). Nessuna coordinata hardcoded: tutto deriva da getBoundingClientRect.
// Ritorna { rect, found }: se dopo `timeout` ms l'elemento non compare, found resta false e lo
// step degrada a "centrato" (il tour non si blocca mai).
export function useTargetRect(selector, { timeout = 5000 } = {}) {
  const [state, setState] = useState({ rect: null, found: false });

  useEffect(() => {
    if (!selector) {
      setState({ rect: null, found: false });
      return undefined;
    }
    let raf = null;
    let interval = null;
    let deadline = Date.now() + timeout;
    let scrolledIntoView = false;

    const measure = () => {
      const el = document.querySelector(selector);
      if (el) {
        if (!scrolledIntoView) {
          el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
          scrolledIntoView = true;
        }
        const r = el.getBoundingClientRect();
        setState({
          rect: { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right },
          found: true,
        });
        deadline = Date.now() + timeout; // finché resta visibile continuiamo a seguirlo
      } else if (Date.now() > deadline) {
        setState((prev) => (prev.found ? prev : { rect: null, found: false }));
      }
    };

    measure();
    interval = setInterval(() => {
      raf = requestAnimationFrame(measure);
    }, 250);
    const onChange = () => { raf = requestAnimationFrame(measure); };
    window.addEventListener('scroll', onChange, true);
    window.addEventListener('resize', onChange);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (interval) clearInterval(interval);
      window.removeEventListener('scroll', onChange, true);
      window.removeEventListener('resize', onChange);
    };
  }, [selector, timeout]);

  return state;
}
