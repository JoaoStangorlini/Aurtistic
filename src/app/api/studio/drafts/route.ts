// Este programa é um software livre (Licença AGPLv3)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get('org') || '';
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ drafts: [] });

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug)
      .maybeSingle();

    const { data } = await supabase
      .from('studio_draft_versions')
      .select('slot_index, title, aspect_ratio, draft_payload, updated_at')
      .eq('user_id', user.id)
      .eq('org_id', org?.id ?? null)
      .order('slot_index');

    const drafts = (data || []).map((r: any) => ({
      ...r.draft_payload,
      slotIndex: r.slot_index,
      title: r.title,
      aspectRatio: r.aspect_ratio,
      updatedAt: r.updated_at,
    }));
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

    const { data: org } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', orgSlug || '')
      .maybeSingle();

    await supabase.from('studio_draft_versions').upsert({
      user_id: user.id,
      org_id: org?.id ?? null,
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

