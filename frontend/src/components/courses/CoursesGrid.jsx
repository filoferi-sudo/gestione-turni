import { DEFAULT_TIME_WINDOW } from '../../utils/timeWindow';
import { layoutCourses } from '../../utils/courseLayout';
import CourseBlock from './CourseBlock';

// days: [{ date, label }]
// coursesByDate: { [date]: Course[] }
// onDropOnDay: (date, course) => void — chiamata quando un corso viene rilasciato su una colonna
// giorno diversa dalla propria (spostamento via drag & drop). Omesso in modalità sola lettura.
// timeWindow: vedi CalendarGrid.jsx, stessa convenzione (orari calendario della sede attiva).
// I corsi fissi ricorrenti non sono trascinabili (l'occorrenza non è una riga a sé: spostarla
// richiederebbe la stessa logica di eccezioni usata per i turni, non prevista per i corsi):
// per cambiarne giorno/orario si passa dal modulo di modifica, che agisce sull'intera serie.
export default function CoursesGrid({ days, coursesByDate, onCourseClick, onDropOnDay, timeWindow = DEFAULT_TIME_WINDOW }) {
  const hourMarks = timeWindow.getHourMarks();
  const canDrop = Boolean(onDropOnDay);

  function handleDragStart(e, course) {
    e.dataTransfer.setData('text/plain', String(course.courseId));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e) {
    if (!canDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e, day) {
    if (!canDrop) return;
    e.preventDefault();
    const courseId = Number(e.dataTransfer.getData('text/plain'));
    const course = Object.values(coursesByDate)
      .flat()
      .find((c) => c.courseId === courseId);
    if (course && course.date !== day.date) onDropOnDay(day.date, course);
  }

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

      {days.map((day) => {
        const dayCourses = layoutCourses(coursesByDate[day.date] || []);
        return (
          <div
            key={day.date}
            className="calendar-day-col"
            style={{ height: timeWindow.GRID_HEIGHT }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, day)}
          >
            {hourMarks.map((mark) => (
              <div key={mark.minutes} className="calendar-hour-line" style={{ top: timeWindow.minutesToTop(mark.minutes) }} />
            ))}
            {dayCourses.map((course) => (
              <CourseBlock
                key={course.id}
                course={course}
                draggable={canDrop && course.type !== 'fixed'}
                onDragStart={handleDragStart}
                onClick={onCourseClick}
                timeWindow={timeWindow}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
