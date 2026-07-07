import { GRID_HEIGHT, getHourMarks, minutesToTop } from '../../utils/timeWindow';
import { layoutCourses } from '../../utils/courseLayout';
import CourseBlock from './CourseBlock';

// days: [{ date, label }]
// coursesByDate: { [date]: Course[] }
// onDropOnDay: (date, course) => void — chiamata quando un corso viene rilasciato su una colonna
// giorno diversa dalla propria (spostamento via drag & drop). Omesso in modalità sola lettura.
export default function CoursesGrid({ days, coursesByDate, onCourseClick, onDropOnDay }) {
  const hourMarks = getHourMarks();
  const draggable = Boolean(onDropOnDay);

  function handleDragStart(e, course) {
    e.dataTransfer.setData('text/plain', String(course.id));
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e) {
    if (!draggable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(e, day, dayCourses) {
    if (!draggable) return;
    e.preventDefault();
    const courseId = Number(e.dataTransfer.getData('text/plain'));
    const course = dayCourses.find((c) => c.id === courseId) || Object.values(coursesByDate).flat().find((c) => c.id === courseId);
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

      <div className="calendar-time-col" style={{ height: GRID_HEIGHT }}>
        {hourMarks.map((mark) => (
          <div key={mark.minutes} className="calendar-hour-label" style={{ top: minutesToTop(mark.minutes) }}>
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
            style={{ height: GRID_HEIGHT }}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, day, dayCourses)}
          >
            {hourMarks.map((mark) => (
              <div key={mark.minutes} className="calendar-hour-line" style={{ top: minutesToTop(mark.minutes) }} />
            ))}
            {dayCourses.map((course) => (
              <CourseBlock
                key={course.id}
                course={course}
                draggable={draggable}
                onDragStart={handleDragStart}
                onClick={onCourseClick}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
