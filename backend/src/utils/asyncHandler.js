// Inoltra al middleware di errore le eccezioni sollevate dentro handler async,
// che altrimenti Express (v4) non intercetta automaticamente.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
