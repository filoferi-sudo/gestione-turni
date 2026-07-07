import { timeToMinutes, minutesToTop, PX_PER_MIN } from '../../utils/timeWindow';

// A differenza di ShiftBlock (larghezza fissa, un solo turno per volta), la posizione orizzontale
// qui dipende da `lane`/`laneCount` calcolati da utils/courseLayout: corsi sovrapposti nello
// stesso orario si affiancano invece di nascondersi a vicenda.
export default function CourseBlock({ course, draggable, onClick, onDragStart }) {
  const top = minutesToTop(timeToMinutes(course.startTime));
  const height = (timeToMinutes(course.endTime) - timeToMinutes(course.startTime)) * PX_PER_MIN;
  const widthPct = 100 / course.laneCount;
  const leftPct = widthPct * course.lane;

  return (
    <div
      className="course-block"
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
      <div className="course-block-instructor">{course.instructorUsername}</div>
      {course.note && <div className="course-block-note">{course.note}</div>}
    </div>
  );
}
