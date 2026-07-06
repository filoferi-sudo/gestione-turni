const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // esclude caratteri ambigui (0/O, 1/I, ecc.)

// Genera un codice iniziale leggibile ad es. "K7P2Q9"
function generateInitialCode(length = 6) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

module.exports = { generateInitialCode };
