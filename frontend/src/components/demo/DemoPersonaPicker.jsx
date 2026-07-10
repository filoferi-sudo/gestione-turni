import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

// Chiave localStorage della persona demo scelta: serve al reset (che ri-emette un token per la
// stessa persona) e a ricordare il punto di vista tra i refresh.
export const DEMO_PERSONA_KEY = 'turni_demo_persona';

// Selettore del punto di vista con cui entrare nella demo. Scenario-agnostico: le personas arrivano
// da GET /api/demo/status. All'ingresso chiama /api/demo/login (che carica lo scenario in modo
// lazy) e riusa loginWithToken come un login normale.
export default function DemoPersonaPicker({ scenario, onError }) {
  const [busy, setBusy] = useState(null);
  const { loginWithToken } = useAuth();
  const navigate = useNavigate();

  async function enter(persona) {
    setBusy(persona.key);
    try {
      const result = await api.demoLogin(persona.key, scenario.id);
      localStorage.setItem(DEMO_PERSONA_KEY, persona.key);
      loginWithToken(result.token, result.user);
      navigate('/');
    } catch (err) {
      if (onError) onError(err.message);
      setBusy(null);
    }
  }

  return (
    <div className="demo-picker">
      <p className="demo-picker-title">Entra come…</p>
      <div className="demo-persona-list">
        {scenario.personas.map((persona) => (
          <button
            key={persona.key}
            type="button"
            className="demo-persona"
            disabled={busy !== null}
            onClick={() => enter(persona)}
          >
            <span className="demo-persona-label">{persona.label}</span>
            <span className="demo-persona-desc">
              {busy === persona.key ? 'Preparazione ambiente…' : persona.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
