import { createPortal } from 'react-dom';
import { useTour } from './TourProvider';
import { useTargetRect } from './useTourTarget';

// Rendering dell'overlay del tour: sfondo oscurato con un "buco" di evidenziazione attorno al
// target (4 pannelli attorno al suo rettangolo — nessuna coordinata hardcoded, tutto da
// getBoundingClientRect) e un tooltip con titolo/descrizione/comandi. z-index 70: sopra
// .notif-panel (60) e .modal-overlay (50). Se il target non c'è (o non è ancora comparso) lo step
// degrada a "centrato": il tour non si blocca mai.
const PAD = 6; // margine attorno al target evidenziato

export default function TourOverlay() {
  const { active, step, stop, next, runAction, actionState, stepIndex, total, resolve } = useTour();
  const selector = active && step ? resolve(step.target) : null;
  const { rect, found } = useTargetRect(selector);

  if (!active || !step) return null;

  const isLast = stepIndex === total - 1;
  const centered = !selector || !found;

  return createPortal(
    <div className="tour-root" aria-live="polite">
      {centered ? (
        <div className="tour-dim-full" />
      ) : (
        <Spotlight rect={rect} />
      )}
      <Tooltip
        step={step}
        rect={centered ? null : rect}
        stepIndex={stepIndex}
        total={total}
        isLast={isLast}
        onNext={next}
        onStop={stop}
        onAction={runAction}
        actionState={actionState}
      />
    </div>,
    document.body
  );
}

// Quattro pannelli semitrasparenti attorno al rettangolo del target: l'area centrale resta libera
// (target visibile e cliccabile). pointer-events:none ⇒ l'app resta pienamente utilizzabile.
function Spotlight({ rect }) {
  const t = Math.max(0, rect.top - PAD);
  const l = Math.max(0, rect.left - PAD);
  const w = rect.width + PAD * 2;
  const h = rect.height + PAD * 2;
  const panel = { position: 'fixed', background: 'rgba(15, 23, 42, 0.55)', pointerEvents: 'none' };
  return (
    <>
      <div style={{ ...panel, top: 0, left: 0, right: 0, height: t }} />
      <div style={{ ...panel, top: t, left: 0, width: l, height: h }} />
      <div style={{ ...panel, top: t, left: l + w, right: 0, height: h }} />
      <div style={{ ...panel, top: t + h, left: 0, right: 0, bottom: 0 }} />
      <div className="tour-ring" style={{ top: t, left: l, width: w, height: h }} />
    </>
  );
}

// Tooltip posizionato secondo `placement` accanto al target, con clamp al viewport; centrato se
// non c'è target.
function Tooltip({ step, rect, stepIndex, total, isLast, onNext, onStop, onAction, actionState }) {
  const style = tooltipPosition(rect, step.placement);
  const hasAction = step.action && step.action.kind === 'simulate';
  const isPoll = step.advanceOn && step.advanceOn.type === 'poll';
  return (
    <div className="tour-tooltip" style={style}>
      <div className="tour-progress">{stepIndex + 1} / {total}</div>
      <h3 className="tour-title">{step.title}</h3>
      <p className="tour-body">{step.body}</p>
      {step.advanceOn && (step.advanceOn.type === 'click' || step.advanceOn.type === 'route') && (
        <p className="tour-hint">{step.hint || 'Compi l\'azione indicata per proseguire, oppure usa Avanti.'}</p>
      )}
      {isPoll && <p className="tour-hint">In attesa che l\'azione si completi…</p>}
      {hasAction && actionState && actionState.error && (
        <p className="tour-error">{actionState.error}</p>
      )}
      <div className="tour-actions">
        <button type="button" className="tour-skip" onClick={onStop}>Esci</button>
        <div className="tour-actions-right">
          {hasAction && (
            <button
              type="button"
              className="tour-action"
              disabled={actionState && actionState.running}
              onClick={() => onAction(step.action.name)}
            >
              {actionState && actionState.running ? 'Attendere…' : (step.action.label || 'Esegui')}
            </button>
          )}
          {!isPoll && (
            <button type="button" className="tour-next" onClick={onNext}>{isLast ? 'Fine' : 'Avanti'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

const TOOLTIP_W = 320;
function tooltipPosition(rect, placement = 'bottom') {
  const margin = 14;
  if (!rect) {
    return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: TOOLTIP_W };
  }
  let top;
  let left;
  switch (placement) {
    case 'top':
      top = rect.top - margin; left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      return clamp({ top, left, transform: 'translateY(-100%)' });
    case 'left':
      top = rect.top; left = rect.left - margin - TOOLTIP_W;
      return clamp({ top, left });
    case 'right':
      top = rect.top; left = rect.right + margin;
      return clamp({ top, left });
    case 'bottom':
    default:
      top = rect.bottom + margin; left = rect.left + rect.width / 2 - TOOLTIP_W / 2;
      return clamp({ top, left });
  }
}

// Mantiene il tooltip dentro il viewport (evita che sbordi ai lati/in basso).
function clamp({ top, left, transform }) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampedLeft = Math.max(12, Math.min(left, vw - TOOLTIP_W - 12));
  const clampedTop = Math.max(12, Math.min(top, vh - 40));
  return { top: clampedTop, left: clampedLeft, width: TOOLTIP_W, transform };
}
