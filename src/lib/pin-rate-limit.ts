// Este programa é um software livre (Licença AGPLv3)
/**
 * src/lib/pin-rate-limit.ts
 * Proteção anti-brute-force em memória para verificação de PINs Scrypt.
 * Bloqueia tentativas por 60 segundos após 5 erros consecutivos por chave.
 */

interface RateLimitEntry {
  attempts: number;
  lockedUntil: number;
}

const pinRateLimitStore = new Map<string, RateLimitEntry>();
const MAX_CONSECUTIVE_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_MS = 60 * 1000; // 60 segundos de cooldown

export function checkPinRateLimit(key: string): { allowed: boolean; waitSeconds?: number } {
  const cleanKey = String(key || '').trim();
  const entry = pinRateLimitStore.get(cleanKey);
  if (!entry) return { allowed: true };

  const now = Date.now();
  if (entry.lockedUntil > now) {
    const waitSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
    return { allowed: false, waitSeconds };
  }

  // Se o tempo de bloqueio já expirou, reseta o contador
  if (entry.lockedUntil > 0 && entry.lockedUntil <= now) {
    pinRateLimitStore.delete(cleanKey);
    return { allowed: true };
  }

  return { allowed: true };
}

export function recordPinFailure(key: string): { locked: boolean; waitSeconds?: number } {
  const cleanKey = String(key || '').trim();
  const now = Date.now();
  const entry = pinRateLimitStore.get(cleanKey) || { attempts: 0, lockedUntil: 0 };
  entry.attempts += 1;

  if (entry.attempts >= MAX_CONSECUTIVE_PIN_ATTEMPTS) {
    entry.lockedUntil = now + PIN_LOCKOUT_MS;
    pinRateLimitStore.set(cleanKey, entry);
    return { locked: true, waitSeconds: Math.ceil(PIN_LOCKOUT_MS / 1000) };
  }

  pinRateLimitStore.set(cleanKey, entry);
  return { locked: false };
}

export function resetPinAttempts(key: string): void {
  const cleanKey = String(key || '').trim();
  pinRateLimitStore.delete(cleanKey);
}

