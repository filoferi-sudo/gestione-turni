import { useState } from 'react';

// Contenitore generico per mostrare un solo calendario per volta, con un selettore sopra per
// cambiare vista senza cambiare pagina. Punto unico di estendibilità: per aggiungere in futuro
// una nuova tipologia di calendario (es. un terzo tipo di risorsa) basta passare un'altra voce
// nell'array `views`, senza toccare questo componente né le dashboard che lo usano.
//
// views: [{ key, label, render: () => ReactNode }]
export default function TabbedCalendar({ views, defaultKey }) {
  const [activeKey, setActiveKey] = useState(defaultKey || views[0]?.key);
  const active = views.find((v) => v.key === activeKey) || views[0];

  return (
    <div>
      {views.length > 1 && (
        <div className="segmented calendar-view-switcher">
          {views.map((v) => (
            <button key={v.key} className={activeKey === v.key ? 'active' : ''} onClick={() => setActiveKey(v.key)}>
              {v.label}
            </button>
          ))}
        </div>
      )}
      {active && active.render()}
    </div>
  );
}
