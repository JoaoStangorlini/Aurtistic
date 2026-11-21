// Este programa é um software livre (Licença AGPLv3)
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import { normalizeOrgBrandSlug } from '@/lib/org-brand-tokens';
import { PRIMARY_ADMIN_UUID } from '@/lib/edge-ticket';

const ALLOWED_CORS_ORIGINS = new Set([
  'https://hub-lab-div.vercel.app',
  'https://aurtistic.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const isAllowed =
    origin &&
    (ALLOWED_CORS_ORIGINS.has(origin) ||
      origin.endsWith('.hublabdiv.com.br') ||
      /^http:\/\/[a-z0-9-]+\.localhost:3001$/i.test(origin));
  const allowOrigin = isAllowed ? origin! : 'https://hub-lab-div.vercel.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-supabase-auth-token',
    'Access-Control-Allow-Credentials': 'true',
    'Cache-Control': 'no-store',
  };
}

async function authorizeOrgOpsAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  normalizedSlug: string
): Promise<
  | { ok: true; userId: string; org: { id: string; slug: string; brand_config: unknown } | null }
  | { ok: false; status: number; error: string }
> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: 'Não autenticado.' };
  }

  const db = createAdminClient() || supabase;
  const { data: org } = await db
    .from('organizations')
    .select('id, slug, brand_config')
    .ilike('slug', normalizedSlug)
    .maybeSingle();

  if (!org) {
    return { ok: false, status: 404, error: 'Organização não encontrada.' };
  }

  if (user.id !== PRIMARY_ADMIN_UUID) {
    const { data: memberRow } = await db
      .from('organization_members')
      .select('id')
      .eq('organization_id', org.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!memberRow) {
      return { ok: false, status: 403, error: 'Sem permissão para esta organização.' };
    }
  }

  return { ok: true, userId: user.id, org };
}

function getHubBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_HUB_URL || 'http://localhost:3001').replace(/\/+$/, '');
}

function signServerToServer(rawBody: string): Record<string, string> {
  const secret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET || '';
  const ts = String(Math.floor(Date.now() / 1000));
  if (!secret) return { 'Content-Type': 'application/json' };
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${rawBody}`).digest('hex');
  return {
    'Content-Type': 'application/json',
    'x-hub-sso-timestamp': ts,
    'x-hub-sso-signature': sig,
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const headers = corsHeaders(request.headers.get('origin'));
  try {
    const { slug } = await params;
    const normalizedSlug = normalizeOrgBrandSlug(slug);
    const supabase = await createClient();

    const authz = await authorizeOrgOpsAccess(supabase, normalizedSlug);
    if (!authz.ok) {
      return NextResponse.json({ ok: false, error: authz.error }, { status: authz.status, headers });
    }

    const brandConfig = (authz.org?.brand_config as Record<string, unknown> | null) || {};
    const operationalState = (brandConfig.operational_state as Record<string, unknown> | undefined) || {};

    let hubQuestions: unknown[] = [];
    let hubSessions: unknown[] = [];
    let hubExperiments: unknown[] = [];

    if (normalizedSlug === 'show-da-fisica') {
      try {
        const hubRes = await fetch(`${getHubBaseUrl()}/api/iniciativas/show-ops-sync`, {
          method: 'GET',
          headers: signServerToServer(''),
          cache: 'no-store',
        });
        if (hubRes.ok) {
          const hubJson = await hubRes.json();
          if (Array.isArray(hubJson.liveQuestions)) hubQuestions = hubJson.liveQuestions;
          if (Array.isArray(hubJson.sessions)) hubSessions = hubJson.sessions;
          if (Array.isArray(hubJson.experiments)) hubExperiments = hubJson.experiments;
        }
      } catch {
        // Fallback silencioso caso o HUB esteja offline
      }
    }

    return NextResponse.json(
      {
        ok: true,
        slug: normalizedSlug,
        operationalState,
        hubLiveQuestions: hubQuestions,
        hubSessions,
        hubExperiments,
      },
      { status: 200, headers }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao consultar ops-state.' },
      { status: 500, headers }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const headers = corsHeaders(request.headers.get('origin'));
  try {
    const { slug } = await params;
    const normalizedSlug = normalizeOrgBrandSlug(slug);
    const body = await request.json().catch(() => ({}));

    const supabase = await createClient();
    const authz = await authorizeOrgOpsAccess(supabase, normalizedSlug);
    if (!authz.ok) {
      return NextResponse.json({ ok: false, error: authz.error }, { status: authz.status, headers });
    }

    const db = createAdminClient() || supabase;
    const org = authz.org;

    if (org) {
      const currentBrand = (org.brand_config as Record<string, unknown> | null) || {};
      const currentOps = (currentBrand.operational_state as Record<string, unknown> | undefined) || {};
      const nextOps = {
        ...currentOps,
        ...(body.operationalStatePatch || {}),
        updatedAt: new Date().toISOString(),
      };
      const { error: updateErr } = await db
        .from('organizations')
        .update({
          brand_config: { ...currentBrand, operational_state: nextOps },
          updated_at: new Date().toISOString(),
        })
        .eq('id', org.id);

      if (updateErr) {
        return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500, headers });
      }
    }

    if (normalizedSlug === 'show-da-fisica' && body.hubSyncAction) {
      const syncBody = JSON.stringify(body.hubSyncAction);
      await fetch(`${getHubBaseUrl()}/api/iniciativas/show-ops-sync`, {
        method: 'POST',
        headers: signServerToServer(syncBody),
        body: syncBody,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true }, { status: 200, headers });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro ao atualizar ops-state.' },
      { status: 500, headers }
    );
  }
}

