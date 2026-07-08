// Specchio lato frontend della policy password del backend (backend/src/utils/passwordPolicy.js).
// Serve SOLO per feedback immediato all'utente (checklist live, messaggi): la validazione
// autorevole resta sempre quella del server. La forma della policy arriva da
// GET /api/auth/password-policy, così i requisiti riflettono la configurazione backend senza rebuild.

// Policy di fallback usata finché quella del server non è stata caricata (o se la fetch fallisce):
// coincide con i default del backend, così l'utente non resta senza indicazioni.
export const DEFAULT_POLICY = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
};

const SPECIAL_CHAR_REGEX = /[^A-Za-z0-9]/;

// Costruisce l'elenco dei requisiti attivi con lo stato "soddisfatto" per la password corrente.
// Ritorna [{ key, label, met }], usato dal componente PasswordRequirements per la checklist.
export function evaluatePassword(password, policy = DEFAULT_POLICY) {
  const pw = password || '';
  const checks = [];

  checks.push({
    key: 'minLength',
    label: `Almeno ${policy.minLength} caratteri`,
    met: pw.length >= policy.minLength,
  });
  if (policy.requireUppercase) {
    checks.push({ key: 'uppercase', label: 'Una lettera maiuscola', met: /[A-Z]/.test(pw) });
  }
  if (policy.requireLowercase) {
    checks.push({ key: 'lowercase', label: 'Una lettera minuscola', met: /[a-z]/.test(pw) });
  }
  if (policy.requireNumber) {
    checks.push({ key: 'number', label: 'Un numero', met: /[0-9]/.test(pw) });
  }
  if (policy.requireSpecial) {
    checks.push({ key: 'special', label: 'Un carattere speciale (es. ! @ # $ %)', met: SPECIAL_CHAR_REGEX.test(pw) });
  }

  return checks;
}

// True se la password soddisfa tutti i requisiti attivi (controllo locale, non sostituisce il server).
export function isPasswordValid(password, policy = DEFAULT_POLICY) {
  return evaluatePassword(password, policy).every((c) => c.met);
}
