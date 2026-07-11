import { timeToMinutes, PX_PER_MIN, DEFAULT_TIME_WINDOW } from '../../utils/timeWindow';
import { activateOnKey } from '../../utils/a11y';

// lane/laneCount (calcolati da utils/courseLayout.layoutCourses, riusato invariato per i turni):
// turni sovrapposti nello stesso orario si affiancano invece di nascondersi a vicenda, stessa
// resa già usata per i corsi (CourseBlock.jsx). Con un solo turno per fascia (laneCount=1) la
// larghezza resta 100%, identica al comportamento storico a larghezza fissa.
export default function ShiftBlock({ shift, showUsername, onClick, timeWindow = DEFAULT_TIME_WINDOW }) {
  const top = timeWindow.minutesToTop(timeToMinutes(shift.startTime));
  const height = (timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime)) * PX_PER_MIN;
  const laneCount = shift.laneCount || 1;
  const widthPct = 100 / laneCount;
  const leftPct = widthPct * (shift.lane || 0);

  return (
    <div
      className={`shift-block shift-${shift.type}`}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 3px)`,
        width: `calc(${widthPct}% - 6px)`,
      }}
      onClick={onClick ? () => onClick(shift) : undefined}
      onKeyDown={onClick ? activateOnKey(() => onClick(shift)) : undefined}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="shift-block-time">
        {shift.startTime} - {shift.endTime}
      </div>
      {showUsername && <div className="shift-block-user">{shift.username || 'Non assegnato'}</div>}
      {shift.note && <div className="shift-block-note">{shift.note}</div>}
    </div>
  );
}
