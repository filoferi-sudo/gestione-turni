import { useState } from 'react';

// Indicatore di copertura del fabbisogno per una singola occorrenza (fascia oraria indipendente,
// mai accorpata ad altre occorrenze dello stesso giorno). Stile intenzionalmente diverso da
// ShiftBlock (vedi styles.css): è un livello di pianificazione ("quanto serve"), non un turno
// ("chi lavora"), quest'ultimo resta visibile invariato nella griglia sottostante.
// Compatto di default: orario + copertura + bottone "Genera sostituzioni" (azione più frequente,
// sempre a vista quando c'è uno scoperto). Click sul corpo del chip espande il dettaglio nominale
// (assignedUsers/openSlots) e il bottone "Modifica", per non appesantire la vista di default.
export default function StaffingChip({ occurrence, onGenerateGap, onEditOccurrence, busy }) {
  const [expanded, setExpanded] = useState(false);
  const covered = occurrence.assignedUsers.length + occurrence.openSlots;
  const hasGap = occurrence.missingSlots > 0;

  return (
    <div className={`staffing-chip ${hasGap ? 'staffing-chip-warning' : 'staffing-chip-covered'}`}>
      <div className="staffing-chip-summary" onClick={() => setExpanded((v) => !v)} role="button">
        <span className="staffing-chip-time">
          {occurrence.startTime}-{occurrence.endTime}
        </span>
        <span className="staffing-chip-coverage">
          {covered}/{occurrence.requiredCount}
        </span>
        {hasGap && (
          <button
            className="staffing-chip-generate"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onGenerateGap(occurrence);
            }}
          >
            {busy ? '...' : 'Genera'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="staffing-chip-expanded">
          {occurrence.assignedUsers.length > 0 ? (
            <ul>
              {occurrence.assignedUsers.map((u) => (
                <li key={u.shiftId}>{u.username}</li>
              ))}
            </ul>
          ) : (
            <div>Nessun turno assegnato in questa fascia.</div>
          )}
          {occurrence.openSlots > 0 && <div>{occurrence.openSlots} già pubblicati come Sostituzione.</div>}
          <button className="staffing-chip-edit" onClick={() => onEditOccurrence(occurrence)}>
            Modifica
          </button>
        </div>
      )}
    </div>
  );
}
