// Este programa é um software livre (Licença AGPLv3)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get('orgSlug') || req.nextUrl.searchParams.get('org') || '';
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ drafts: [] });

    let orgId: string | null = null;
    if (orgSlug) {
      const { data: org } = await supabase.from('organizations').select('id').ilike('slug', orgSlug).maybeSingle();
      orgId = org?.id || null;
    }
    if (!orgId) {
      const { data: anyOrg } = await supabase.from('organizations').select('id').limit(1).maybeSingle();
      orgId = anyOrg?.id || null;
    }
    if (!orgId) return NextResponse.json({ drafts: [] });

    const { data } = await supabase
      .from('studio_draft_versions')
      .select('slot_index, title, aspect_ratio, draft_payload, updated_at')
      .eq('user_id', user.id)
      .eq('org_id', orgId)
      .order('slot_index');

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
    return NextResponse.json({ drafts: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { slotIndex, orgSlug, draft } = await req.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    let orgId: string | null = null;
    if (orgSlug) {
      const { data: org } = await supabase.from('organizations').select('id').ilike('slug', orgSlug).maybeSingle();
      orgId = org?.id || null;
    }
    if (!orgId) {
      const { data: anyOrg } = await supabase.from('organizations').select('id').limit(1).maybeSingle();
      orgId = anyOrg?.id || null;
    }
    if (!orgId) return NextResponse.json({ ok: false, error: 'Org não encontrada' }, { status: 400 });

    await supabase.from('studio_draft_versions').upsert({
      user_id: user.id,
      org_id: orgId,
      slot_index: slotIndex,
      title: draft.title || `Rascunho ${slotIndex}`,
      aspect_ratio: draft.aspectRatio || '1:1',
      draft_payload: draft,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,org_id,slot_index' });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const slotParam = req.nextUrl.searchParams.get('slotIndex') || req.nextUrl.searchParams.get('slot');
    const orgSlug = req.nextUrl.searchParams.get('orgSlug') || req.nextUrl.searchParams.get('org') || '';
    if (!slotParam) return NextResponse.json({ ok: false, error: 'Slot não informado' }, { status: 400 });

    const slotIndex = parseInt(slotParam, 10);
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });

    let orgId: string | null = null;
    if (orgSlug) {
      const { data: org } = await supabase.from('organizations').select('id').ilike('slug', orgSlug).maybeSingle();
      orgId = org?.id || null;
    }
    if (!orgId) {
      const { data: anyOrg } = await supabase.from('organizations').select('id').limit(1).maybeSingle();
      orgId = anyOrg?.id || null;
    }

    let query = supabase.from('studio_draft_versions').delete().eq('user_id', user.id).eq('slot_index', slotIndex);
    if (orgId) query = query.eq('org_id', orgId);
    await query;

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}

