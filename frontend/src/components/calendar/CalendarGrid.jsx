import { GRID_HEIGHT, getHourMarks, minutesToTop } from '../../utils/timeWindow';
import ShiftBlock from './ShiftBlock';

// days: [{ date, label }]
// shiftsByDate: { [date]: Shift[] }
export default function CalendarGrid({ days, shiftsByDate, showUsername, onShiftClick }) {
  const hourMarks = getHourMarks();

  return (
    <div className="calendar-grid" style={{ gridTemplateColumns: `70px repeat(${days.length}, 1fr)` }}>
      <div className="calendar-corner" />
      {days.map((day) => (
        <div key={day.date} className="calendar-header-cell">
          {day.label}
        </div>
      ))}

      <div className="calendar-time-col" style={{ height: GRID_HEIGHT }}>
        {hourMarks.map((mark) => (
          <div key={mark.minutes} className="calendar-hour-label" style={{ top: minutesToTop(mark.minutes) }}>
            {mark.label}
          </div>
        ))}
      </div>

      {days.map((day) => (
        <div key={day.date} className="calendar-day-col" style={{ height: GRID_HEIGHT }}>
          {hourMarks.map((mark) => (
            <div key={mark.minutes} className="calendar-hour-line" style={{ top: minutesToTop(mark.minutes) }} />
          ))}
          {(shiftsByDate[day.date] || []).map((shift) => (
            <ShiftBlock key={shift.id} shift={shift} showUsername={showUsername} onClick={onShiftClick} />
          ))}
        </div>
      ))}
    </div>
  );
}
