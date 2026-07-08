const crypto = require('crypto');

// Cifratura applicativa dei dati sensibili at-rest (Fase S6). PREDISPOSIZIONE: fornisce il modulo
// (encrypt/decrypt) ma NON è ancora applicato ad alcun campo del database — l'applicazione ai dati
// esistenti è una fase separata, da eseguire solo su conferma esplicita (tocca dati reali).
//
// Algoritmo: AES-256-GCM (cifratura autenticata: garantisce riservatezza E integrità — un
// ciphertext manomesso viene rifiutato in fase di decrypt). IV casuale a 12 byte per ogni valore.
//
// La chiave NON è mai nel codice: arriva da environment variable (DATA_ENCRYPTION_KEY), 32 byte in
// esadecimale (64 caratteri hex, es. `openssl rand -hex 32`).
//
// Formato del valore cifrato (stringa autodescrittiva, pensata per la ROTAZIONE delle chiavi):
//   enc:v1:<iv_base64>:<authTag_base64>:<ciphertext_base64>
// Il secondo campo (`v1`) è l'ID della chiave usata: alla rotazione si emette con una chiave nuova
// (nuovo ID) mantenendo le vecchie disponibili in sola decifratura, così i valori storici restano
// leggibili senza doverli riscrivere tutti in una volta.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const PREFIX = 'enc';

// Costruisce il portachiavi (keyring) dalle env. Non lancia se le chiavi mancano: il modulo è
// predisposto e potrebbe non essere ancora configurato. L'errore scatta solo se si prova a
// cifrare/decifrare davvero senza chiave (vedi encrypt/decrypt).
function buildKeyring() {
  const keys = {};
  let primaryId = null;

  const primaryKeyHex = process.env.DATA_ENCRYPTION_KEY;
  const primaryKeyId = process.env.DATA_ENCRYPTION_KEY_ID || 'v1';
  if (primaryKeyHex) {
    keys[primaryKeyId] = parseKey(primaryKeyHex, primaryKeyId);
    primaryId = primaryKeyId;
  }

  // Chiavi ritirate (solo decifratura), per la rotazione. Formato JSON: {"v1":"<hex>","v0":"<hex>"}.
  const retiredJson = process.env.DATA_ENCRYPTION_KEYS_RETIRED;
  if (retiredJson) {
    let parsed;
    try {
      parsed = JSON.parse(retiredJson);
    } catch (e) {
      throw new Error('DATA_ENCRYPTION_KEYS_RETIRED non è un JSON valido');
    }
    for (const [id, hex] of Object.entries(parsed)) {
      keys[id] = parseKey(hex, id);
    }
  }

  return { keys, primaryId };
}

function parseKey(hex, id) {
  const buf = Buffer.from(String(hex).trim(), 'hex');
  if (buf.length !== 32) {
    throw new Error(`Chiave di cifratura "${id}" non valida: attesi 32 byte in esadecimale (64 hex char). Genera con: openssl rand -hex 32`);
  }
  return buf;
}

// Il keyring è costruito una sola volta al primo utilizzo (lazy), così importare il modulo non
// richiede che le chiavi siano già impostate.
let _keyring = null;
function keyring() {
  if (!_keyring) _keyring = buildKeyring();
  return _keyring;
}

// True se è configurata una chiave primaria (si può cifrare). Utile per abilitare/disabilitare in
// futuro le funzioni che dipendono dalla cifratura, senza far esplodere nulla se non configurata.
function isEncryptionConfigured() {
  return !!keyring().primaryId;
}

// Cifra una stringa. Input null/undefined => ritorna null (comodo per campi nullable: si può
// avvolgere un valore opzionale senza controlli extra). Lancia se manca la chiave primaria.
function encrypt(plaintext) {
  if (plaintext === null || plaintext === undefined) return null;
  const { keys, primaryId } = keyring();
  if (!primaryId) {
    throw new Error('DATA_ENCRYPTION_KEY non configurata: impossibile cifrare.');
  }
  const key = keys[primaryId];
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    PREFIX,
    primaryId,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

// Decifra un valore prodotto da encrypt(). Input null/undefined => null. Se il valore NON è nel
// formato cifrato (es. dato storico ancora in chiaro), lo restituisce invariato: così l'adozione
// graduale della cifratura è sicura (un campo può contenere valori misti durante la migrazione).
function decrypt(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.startsWith(PREFIX + ':')) {
    return value; // non cifrato: verosimilmente un dato storico in chiaro
  }
  const parts = value.split(':');
  if (parts.length !== 5) {
    throw new Error('Valore cifrato malformato');
  }
  const [, keyId, ivB64, tagB64, dataB64] = parts;
  const { keys } = keyring();
  const key = keys[keyId];
  if (!key) {
    throw new Error(`Chiave di cifratura "${keyId}" non disponibile per la decifratura`);
  }
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const ciphertext = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

// True se il valore è nel formato cifrato di questo modulo (utile durante una migrazione graduale).
function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX + ':');
}

// Solo per i test: forza la ricostruzione del keyring dopo aver cambiato le env a runtime.
function _resetKeyringForTests() {
  _keyring = null;
}

module.exports = { encrypt, decrypt, isEncrypted, isEncryptionConfigured, _resetKeyringForTests };
