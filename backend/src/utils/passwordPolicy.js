// Validazione centralizzata della robustezza delle password, guidata dalla configurazione in
// config/security.js (a sua volta guidata da env). Usata sia dal primo accesso
// (authController.firstLoginSetup) sia dal reset password (userController.resetPassword) sia dai
// futuri flussi di reset via email: un'unica fonte di verità per le regole, lato backend.
// Il frontend replica gli stessi controlli per UX immediata (frontend/src/utils/passwordPolicy.js),
// ma la validazione autorevole è sempre questa, lato server.

const { passwordPolicy } = require('../config/security');

// Caratteri considerati "speciali". Insieme volutamente ampio (qualunque non alfanumerico), così
// da non costringere l'utente a un sottoinsieme rigido di simboli.
const SPECIAL_CHAR_REGEX = /[^A-Za-z0-9]/;

// Blocklist minima di password palesemente deboli/comuni. Volutamente statica ed embedded (nessuna
// dipendenza esterna): copre i casi più prevedibili. Confronto case-insensitive.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'qwerty', 'qwerty123',
  '12345678', '123456789', '1234567890', 'iloveyou', 'admin', 'admin123',
  'welcome', 'welcome1', 'letmein', 'abc12345', 'changeme', 'password!',
  'p@ssword', 'p@ssw0rd', 'qwertyuiop', 'football', 'baseball', 'superman',
  'trustno1', 'sunshine', 'princess', 'dragon', 'monkey', 'master',
]);

// Restituisce la descrizione strutturata dei requisiti attivi, per esporli al frontend
// (GET /api/auth/password-policy) e mostrare la checklist all'utente.
function describePolicy() {
  return {
    minLength: passwordPolicy.minLength,
    requireUppercase: passwordPolicy.requireUppercase,
    requireLowercase: passwordPolicy.requireLowercase,
    requireNumber: passwordPolicy.requireNumber,
    requireSpecial: passwordPolicy.requireSpecial,
  };
}

// Valida una password contro la policy attiva.
// options.username (opzionale): se la password lo contiene, viene rifiutata.
// Ritorna { valid: boolean, errors: string[] } — errors in italiano, pronti da mostrare.
function validatePassword(password, options = {}) {
  const errors = [];

  if (typeof password !== 'string' || password.length === 0) {
    return { valid: false, errors: ['La password è obbligatoria'] };
  }

  if (password.length < passwordPolicy.minLength) {
    errors.push(`La password deve avere almeno ${passwordPolicy.minLength} caratteri`);
  }
  if (passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('La password deve contenere almeno una lettera maiuscola');
  }
  if (passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('La password deve contenere almeno una lettera minuscola');
  }
  if (passwordPolicy.requireNumber && !/[0-9]/.test(password)) {
    errors.push('La password deve contenere almeno un numero');
  }
  if (passwordPolicy.requireSpecial && !SPECIAL_CHAR_REGEX.test(password)) {
    errors.push('La password deve contenere almeno un carattere speciale (es. ! @ # $ %)');
  }

  const lower = password.toLowerCase();
  if (COMMON_PASSWORDS.has(lower)) {
    errors.push('La password è troppo comune o facilmente prevedibile');
  }

  const username = options.username;
  if (username && typeof username === 'string' && username.length >= 3) {
    if (lower.includes(username.toLowerCase())) {
      errors.push('La password non deve contenere il nome utente');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validatePassword, describePolicy, COMMON_PASSWORDS };
