// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/lib/validators.ts
// Validação estrita em TypeScript puro (Zero dependências externas como zod)

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUBLIC_SLUG_REGEX = /^[a-z0-9][a-z0-9_-]{1,48}[a-z0-9]$/i;
const SHARE_TOKEN_REGEX = /^[a-zA-Z0-9_-]{8,96}$/;
const NUMERIC_PIN_REGEX = /^\d{4,8}$/;

export const DEFAULT_USER_VAULT_FOLDERS = [
  'Arquivos',
  'Portfolio',
  'Curriculo',
  'Projetos',
] as const;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value.trim());
}

/**
 * Sanitiza um caminho relativo dentro da jaula do usuário (/users/{userId}/...).
 * Bloqueia null bytes, barras invertidas de escape, segmentos ".." ou "." e prefixos absolutos.
 */
export function sanitizeRelativeTenantPath(
  rawPath: unknown,
  options?: { allowEmpty?: boolean; maxLength?: number }
): ValidationResult<string> {
  const allowEmpty = Boolean(options?.allowEmpty);
  const maxLength = options?.maxLength ?? 512;

  if (rawPath === null || rawPath === undefined) {
    return allowEmpty
      ? { ok: true, data: '' }
      : { ok: false, error: 'Caminho relativo obrigatório.' };
  }

  if (typeof rawPath !== 'string') {
    return { ok: false, error: 'Formato de caminho inválido.' };
  }

  if (rawPath.includes('\0')) {
    return { ok: false, error: 'Caractere nulo detectado no caminho.' };
  }

  const normalized = rawPath
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();

  if (!normalized) {
    return allowEmpty
      ? { ok: true, data: '' }
      : { ok: false, error: 'Caminho relativo não pode ser vazio.' };
  }

  if (normalized.length > maxLength) {
    return { ok: false, error: `Caminho excede o limite de ${maxLength} caracteres.` };
  }

  const segments = normalized.split('/');
  for (const seg of segments) {
    if (!seg || seg === '.' || seg === '..') {
      return { ok: false, error: 'Navegação fora do diretório (path traversal) bloqueada.' };
    }
    if (/[\x00-\x1f\x7f]/.test(seg)) {
      return { ok: false, error: 'Caracteres de controle inválidos no caminho.' };
    }
  }

  return { ok: true, data: segments.join('/') };
}

export function sanitizeSafeFilename(rawName: unknown): ValidationResult<string> {
  if (typeof rawName !== 'string') {
    return { ok: false, error: 'Nome de arquivo inválido.' };
  }

  const clean = rawName
    .replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean === '.' || clean === '..') {
    return { ok: false, error: 'Informe um nome de arquivo ou pasta válido.' };
  }

  if (clean.length > 180) {
    return { ok: false, error: 'Nome excede 180 caracteres.' };
  }

  return { ok: true, data: clean };
}

export function validateNumericPin(rawPin: unknown): ValidationResult<string> {
  if (typeof rawPin !== 'string') {
    return { ok: false, error: 'O PIN deve ser uma sequência numérica.' };
  }
  const clean = rawPin.trim();
  if (!NUMERIC_PIN_REGEX.test(clean)) {
    return { ok: false, error: 'O PIN deve conter entre 4 e 8 dígitos numéricos.' };
  }
  return { ok: true, data: clean };
}

export function validatePublicSlug(rawSlug: unknown): ValidationResult<string> {
  if (typeof rawSlug !== 'string') {
    return { ok: false, error: 'Identificador público inválido.' };
  }
  const clean = rawSlug.trim().toLowerCase();
  if (!PUBLIC_SLUG_REGEX.test(clean)) {
    return {
      ok: false,
      error: 'O slug deve ter entre 3 e 50 caracteres (letras, números, hífen ou sublinhado).',
    };
  }
  return { ok: true, data: clean };
}

export function validateShareToken(rawToken: unknown): ValidationResult<string> {
  if (typeof rawToken !== 'string') {
    return { ok: false, error: 'Token de compartilhamento inválido.' };
  }
  const clean = rawToken.trim();
  if (!SHARE_TOKEN_REGEX.test(clean)) {
    return { ok: false, error: 'Formato de token de compartilhamento inválido.' };
  }
  return { ok: true, data: clean };
}

