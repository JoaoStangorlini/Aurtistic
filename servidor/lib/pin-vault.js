// Este programa é um software livre (Licença AGPLv3)
/**
 * lib/pin-vault.js
 * Proteção e isolamento criptográfico de pastas com PIN usando crypto.scryptSync
 * (sem pacotes nativos C++, 100% compatível com Fire Stick e Termux).
 */

const crypto = require('crypto');

const KEY_LEN = 32;

/**
 * Gera salt e hash scrypt para um PIN numérico (4 a 8 dígitos).
 * @param {string} pin - PIN numérico fornecido
 * @returns {{ pinHash: string, pinSalt: string }}
 */
function hashPin(pin) {
  const cleanPin = String(pin || '').trim();
  if (cleanPin.length < 4 || cleanPin.length > 8) {
    throw new Error('O PIN deve conter entre 4 e 8 dígitos numéricos.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(cleanPin, salt, KEY_LEN, { N: 1024, r: 8, p: 1 });
  return {
    pinHash: derivedKey.toString('hex'),
    pinSalt: salt,
  };
}

/**
 * Valida se um PIN fornecido confere com o hash e salt armazenados.
 * @param {string} pin - PIN candidato
 * @param {string} pinHash - Hash gravado
 * @param {string} pinSalt - Salt gravado
 * @returns {boolean}
 */
function verifyPin(pin, pinHash, pinSalt) {
  if (!pin || !pinHash || !pinSalt) return false;
  try {
    const cleanPin = String(pin).trim();
    const derivedKey = crypto.scryptSync(cleanPin, pinSalt, KEY_LEN, { N: 1024, r: 8, p: 1 });
    const candidateHash = derivedKey.toString('hex');

    // Comparação em tempo constante para evitar timing attacks
    return crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(pinHash, 'hex'));
  } catch {
    return false;
  }
}

module.exports = {
  hashPin,
  verifyPin,
};

