// Generatore pseudo-casuale DETERMINISTICO (seedato) per i generatori dei dataset demo: a parità
// di seed la sequenza è identica, quindi ogni ri-caricamento di uno scenario produce lo stesso
// "mondo" traslato sulla nuova data-ancora (dati stabili, verificabili e riproducibili).
// Implementazione senza dipendenze: hash xmur3 per derivare il seed da una stringa + mulberry32.

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Crea un RNG con API di comodo per i generatori di scenario.
function createRng(seedString) {
  const next = mulberry32(xmur3(String(seedString))());
  return {
    // numero in [0, 1)
    next,
    // intero in [min, max] inclusi
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    // elemento casuale di un array
    pick(array) {
      return array[Math.floor(next() * array.length)];
    },
    // true con probabilità p (0..1)
    chance(p) {
      return next() < p;
    },
    // copia mescolata di un array (Fisher-Yates), l'originale non viene toccato
    shuffle(array) {
      const copy = array.slice();
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
      }
      return copy;
    },
  };
}

module.exports = { createRng };
