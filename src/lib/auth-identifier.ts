// Este programa é um software livre (Licença AGPLv3)

export const MIN_PASSWORD_LENGTH = 8;

export type NormalizedAuthIdentifier =
  | {
      ok: true;
      kind: 'email' | 'username';
      email: string;
      username: string;
      displayLabel: string;
    }
  | {
      ok: false;
      error: string;
    };

const STRICT_USERNAME_REGEX = /^[a-zA-Z0-9._-]{3,32}$/;
const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeAuthIdentifier(
  rawInput: string,
  options?: { strictUsername?: boolean }
): NormalizedAuthIdentifier {
  let clean = String(rawInput || '').trim();
  if (!clean) {
    return { ok: false, error: 'Informe seu usuário ou e-mail.' };
  }

  if (clean.startsWith('@') && !clean.slice(1).includes('@')) {
    clean = clean.slice(1).trim();
  }

  if (!clean) {
    return { ok: false, error: 'Informe um usuário ou e-mail válido.' };
  }

  if (clean.includes('@')) {
    const emailLower = clean.toLowerCase();
    if (!BASIC_EMAIL_REGEX.test(emailLower) || emailLower.length > 254) {
      return { ok: false, error: 'Endereço de e-mail inválido.' };
    }
    const localPart = emailLower
      .split('@')[0]
      .replace(/[^a-z0-9._-]+/g, '')
      .slice(0, 32);
    return {
      ok: true,
      kind: 'email',
      email: emailLower,
      username: localPart || 'usuario',
      displayLabel: emailLower,
    };
  }

  const strict = Boolean(options?.strictUsername);
  if (strict) {
    if (
      !STRICT_USERNAME_REGEX.test(clean) ||
      clean.includes('..') ||
      clean.startsWith('.') ||
      clean.endsWith('.')
    ) {
      return {
        ok: false,
        error:
          'Use de 3 a 32 caracteres: apenas letras sem acento, números, "_", "-" ou "." (sem espaços ou pontos seguidos).',
      };
    }
    const lower = clean.toLowerCase();
    return {
      ok: true,
      kind: 'username',
      email: `${lower}@aurtistic.local`,
      username: lower,
      displayLabel: lower,
    };
  }

  // Modo compatível para login de contas legadas
  const legacyUsername = clean
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .toLowerCase();

  if (!legacyUsername) {
    return { ok: false, error: 'Nome de usuário inválido.' };
  }

  return {
    ok: true,
    kind: 'username',
    email: `${legacyUsername}@aurtistic.local`,
    username: legacyUsername,
    displayLabel: legacyUsername,
  };
}

export function validateSignupInputs(input: {
  rawIdentifier: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}):
  | { ok: true; identifier: Extract<NormalizedAuthIdentifier, { ok: true }> }
  | { ok: false; error: string } {
  const idRes = normalizeAuthIdentifier(input.rawIdentifier, { strictUsername: true });
  if (!idRes.ok) {
    return { ok: false, error: idRes.error };
  }

  const password = String(input.password || '');
  const confirmPassword = String(input.confirmPassword || '');

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`,
    };
  }

  if (password !== confirmPassword) {
    return { ok: false, error: 'As senhas informadas não coincidem.' };
  }

  if (!input.acceptTerms) {
    return {
      ok: false,
      error: 'Você precisa aceitar os Termos de Uso e a Política de Privacidade para criar sua conta.',
    };
  }

  return { ok: true, identifier: idRes };
}

export function formatSupabaseAuthError(
  error: unknown,
  fallbackMessage = 'Não foi possível concluir a operação. Tente novamente em instantes.'
): string {
  let rawMsg = '';
  if (typeof error === 'string') {
    rawMsg = error;
  } else if (error && typeof error === 'object') {
    const rec = error as { message?: unknown; msg?: unknown; error_description?: unknown; code?: unknown };
    rawMsg = String(rec.message || rec.msg || rec.error_description || '').trim();
  }

  if (!rawMsg || rawMsg === '{}' || rawMsg === '[]' || rawMsg === '[object Object]') {
    return fallbackMessage;
  }

  const lower = rawMsg.toLowerCase();
  if (lower.includes('database error saving new user')) {
    return 'Falha interna ao preparar seu perfil no banco de dados. Tente novamente em alguns instantes.';
  }
  if (lower.includes('user already registered') || lower.includes('already been registered')) {
    return 'Este usuário ou e-mail já está cadastrado. Tente entrar com sua senha.';
  }
  if (lower.includes('invalid login credentials')) {
    return 'Usuário ou senha incorretos.';
  }
  if (lower.includes('password should be at least')) {
    return `A senha deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.';
  }
  if (lower.includes('email address') && lower.includes('invalid')) {
    return 'O identificador ou e-mail informado não foi aceito pelo servidor de autenticação.';
  }

  return rawMsg;
}
