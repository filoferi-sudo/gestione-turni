// Configurazione di sicurezza centralizzata, interamente guidata da environment variables.
// Unico punto in cui si leggono le env di sicurezza: i moduli (passwordPolicy, authController,
// ecc.) importano da qui invece di rileggere process.env sparso nel codice. Così i requisiti si
// modificano SOLO cambiando le variabili d'ambiente, senza toccare il codice (requisito esplicito).

// Helper: legge un booleano da env con default. "false"/"0"/"no" => false, tutto il resto col
// default. Trattiamo l'assenza della variabile come "usa il default", non come false.
function envBool(name, defaultValue) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const normalized = String(raw).trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  return defaultValue;
}

// Helper: legge un intero positivo da env con default e minimo di sicurezza.
function envInt(name, defaultValue, min) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  if (typeof min === 'number' && parsed < min) return min;
  return parsed;
}

// --- Politica password (Fase S1) ---
// I default replicano il requisito minimo richiesto: >=8 caratteri, almeno una maiuscola, una
// minuscola, un numero e un carattere speciale. Ogni requisito è disattivabile via env.
const passwordPolicy = {
  minLength: envInt('PASSWORD_MIN_LENGTH', 8, 1),
  requireUppercase: envBool('PASSWORD_REQUIRE_UPPERCASE', true),
  requireLowercase: envBool('PASSWORD_REQUIRE_LOWERCASE', true),
  requireNumber: envBool('PASSWORD_REQUIRE_NUMBER', true),
  requireSpecial: envBool('PASSWORD_REQUIRE_SPECIAL', true),
};

// --- Protezione brute-force (Fase S2) ---
const login = {
  maxAttempts: envInt('LOGIN_MAX_ATTEMPTS', 5, 1),
  lockoutMinutes: envInt('LOGIN_LOCKOUT_MINUTES', 15, 1),
};

// --- Costo bcrypt (già 10 nel codice esistente; reso configurabile senza cambiarne il default) ---
const bcryptRounds = envInt('BCRYPT_ROUNDS', 10, 4);

module.exports = {
  passwordPolicy,
  login,
  bcryptRounds,
  envBool,
  envInt,
};
