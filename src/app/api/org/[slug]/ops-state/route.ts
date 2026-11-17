// Este programa é um software livre (Licença AGPLv3)
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { normalizeOrgBrandSlug } from '@/lib/org-brand-tokens';

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-supabase-auth-token',
    'Access-Control-Allow-Credentials': 'true',
    'Cache-Control': 'no-store',
  };
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

    const { data: org } = await supabase
      .from('organizations')
      .select('id, slug, brand_config')
      .eq('slug', normalizedSlug)
      .maybeSingle();

    const brandConfig = (org?.brand_config as Record<string, unknown> | null) || {};
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401, headers });
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const db = serviceKey
      ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : supabase;

    const { data: org } = await db
      .from('organizations')
      .select('id, brand_config')
      .eq('slug', normalizedSlug)
      .maybeSingle();

    if (org) {
      const currentBrand = (org.brand_config as Record<string, unknown> | null) || {};
      const currentOps = (currentBrand.operational_state as Record<string, unknown> | undefined) || {};
      const nextOps = {
        ...currentOps,
        ...(body.operationalStatePatch || {}),
        updatedAt: new Date().toISOString(),
      };
      await db
        .from('organizations')
        .update({
          brand_config: { ...currentBrand, operational_state: nextOps },
          updated_at: new Date().toISOString(),
        })
        .eq('id', org.id);
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

