import { timeToMinutes, PX_PER_MIN, DEFAULT_TIME_WINDOW } from '../../utils/timeWindow';

// A differenza di ShiftBlock (larghezza fissa, un solo turno per volta), la posizione orizzontale
// qui dipende da `lane`/`laneCount` calcolati da utils/courseLayout: corsi sovrapposti nello
// stesso orario si affiancano invece di nascondersi a vicenda.
export default function CourseBlock({ course, draggable, onClick, onDragStart, timeWindow = DEFAULT_TIME_WINDOW }) {
  const top = timeWindow.minutesToTop(timeToMinutes(course.startTime));
  const height = (timeToMinutes(course.endTime) - timeToMinutes(course.startTime)) * PX_PER_MIN;
  const widthPct = 100 / course.laneCount;
  const leftPct = widthPct * course.lane;

  return (
    <div
      className={`course-block course-${course.type}`}
      style={{
        top,
        height,
        left: `calc(${leftPct}% + 2px)`,
        width: `calc(${widthPct}% - 4px)`,
      }}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart(e, course) : undefined}
      onClick={onClick ? () => onClick(course) : undefined}
      role={onClick ? 'button' : undefined}
    >
      <div className="course-block-name">{course.name}</div>
      <div className="course-block-time">
        {course.startTime}-{course.endTime}
      </div>
      <div className="course-block-instructor">{course.instructorUsername || 'Non assegnato'}</div>
      {course.note && <div className="course-block-note">{course.note}</div>}
    </div>
  );
}
