// Este programa é um software livre (Licença AGPLv3)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { sanitizeDraftForStorage } from '@/lib/studio/studio-idb';
import { PRIMARY_ADMIN_UUID } from '@/lib/edge-ticket';

async function resolveVerifiedOrgId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  orgSlug: string
): Promise<{ ok: true; orgId: string } | { ok: false; status: number; error: string }> {
  const cleanSlug = orgSlug.trim();
  if (!cleanSlug) {
    return { ok: false, status: 400, error: 'Organização não informada.' };
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .ilike('slug', cleanSlug)
    .maybeSingle();

  if (!org?.id) {
    return { ok: false, status: 404, error: 'Organização não encontrada.' };
  }

  if (userId !== PRIMARY_ADMIN_UUID) {
    const { data: memberRow } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', org.id)
      .eq('user_id', userId)
      .maybeSingle();
    if (!memberRow) {
      return { ok: false, status: 403, error: 'Sem permissão' };
    }
  }

  return { ok: true, orgId: org.id };
}

export async function GET(req: NextRequest) {
  try {
    const scopeParam = req.nextUrl.searchParams.get('scope');
    const orgSlug = req.nextUrl.searchParams.get('orgSlug') || req.nextUrl.searchParams.get('org') || '';
    const isPersonal = scopeParam === 'personal' || (!orgSlug && scopeParam !== 'org');

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ drafts: [] }, { status: 401 });

    let query = supabase
      .from('studio_draft_versions')
      .select('slot_index, title, aspect_ratio, draft_payload, updated_at, scope_key')
      .eq('user_id', user.id)
      .order('slot_index');

    if (isPersonal) {
      query = query.eq('scope_key', `personal:${user.id}`);
    } else {
      const orgCheck = await resolveVerifiedOrgId(supabase, user.id, orgSlug);
      if (!orgCheck.ok) {
        return NextResponse.json({ drafts: [], error: orgCheck.error }, { status: orgCheck.status });
      }
      query = query.eq('scope_key', `org:${orgCheck.orgId}`);
    }

    const { data, error } = await query;
    if (error) {
      // Fallback para ambiente pré-migration 17 caso scope_key ainda não exista no Supabase
      if (!isPersonal && (error.code === '42703' || error.message?.includes('scope_key'))) {
        const orgCheck = await resolveVerifiedOrgId(supabase, user.id, orgSlug);
        if (orgCheck.ok) {
          const fallbackRes = await supabase
            .from('studio_draft_versions')
            .select('slot_index, title, aspect_ratio, draft_payload, updated_at')
            .eq('user_id', user.id)
            .eq('org_id', orgCheck.orgId)
            .order('slot_index');
          const drafts = (fallbackRes.data || []).map((r: any) => {
            const payload = typeof r.draft_payload === 'string' ? JSON.parse(r.draft_payload) : (r.draft_payload || {});
            return {
              ...payload,
              slotIndex: r.slot_index,
              title: r.title || payload.title || `Rascunho ${r.slot_index}`,
              aspectRatio: r.aspect_ratio || payload.aspectRatio || '1:1',
              slides: Array.isArray(payload.slides) ? payload.slides : [],
              updatedAt: r.updated_at,
            };
          });
          return NextResponse.json({ drafts });
        }
      }
      return NextResponse.json({ drafts: [] });
    }

    const drafts = (data || []).map((r: any) => {
      const payload = typeof r.draft_payload === 'string' ? JSON.parse(r.draft_payload) : (r.draft_payload || {});
      return {
        ...payload,
        slotIndex: r.slot_index,
        title: r.title || payload.title || `Rascunho ${r.slot_index}`,
        aspectRatio: r.aspect_ratio || payload.aspectRatio || '1:1',
        slides: Array.isArray(payload.slides) ? payload.slides : [],
        updatedAt: r.updated_at,
      };
    });
    return NextResponse.json({ drafts });
  } catch {
    return NextResponse.json({ drafts: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { slotIndex, orgSlug, scope, draft } = await req.json();
    const slotNum = Number(slotIndex);
    if (!Number.isInteger(slotNum) || slotNum < 1 || slotNum > 3) {
      return NextResponse.json({ ok: false, error: 'Slot inválido (deve ser 1, 2 ou 3).' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    const isPersonal = scope === 'personal' || (!orgSlug && scope !== 'org');
    let orgId: string | null = null;
    let scopeKey = `personal:${user.id}`;

    if (!isPersonal) {
      const orgCheck = await resolveVerifiedOrgId(supabase, user.id, String(orgSlug || ''));
      if (!orgCheck.ok) {
        return NextResponse.json({ ok: false, error: orgCheck.error }, { status: orgCheck.status });
      }
      orgId = orgCheck.orgId;
      scopeKey = `org:${orgCheck.orgId}`;
    }

    const cleanDraft = sanitizeDraftForStorage(draft);

    const { error } = await supabase.from('studio_draft_versions').upsert({
      user_id: user.id,
      org_id: orgId,
      scope_key: scopeKey,
      slot_index: slotNum,
      title: cleanDraft.title || `Rascunho ${slotNum}`,
      aspect_ratio: cleanDraft.aspectRatio || '1:1',
      draft_payload: cleanDraft,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,scope_key,slot_index' });

    if (error) {
      // Fallback gracioso para constraint antiga se Migration 17 ainda não foi executada
      if (orgId && (error.code === '42703' || error.message?.includes('scope_key') || error.message?.includes('uq_studio_draft_user_scope_slot'))) {
        const { error: fbErr } = await supabase.from('studio_draft_versions').upsert({
          user_id: user.id,
          org_id: orgId,
          slot_index: slotNum,
          title: cleanDraft.title || `Rascunho ${slotNum}`,
          aspect_ratio: cleanDraft.aspectRatio || '1:1',
          draft_payload: cleanDraft,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,org_id,slot_index' });
        if (fbErr) return NextResponse.json({ ok: false, error: fbErr.message }, { status: 500 });
        return NextResponse.json({ ok: true });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const slotParam = req.nextUrl.searchParams.get('slotIndex') || req.nextUrl.searchParams.get('slot');
    const orgSlug = req.nextUrl.searchParams.get('orgSlug') || req.nextUrl.searchParams.get('org') || '';
    const scopeParam = req.nextUrl.searchParams.get('scope');
    const isPersonal = scopeParam === 'personal' || (!orgSlug && scopeParam !== 'org');

    if (!slotParam) return NextResponse.json({ ok: false, error: 'Slot não informado' }, { status: 400 });

    const slotIndex = Number.parseInt(slotParam, 10);
    if (!Number.isInteger(slotIndex) || slotIndex < 1 || slotIndex > 3) {
      return NextResponse.json({ ok: false, error: 'Slot inválido' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    let deleteQuery = supabase
      .from('studio_draft_versions')
      .delete()
      .eq('user_id', user.id)
      .eq('slot_index', slotIndex);

    if (isPersonal) {
      deleteQuery = deleteQuery.eq('scope_key', `personal:${user.id}`);
    } else {
      const orgCheck = await resolveVerifiedOrgId(supabase, user.id, orgSlug);
      if (!orgCheck.ok) {
        return NextResponse.json({ ok: false, error: orgCheck.error }, { status: orgCheck.status });
      }
      deleteQuery = deleteQuery.eq('scope_key', `org:${orgCheck.orgId}`);
    }

    const { error } = await deleteQuery;
    if (error) {
      if (!isPersonal && (error.code === '42703' || error.message?.includes('scope_key'))) {
        const orgCheck = await resolveVerifiedOrgId(supabase, user.id, orgSlug);
        if (orgCheck.ok) {
          await supabase
            .from('studio_draft_versions')
            .delete()
            .eq('user_id', user.id)
            .eq('org_id', orgCheck.orgId)
            .eq('slot_index', slotIndex);
          return NextResponse.json({ ok: true });
        }
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

