import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { getTour } from '../constants/tours';
import TourOverlay from './TourOverlay';

// Engine del Tour Guidato: state machine scenario-AGNOSTICA. Non conosce alcun dato di dominio —
// legge una sequenza di step dichiarativi (constants/tours) e li orchestra: naviga alla pagina
// dello step, evidenzia il componente via [data-tour], e avanza secondo il criterio di
// completamento (bottone / navigazione / click / poll / azione). Persistenza in sessionStorage
// (sopravvive a navigazioni e refresh nella stessa scheda, muore con la sessione).
const TourContext = createContext(null);
const STORAGE_KEY = 'turni_demo_tour';

// Base di rotta per ruolo, per risolvere i segnaposto {base} negli step (una definizione, tre ruoli).
const ROLE_BASE = { dirigente: '/dirigente', admin: '/admin', user: '/dashboard' };

function loadPersisted() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || null;
  } catch {
    return null;
  }
}

export function TourProvider({ children }) {
  const { user, token, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [actionState, setActionState] = useState({ running: false, error: null });
  const location = useLocation();
  const [state, setState] = useState(loadPersisted); // { tourId, stepIndex } | null

  const base = user ? ROLE_BASE[user.role] || '/dashboard' : '/dashboard';
  const resolve = useCallback((str) => (str ? str.replace('{base}', base) : str), [base]);

  const tour = state ? getTour(state.tourId) : null;
  const step = tour ? tour.steps[state.stepIndex] : null;

  // Persistenza.
  useEffect(() => {
    if (state) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [state]);

  const stop = useCallback(() => setState(null), []);

  const start = useCallback((tourId) => {
    const t = getTour(tourId);
    if (!t) return;
    // Guardia di pertinenza: un tour che dichiara `roles` non parte per un ruolo estraneo (es. il
    // tour commerciale, che racconta azioni da manager, non deve mai partire per un dipendente).
    if (t.roles && user && !t.roles.includes(user.role)) return;
    setState({ tourId: t.id, stepIndex: 0 });
  }, [user]);

  const next = useCallback(() => {
    setState((prev) => {
      if (!prev) return prev;
      const t = getTour(prev.tourId);
      const nextIndex = prev.stepIndex + 1;
      if (!t || nextIndex >= t.steps.length) return null; // completato
      return { ...prev, stepIndex: nextIndex };
    });
  }, []);

  const goTo = useCallback((stepIndex) => {
    setState((prev) => (prev ? { ...prev, stepIndex } : prev));
  }, []);

  // Naviga alla pagina dello step corrente, se serve (route dichiarata e diversa da quella attuale).
  useEffect(() => {
    if (!step) return;
    const target = resolve(step.route);
    if (target && location.pathname !== target) {
      navigate(target);
    }
  }, [step, resolve, location.pathname, navigate]);

  // Criterio di avanzamento "route": quando l'utente naviga alla rotta indicata, avanza.
  useEffect(() => {
    if (!step || !step.advanceOn || step.advanceOn.type !== 'route') return undefined;
    const target = resolve(step.advanceOn.route || step.route);
    if (target && location.pathname === target) {
      // piccolo ritardo per evitare un doppio-avanzamento durante la navigazione automatica
      const id = setTimeout(() => next(), 400);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [step, resolve, location.pathname, next]);

  // Esegue un'azione simulata dell'altro attore (es. il collega che accetta la proposta), riusando
  // gli endpoint demo lato server; ad esito positivo avanza. L'errore (es. "invia prima una
  // proposta") viene mostrato nel tooltip, senza avanzare (il tour non prosegue su un passo mancato).
  const runAction = useCallback(async (name) => {
    setActionState({ running: true, error: null });
    try {
      await api.demoTourAction(name, token);
      setActionState({ running: false, error: null });
      next();
    } catch (err) {
      setActionState({ running: false, error: err.message });
    }
  }, [token, next]);

  // Criterio "poll": interroga periodicamente un check lato server (es. "turno-assegnato"); quando è
  // soddisfatto, avanza. Attivo solo mentre lo step corrente lo richiede.
  useEffect(() => {
    if (!step || !step.advanceOn || step.advanceOn.type !== 'poll') return undefined;
    const checkName = step.advanceOn.check;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await api.demoTourCheck(checkName, token);
        if (!stopped && r.satisfied) next();
      } catch {
        /* best-effort: riproveremo al prossimo tick */
      }
    };
    tick();
    const id = setInterval(tick, step.advanceOn.interval || 3000);
    return () => { stopped = true; clearInterval(id); };
  }, [step, token, next]);

  // Resetta lo stato dell'azione quando cambia step.
  useEffect(() => { setActionState({ running: false, error: null }); }, [step]);

  // Criterio "click": un click su un elemento che matcha il selettore fa avanzare (listener
  // delegato sul document, così funziona anche per elementi che appaiono dopo).
  useEffect(() => {
    if (!step || !step.advanceOn || step.advanceOn.type !== 'click') return undefined;
    const selector = resolve(step.advanceOn.target || step.target);
    if (!selector) return undefined;
    const handler = (e) => {
      const match = e.target.closest(selector);
      if (match) setTimeout(() => next(), 300);
    };
    document.addEventListener('click', handler, true);
    return () => document.removeEventListener('click', handler, true);
  }, [step, resolve, next]);

  // Se la sessione non è più demo (logout), il tour si spegne. Ma NON durante il caricamento
  // iniziale di auth (user è momentaneamente null mentre /auth/me è in corso, es. dopo un refresh
  // a metà tour): in quel caso il tour va preservato e ripreso.
  useEffect(() => {
    if (authLoading) return;
    if (state && (!user || !user.isDemo)) setState(null);
  }, [user, state, authLoading]);

  const value = useMemo(() => ({
    active: !!step,
    start,
    stop,
    next,
    goTo,
    runAction,
    actionState,
    step,
    stepIndex: state ? state.stepIndex : -1,
    total: tour ? tour.steps.length : 0,
    resolve,
  }), [step, start, stop, next, goTo, runAction, actionState, state, tour, resolve]);

  return (
    <TourContext.Provider value={value}>
      {children}
      <TourOverlay />
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour deve essere usato dentro TourProvider');
  return ctx;
}
