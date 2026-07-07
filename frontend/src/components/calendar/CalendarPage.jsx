import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { addDays, formatRangeLabel, getSingleDay, getWeekDays } from '../../utils/dates';
import CalendarGrid from './CalendarGrid';
import ShiftFormModal from './ShiftFormModal';

// mode: 'admin' (CRUD completo, tutti gli utenti) | 'user' (sola lettura, solo il proprio calendario)
export default function CalendarPage({ mode }) {
  const { token } = useAuth();
  const isAdmin = mode === 'admin';

  const [viewType, setViewType] = useState('week');
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [selectedUserId, setSelectedUserId] = useState('');
  const [shifts, setShifts] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modalState, setModalState] = useState(null); // { shift } | null
  const [actionNotice, setActionNotice] = useState('');

  const days = viewType === 'week' ? getWeekDays(referenceDate) : getSingleDay(referenceDate);
  const start = days[0].date;
  const end = days[days.length - 1].date;

  useEffect(() => {
    if (isAdmin) {
      api.listUsers(token).then(({ users }) => setUsers(users)).catch((err) => setError(err.message));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadCalendar() {
    setLoading(true);
    api
      .getCalendar(token, { start, end, userId: isAdmin ? selectedUserId || undefined : undefined })
      .then(({ shifts }) => setShifts(shifts))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadCalendar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, selectedUserId]);

  const shiftsByDate = shifts.reduce((acc, shift) => {
    (acc[shift.date] = acc[shift.date] || []).push(shift);
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
    if (modalState.shift) {
      await api.updateShift(modalState.shift.shiftId, payload, token);
    } else {
      await api.createShift(payload, token);
    }
    setModalState(null);
    loadCalendar();
  }

  async function handleDelete(shift) {
    if (!window.confirm('Eliminare questo turno? Se è un turno fisso verranno rimosse tutte le occorrenze.')) return;
    await api.deleteShift(shift.shiftId, token);
    setModalState(null);
    loadCalendar();
  }

  async function handleUserShiftClick(shift) {
    setActionNotice('');
    if (
      !window.confirm(`Richiedere la cancellazione del turno del ${shift.date} (${shift.startTime}-${shift.endTime})?`)
    ) {
      return;
    }
    try {
      await api.deleteShiftSelf(shift.shiftId, token, shift.type === 'fixed' ? shift.date : undefined);
      setActionNotice('Richiesta di cancellazione inviata: in attesa di approvazione del responsabile o del dirigente.');
      loadCalendar();
    } catch (err) {
      setActionNotice(err.message);
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

        {isAdmin && (
          <div className="calendar-admin-controls">
            <select value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
              <option value="">Tutti i dipendenti</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username}
                </option>
              ))}
            </select>
            <button
              onClick={() =>
                setModalState({ shift: null, defaultUserId: selectedUserId, defaultDate: days[0].date })
              }
            >
              + Nuovo turno
            </button>
          </div>
        )}
      </div>

      <div className="calendar-legend">
        <span>
          <i className="legend-dot legend-fixed" /> Turno fisso
        </span>
        <span>
          <i className="legend-dot legend-mobile" /> Turno singolo
        </span>
        <span>
          <i className="legend-dot legend-volante" /> Sostituzione
        </span>
      </div>
      {!isAdmin && (
        <p className="hint">
          Clicca su un turno per richiederne la cancellazione: la richiesta dovrà essere approvata dal responsabile o
          dal dirigente.
        </p>
      )}

      {error && <div className="error">{error}</div>}
      {actionNotice && <div className="notice">{actionNotice}</div>}
      {loading ? (
        <div className="calendar-loading">Caricamento calendario...</div>
      ) : (
        <CalendarGrid
          days={days}
          shiftsByDate={shiftsByDate}
          showUsername={isAdmin && !selectedUserId}
          onShiftClick={isAdmin ? (shift) => setModalState({ shift }) : handleUserShiftClick}
        />
      )}

      {modalState && (
        <ShiftFormModal
          shift={modalState.shift}
          users={users}
          defaultUserId={modalState.defaultUserId}
          defaultDate={modalState.defaultDate}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setModalState(null)}
        />
      )}
    </div>
  );
}
