import { DEFAULT_TIME_WINDOW } from '../../utils/timeWindow';
import ShiftBlock from './ShiftBlock';

// days: [{ date, label }]
// shiftsByDate: { [date]: Shift[] }
// timeWindow: { GRID_HEIGHT, getHourMarks, minutesToTop } da createTimeWindow
// (utils/timeWindow.js), costruita con gli orari calendario della sede attiva; ricade sui valori
// storici se omessa.
export default function CalendarGrid({ days, shiftsByDate, showUsername, onShiftClick, timeWindow = DEFAULT_TIME_WINDOW }) {
  const hourMarks = timeWindow.getHourMarks();

  return (
    <div className="calendar-grid" style={{ gridTemplateColumns: `70px repeat(${days.length}, 1fr)` }}>
      <div className="calendar-corner" />
      {days.map((day) => (
        <div key={day.date} className="calendar-header-cell">
          {day.label}
        </div>
      ))}

      <div className="calendar-time-col" style={{ height: timeWindow.GRID_HEIGHT }}>
        {hourMarks.map((mark) => (
          <div key={mark.minutes} className="calendar-hour-label" style={{ top: timeWindow.minutesToTop(mark.minutes) }}>
            {mark.label}
          </div>
        ))}
      </div>

      {days.map((day) => (
        <div key={day.date} className="calendar-day-col" style={{ height: timeWindow.GRID_HEIGHT }}>
          {hourMarks.map((mark) => (
            <div key={mark.minutes} className="calendar-hour-line" style={{ top: timeWindow.minutesToTop(mark.minutes) }} />
          ))}
          {(shiftsByDate[day.date] || []).map((shift) => (
            <ShiftBlock key={shift.id} shift={shift} showUsername={showUsername} onClick={onShiftClick} timeWindow={timeWindow} />
          ))}
        </div>
      ))}
    </div>
  );
}
