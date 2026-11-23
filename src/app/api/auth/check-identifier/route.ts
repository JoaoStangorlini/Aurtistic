// Este programa é um software livre (Licença AGPLv3)
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { normalizeAuthIdentifier } from '@/lib/auth-identifier';

export const dynamic = 'force-dynamic';

/**
 * Interface de store para rate limiting.
 * Limitação conhecida em serverless: a implementação em memória abaixo protege por instância/worker;
 * em escala multi-instância, basta injetar um store persistente (Upstash Redis, Postgres ou Turnstile)
 * mantendo exatamente este contrato.
 */
export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

class InMemoryRateLimitStore implements RateLimitStore {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  async consume(key: string, limit: number, windowMs: number) {
    const now = Date.now();
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits.entries()) {
        if (v.resetAt <= now) this.hits.delete(k);
      }
    }

    const current = this.hits.get(key);
    if (!current || current.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }

    if (current.count >= limit) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
      };
    }

    current.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

const defaultRateLimiter: RateLimitStore = new InMemoryRateLimitStore();
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;

function extractClientIp(req: Request): string {
  const vercelIp = req.headers.get('x-vercel-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const forwarded = req.headers.get('x-forwarded-for');
  const candidate = vercelIp || realIp || forwarded || '';
  const first = candidate.split(',')[0]?.trim();
  return first || 'unknown';
}

export async function POST(req: Request) {
  try {
    const clientIp = extractClientIp(req);
    const rate = await defaultRateLimiter.consume(
      `check_id:${clientIp}`,
      RATE_LIMIT_MAX_REQUESTS,
      RATE_LIMIT_WINDOW_MS
    );

    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Muitas consultas seguidas. Aguarde alguns segundos e tente novamente.' },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSeconds) },
        }
      );
    }

    const body = (await req.json().catch(() => null)) as { identifier?: unknown } | null;
    const rawIdentifier = typeof body?.identifier === 'string' ? body.identifier : '';

    const parsed = normalizeAuthIdentifier(rawIdentifier, { strictUsername: false });
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    }

    const strictCheck = normalizeAuthIdentifier(rawIdentifier, { strictUsername: true });

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Verificação automática de usuário indisponível neste servidor (SUPABASE_SERVICE_ROLE_KEY ausente).',
        },
        { status: 503 }
      );
    }

    const { data, error } = await adminClient.rpc('check_auth_identifier_exists', {
      p_identifier: parsed.email,
    });

    if (error) {
      console.error('[check-identifier] RPC error:', error.message || error);
      return NextResponse.json(
        { ok: false, error: 'Não foi possível verificar o usuário agora. Tente novamente.' },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      exists: Boolean(data),
      kind: parsed.kind,
      displayLabel: parsed.displayLabel,
      isValidForSignup: strictCheck.ok,
      signupValidationError: strictCheck.ok ? null : strictCheck.error,
    });
  } catch (err) {
    console.error('[check-identifier] Unexpected error:', err);
    return NextResponse.json(
      { ok: false, error: 'Erro ao validar identificador.' },
      { status: 500 }
    );
  }
}
