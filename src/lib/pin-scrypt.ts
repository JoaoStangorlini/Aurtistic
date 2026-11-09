// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/lib/pin-scrypt.ts (Exclusivo Server-Side — Node.js crypto)

import crypto from 'crypto';
import { validateNumericPin } from './validators';

const KEY_LEN = 32;
const SCRYPT_PARAMS = { N: 1024, r: 8, p: 1 } as const;

/**
 * Gera string compacta scrypt$1024$8$1$<saltHex>$<hashHex> 100% compatível
 * com os parâmetros do servidor/lib/pin-vault.js
 */
export function hashShareOrFolderPin(rawPin: string): string {
  const valid = validateNumericPin(rawPin);
  if (!valid.ok) {
    throw new Error(valid.error);
  }

  const saltHex = crypto.randomBytes(16).toString('hex');
  const derivedHex = crypto
    .scryptSync(valid.data, saltHex, KEY_LEN, SCRYPT_PARAMS)
    .toString('hex');

  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${saltHex}$${derivedHex}`;
}

/**
 * Verifica um PIN contra um registro compactado scrypt$1024$8$1$<saltHex>$<hashHex>
 * ou par legado (pinHash, pinSalt) em tempo constante.
 */
export function verifyShareOrFolderPin(
  candidatePin: string,
  storedEncodedOrHash: string | null | undefined,
  explicitSaltHex?: string
): boolean {
  const valid = validateNumericPin(candidatePin);
  if (!valid.ok || !storedEncodedOrHash) return false;

  try {
    let saltHex = explicitSaltHex || '';
    let expectedHashHex = storedEncodedOrHash;

    if (storedEncodedOrHash.startsWith('scrypt$')) {
      const parts = storedEncodedOrHash.split('$');
      // Formato: scrypt $ N $ r $ p $ saltHex $ hashHex
      if (parts.length !== 6) return false;
      saltHex = parts[4];
      expectedHashHex = parts[5];
    }

    if (!saltHex || !expectedHashHex) return false;

    const derivedBuf = crypto.scryptSync(valid.data, saltHex, KEY_LEN, SCRYPT_PARAMS);
    const expectedBuf = Buffer.from(expectedHashHex, 'hex');

    if (derivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

