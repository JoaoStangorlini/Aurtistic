// Este programa é um software livre (Licença AGPLv3)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { signEdgeTenantTicket, getEdgeStorageServerUrl } from '@/lib/edge-ticket';

export async function POST(req: NextRequest) {
  try {
    const { targetFolder, fileName, orgSlug, payload } = await req.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { data: org } = await supabase.from('organizations').select('id').ilike('slug', orgSlug || '').maybeSingle();
    const orgId = org?.id || null;
    const isModelo = targetFolder.includes('/modelos');
    const category = isModelo ? 'Modelos Studio' : 'Artes Prontas';
    const album = 'Studio';

    const serverUrl = getEdgeStorageServerUrl();
    let ticket = '';
    try {
      const ticketRes = signEdgeTenantTicket({
        userId: user.id,
        scopeType: 'org',
        orgSlug,
        role: 'admin',
        readOnly: false,
        ttlMs: 60 * 60 * 1000,
      });
      ticket = ticketRes.ticket;
    } catch {}

    // 1. Enviar payload JSON para o daemon server.js (/api/tenant/upload)
    const jsonStr = JSON.stringify({ title: payload?.title, aspectRatio: payload?.aspectRatio, slides: payload?.slides, previewDataUrl: payload?.previewDataUrl, orgSlug });
    const jsonBlob = new Blob([jsonStr], { type: 'application/json' });
    const jsonBytes = jsonBlob.size;
    const jsonRelPath = `${targetFolder}/${fileName}`;

    if (ticket && serverUrl) {
      try {
        const formData = new FormData();
        formData.append('file', jsonBlob, fileName);
        formData.append('folderPath', targetFolder);
        await fetch(`${serverUrl}/api/tenant/upload`, {
          method: 'POST',
          headers: { 'x-tenant-ticket': ticket },
          body: formData,
        }).catch(() => null);
      } catch {}
    }

    // 2. Indexa JSON em public.user_files_index
    await supabase.from('user_files_index').upsert({
      user_id: user.id,
      organization_id: orgId,
      relative_path: jsonRelPath,
      filename: fileName,
      mime_type: 'application/json',
      size_bytes: jsonBytes,
      is_directory: false,
      album,
      category,
      visibility: 'org',
      has_pin: false,
    }, { onConflict: 'vault_scope_key,relative_path' });

    // 3. Se houver preview PNG, salva também a imagem física no server.js e indexa
    if (payload?.previewDataUrl && typeof payload.previewDataUrl === 'string' && payload.previewDataUrl.startsWith('data:image/')) {
      try {
        const base64Data = payload.previewDataUrl.split(',')[1];
        if (base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          const previewName = fileName.replace(/\.json$/, '') + '.png';
          const previewRelPath = `${targetFolder}/${previewName}`;
          const previewBlob = new Blob([buffer], { type: 'image/png' });

          if (ticket && serverUrl) {
            const previewForm = new FormData();
            previewForm.append('file', previewBlob, previewName);
            previewForm.append('folderPath', targetFolder);
            await fetch(`${serverUrl}/api/tenant/upload`, {
              method: 'POST',
              headers: { 'x-tenant-ticket': ticket },
              body: previewForm,
            }).catch(() => null);
          }

          await supabase.from('user_files_index').upsert({
            user_id: user.id,
            organization_id: orgId,
            relative_path: previewRelPath,
            filename: previewName,
            mime_type: 'image/png',
            size_bytes: buffer.length,
            is_directory: false,
            album,
            category,
            visibility: 'org',
            has_pin: false,
          }, { onConflict: 'vault_scope_key,relative_path' });
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, path: jsonRelPath });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message) }, { status: 500 });
  }
}
