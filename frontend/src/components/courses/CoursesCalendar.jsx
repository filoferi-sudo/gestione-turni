import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { addDays, formatRangeLabel, getSingleDay, getWeekDays } from '../../utils/dates';
import { DEFAULT_TIME_WINDOW } from '../../utils/timeWindow';
import CoursesGrid from './CoursesGrid';
import CourseFormModal from './CourseFormModal';

// mode: 'manage' (responsabile/dirigente: crea/modifica/elimina/sposta) | 'view' (istruttore:
// sola lettura, vede tutti i corsi dell'area). areaId: area operativa di questo calendario
// (obbligatoria, modalità 'courses'). timeWindow: orari calendario configurati per la sede.
// Stessa struttura/interazione di CalendarPage (turni), per un'esperienza identica tra le due
// gestioni: stesso layout toolbar, stessa legenda, stesso modulo di modifica.
export default function CoursesCalendar({ mode, areaId, timeWindow = DEFAULT_TIME_WINDOW }) {
  const { token } = useAuth();
  const isManage = mode === 'manage';

  const [viewType, setViewType] = useState('week');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const [courses, setCourses] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalState, setModalState] = useState(null); // { course, defaultDate } | null

  const days = viewType === 'week' ? getWeekDays(referenceDate) : getSingleDay(referenceDate);
  const start = days[0].date;
  const end = days[days.length - 1].date;

  useEffect(() => {
    if (isManage) {
      api
        .listUsers(token)
        .then(({ users }) => setInstructors(users.filter((u) => u.areas?.some((a) => a.id === areaId))))
        .catch((err) => setError(err.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  function loadCourses() {
    setLoading(true);
    api
      .listCourses(token, { start, end, areaId, instructorId: isManage ? selectedInstructorId || undefined : undefined })
      .then(({ courses }) => setCourses(courses))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, selectedInstructorId, areaId]);

  const coursesByDate = courses.reduce((acc, course) => {
    (acc[course.date] = acc[course.date] || []).push(course);
    return acc;
  }, {});

  function goPrev() {
    setReferenceDate((d) => addDays(d, viewType === 'week' ? -7 : -1));
  }
  function goNext() {
    setReferenceDate((d) => addDays(d, viewType === 'week' ? 7 : 1));
  }
  function goToday() {
    setReferenceDate(new Date());
  }

  async function handleSave(payload) {
    if (modalState.course) {
      await api.updateCourse(modalState.course.courseId, payload, token);
    } else {
      await api.createCourse({ ...payload, areaId }, token);
    }
    setModalState(null);
    loadCourses();
  }

  async function handleDelete(course) {
    if (!window.confirm('Eliminare questo corso? Se è un corso fisso verranno rimosse tutte le occorrenze.')) return;
    await api.deleteCourse(course.courseId, token);
    setModalState(null);
    loadCourses();
  }

  async function handleDropOnDay(newDate, course) {
    setError('');
    setNotice('');
    try {
      await api.updateCourse(course.courseId, { date: newDate }, token);
      setNotice(`"${course.name}" spostato al ${newDate}.`);
      loadCourses();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="calendar-toolbar">
        <div className="segmented">
          <button className={viewType === 'day' ? 'active' : ''} onClick={() => setViewType('day')}>
            Giorno
          </button>
          <button className={viewType === 'week' ? 'active' : ''} onClick={() => setViewType('week')}>
            Settimana
          </button>
        </div>

        <div className="calendar-nav">
          <button onClick={goPrev}>&larr;</button>
          <button onClick={goToday}>Oggi</button>
          <button onClick={goNext}>&rarr;</button>
          <span className="calendar-range-label">{formatRangeLabel(days)}</span>
        </div>

        {isManage && (
          <div className="calendar-admin-controls">
            <select value={selectedInstructorId} onChange={(e) => setSelectedInstructorId(e.target.value)}>
              <option value="">Tutti gli istruttori</option>
              {instructors.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.username}
                </option>
              ))}
            </select>
            <button onClick={() => setModalState({ course: null, defaultDate: days[0].date })}>+ Nuovo corso</button>
          </div>
        )}
      </div>

      <div className="calendar-legend">
        <span>
          <i className="legend-dot legend-fixed" /> Corso fisso
        </span>
        <span>
          <i className="legend-dot legend-mobile" /> Corso singolo
        </span>
        <span>
          <i className="legend-dot legend-volante" /> Corso disponibile
        </span>
      </div>
      {isManage && (
        <p className="hint">
          Clicca su un corso per modificarlo, oppure trascinalo su un altro giorno per spostarlo (i corsi fissi si
          modificano solo dal modulo).
        </p>
      )}

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      {loading ? (
        <div className="calendar-loading">Caricamento corsi...</div>
      ) : (
        <CoursesGrid
          days={days}
          coursesByDate={coursesByDate}
          onCourseClick={isManage ? (course) => setModalState({ course }) : undefined}
          onDropOnDay={isManage ? handleDropOnDay : undefined}
          timeWindow={timeWindow}
        />
      )}

      {modalState && (
        <CourseFormModal
          course={modalState.course}
          instructors={instructors}
          defaultDate={modalState.defaultDate}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  );
}
