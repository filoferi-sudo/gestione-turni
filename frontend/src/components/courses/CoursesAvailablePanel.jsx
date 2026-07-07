import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// mode 'claim' (istruttore: può accettare) | 'manage' (responsabile/dirigente: può solo eliminare)
// Stessa struttura/interazione di SubstitutionsPanel (sostituzioni), per un'esperienza identica
// tra la gestione delle sostituzioni e quella dei corsi disponibili.
export default function CoursesAvailablePanel({ mode }) {
  const { token } = useAuth();
  const [courses, setCourses] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState(null);

  function load() {
    api
      .listAvailableCourses(token)
      .then(({ courses }) => setCourses(courses))
      .catch((err) => setError(err.message));
  }

  useEffect(load, [token]);

  async function handleClaim(course) {
    setError('');
    setNotice('');
    setBusyId(course.id);
    try {
      await api.claimCourse(course.id, token);
      setNotice(`"${course.name}" del ${course.date} accettato con successo.`);
      load();
    } catch (err) {
      setError(err.message);
      load(); // qualcun altro potrebbe averlo già accettato
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(course) {
    if (!window.confirm(`Eliminare il corso disponibile "${course.name}"?`)) return;
    setError('');
    setBusyId(course.id);
    try {
      await api.deleteCourse(course.id, token);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="card">
      <h2>Corsi disponibili {mode === 'claim' ? '' : '(non ancora accettati)'}</h2>

      {error && <div className="error">{error}</div>}
      {notice && <div className="notice">{notice}</div>}

      {courses.length === 0 ? (
        <p className="hint">Nessun corso disponibile al momento.</p>
      ) : (
        <ul className="shift-list">
          {courses.map((course) => (
            <li key={course.id} className="shift-list-item">
              <span>
                <strong>{course.name}</strong> · {course.date} · {course.startTime}-{course.endTime}
                {course.note ? ` · ${course.note}` : ''}
                {mode === 'manage' && <span className="hint"> · creato da {course.createdByUsername}</span>}
              </span>
              {mode === 'claim' ? (
                <button disabled={busyId === course.id} onClick={() => handleClaim(course)}>
                  {busyId === course.id ? 'Attendere...' : 'Accetta'}
                </button>
              ) : (
                <button
                  className="button-danger"
                  disabled={busyId === course.id}
                  onClick={() => handleDelete(course)}
                >
                  Elimina
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
