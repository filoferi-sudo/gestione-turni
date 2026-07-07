import { timeToMinutes, PX_PER_MIN, DEFAULT_TIME_WINDOW } from '../../utils/timeWindow';

export default function ShiftBlock({ shift, showUsername, onClick, timeWindow = DEFAULT_TIME_WINDOW }) {
  const top = timeWindow.minutesToTop(timeToMinutes(shift.startTime));
  const height = (timeToMinutes(shift.endTime) - timeToMinutes(shift.startTime)) * PX_PER_MIN;

  return (
    <div
      className={`shift-block shift-${shift.type}`}
      style={{ top, height }}
      onClick={onClick ? () => onClick(shift) : undefined}
      role={onClick ? 'button' : undefined}
    >
      <div className="shift-block-time">
        {shift.startTime} - {shift.endTime}
      </div>
      {showUsername && <div className="shift-block-user">{shift.username || 'Non assegnato'}</div>}
      {shift.note && <div className="shift-block-note">{shift.note}</div>}
    </div>
  );
}
