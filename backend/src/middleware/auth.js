const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

// Verifica un JWT di sessione normale (utente già autenticato)
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token mancante' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'session') {
      return res.status(401).json({ error: 'Token non valido per questa operazione' });
    }
    req.user = payload; // { id, username, role, type }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

// Verifica un JWT temporaneo emesso dopo un primo accesso riuscito con il codice iniziale
function authenticateFirstAccess(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token mancante' });
  }

  const token = header.slice('Bearer '.length);

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.type !== 'first_access') {
      return res.status(401).json({ error: 'Token non valido per questa operazione' });
    }
    req.firstAccessUser = payload; // { id, username, type }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token non valido o scaduto' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Accesso riservato ai responsabili' });
  }
  next();
}

const MANAGER_ROLES = ['admin', 'dirigente'];

// Responsabile o dirigente: entrambi gestiscono calendario, dipendenti, statistiche, turni volanti
function requireManager(req, res, next) {
  if (!req.user || !MANAGER_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Accesso riservato a responsabili e dirigente' });
  }
  next();
}

// Solo il dirigente può creare/modificare/eliminare gli account dei responsabili
function requireDirigente(req, res, next) {
  if (!req.user || req.user.role !== 'dirigente') {
    return res.status(403).json({ error: 'Accesso riservato al dirigente' });
  }
  next();
}

module.exports = {
  authenticate,
  authenticateFirstAccess,
  requireAdmin,
  requireManager,
  requireDirigente,
  MANAGER_ROLES,
};
