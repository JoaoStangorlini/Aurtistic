// Este programa é um software livre (Licença AGPLv3)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import {
  PRIMARY_ADMIN_UUID,
  signEdgeTenantTicket,
  getEdgeStorageServerUrl,
} from '@/lib/edge-ticket';
import { buildTenantStreamUrl } from '@/lib/edge-urls';
import type { StudioTemplate } from '@/components/organizacoes/studio/types';

export async function GET(req: NextRequest) {
  try {
    const orgSlug = (req.nextUrl.searchParams.get('orgSlug') || req.nextUrl.searchParams.get('org') || '').trim();
    if (!orgSlug) {
      return NextResponse.json({ templates: [] }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.', templates: [] }, { status: 401 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, slug')
      .ilike('slug', orgSlug)
      .maybeSingle();
    if (!org?.id) return NextResponse.json({ templates: [] });

    if (user.id !== PRIMARY_ADMIN_UUID) {
      const { data: memberRow } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (!memberRow) {
        return NextResponse.json({ error: 'Sem permissão.', templates: [] }, { status: 403 });
      }
    }

    const { data: files } = await supabase
      .from('user_files_index')
      .select('id, filename, relative_path')
      .eq('organization_id', org.id)
      .eq('category', 'Modelos Studio')
      .eq('mime_type', 'application/json')
      .eq('is_directory', false)
      .limit(20);

    if (!files || files.length === 0) return NextResponse.json({ templates: [] });

    let ticket = '';
    const serverUrl = getEdgeStorageServerUrl();
    const resolvedSlug = String(org.slug || orgSlug).trim().toLowerCase();
    try {
      const ticketRes = signEdgeTenantTicket({
        userId: user.id,
        scopeType: 'org',
        organizationId: org.id,
        orgSlug: resolvedSlug,
        allowedOrgSlugs: [resolvedSlug],
        role: 'member',
        readOnly: true,
        ttlMs: 60 * 60 * 1000,
      });
      ticket = ticketRes.ticket;
    } catch {}

    const templates: StudioTemplate[] = [];

    for (const f of files) {
      let payload: any = null;
      if (ticket && serverUrl) {
        try {
          const fetchUrl = buildTenantStreamUrl(f.relative_path, ticket, { serverUrl });
          const res = await fetch(fetchUrl, { signal: AbortSignal.timeout(1500) }).catch(() => null);
          if (res && res.ok) payload = await res.json().catch(() => null);
        } catch {}
      }

      const slides = payload?.slides && Array.isArray(payload.slides) ? payload.slides : [];
      const aspectRatio = payload?.aspectRatio || '1:1';
      const title = payload?.title || f.filename.replace(/\.json$/, '').replace(/[-_]/g, ' ');

      templates.push({
        id: `team-tpl-${f.id}`,
        title,
        description: 'Modelo salvo pela equipe no Cofre',
        category: 'equipe',
        orgSlug,
        previewUrl: payload?.previewDataUrl || '',
        aspectRatio,
        slides,
      });
    }

    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ templates: [] });
  }
}
