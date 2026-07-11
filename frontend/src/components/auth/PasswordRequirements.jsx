import { evaluatePassword } from '../../utils/passwordPolicy';
import { CheckIcon, DotIcon } from '../common/icons';

// Checklist live dei requisiti password. Mostra ogni requisito attivo con ✓/• a seconda che la
// password corrente lo soddisfi. Puramente informativo: la validazione autorevole è del backend.
// `policy` arriva da GET /api/auth/password-policy (con fallback ai default se non ancora caricata).
export default function PasswordRequirements({ password, policy }) {
  const checks = evaluatePassword(password, policy);

  return (
    <ul className="password-requirements" aria-label="Requisiti della password">
      {checks.map((c) => (
        <li key={c.key} className={c.met ? 'req-met' : 'req-unmet'}>
          <span className="req-icon" aria-hidden="true">{c.met ? <CheckIcon size={13} /> : <DotIcon size={7} />}</span>
          {c.label}
        </li>
      ))}
    </ul>
  );
}
