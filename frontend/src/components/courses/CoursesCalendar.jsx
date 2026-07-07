import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { addDays, formatRangeLabel, getSingleDay, getWeekDays } from '../../utils/dates';
import CoursesGrid from './CoursesGrid';
import CourseFormModal from './CourseFormModal';

// mode: 'manage' (responsabile/dirigente: crea/modifica/elimina/sposta) | 'view' (istruttore:
// sola lettura, vede tutti i corsi della giornata/settimana, non solo i propri).
export default function CoursesCalendar({ mode }) {
  const { token } = useAuth();
  const isManage = mode === 'manage';

  const [viewType, setViewType] = useState('day');
  const [referenceDate, setReferenceDate] = useState(new Date());
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
        .then(({ users }) => setInstructors(users.filter((u) => u.category === 'istruttore')))
        .catch((err) => setError(err.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadCourses() {
    setLoading(true);
    api
      .listCourses(token, { start, end })
      .then(({ courses }) => setCourses(courses))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end]);

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
      await api.updateCourse(modalState.course.id, payload, token);
    } else {
      await api.createCourse(payload, token);
    }
    setModalState(null);
    loadCourses();
  }

  async function handleDelete(course) {
    if (!window.confirm(`Eliminare il corso "${course.name}"?`)) return;
    await api.deleteCourse(course.id, token);
    setModalState(null);
    loadCourses();
  }

  async function handleDropOnDay(newDate, course) {
    setError('');
    setNotice('');
    try {
      await api.updateCourse(course.id, { date: newDate }, token);
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
            <button onClick={() => setModalState({ course: null, defaultDate: days[0].date })}>+ Nuovo corso</button>
          </div>
        )}
      </div>

      {isManage && (
        <p className="hint">
          Clicca su un corso per modificarlo, oppure trascinalo su un altro giorno per spostarlo.
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
