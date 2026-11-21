// Este programa é um software livre (Licença AGPLv3)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { issueUserStorageSession, issueOrganizationVaultSession, getEdgeStorageServerUrl } from '@/lib/edge-ticket';

export async function POST(req: NextRequest) {
  try {
    const { targetFolder: rawFolder, fileName, orgSlug, scope, payload } = await req.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const isPersonal = scope === 'personal' || (!orgSlug && scope !== 'org');
    let orgId: string | null = null;
    let effectiveTargetFolder = (rawFolder || '').trim().replace(/^\/+|\/+$/g, '');

    if (!effectiveTargetFolder) {
      effectiveTargetFolder = rawFolder?.includes('modelo') ? 'studio/modelos' : 'studio/prontos';
    }

    let ticket = '';
    if (isPersonal) {
      // Remove prefixos acidentais de organização no escopo pessoal
      effectiveTargetFolder = effectiveTargetFolder.replace(/^orgs\/[^/]+\/?/, '');
      const userSession = await issueUserStorageSession(supabase, user.id);
      ticket = userSession.vaultTicket.ticket;
    } else {
      const { data: org } = await supabase.from('organizations').select('id').ilike('slug', orgSlug || '').maybeSingle();
      if (!org) {
        return NextResponse.json({ ok: false, error: 'Organização não encontrada.' }, { status: 404 });
      }
      orgId = org.id;
      const orgSession = await issueOrganizationVaultSession(supabase, user.id, org.id);
      if (!orgSession.canWriteOrgVault) {
        return NextResponse.json({ ok: false, error: 'Sem permissão de gravação no cofre da organização.' }, { status: 403 });
      }
      ticket = orgSession.vaultTicket.ticket;
    }

    const isModelo = effectiveTargetFolder.includes('modelos');
    const category = isModelo ? 'Modelos Studio' : 'Artes Prontas';
    const album = 'Studio';

    const serverUrl = getEdgeStorageServerUrl();
    if (!ticket || !serverUrl) {
      return NextResponse.json({ ok: false, error: 'Servidor de armazenamento ou ticket indisponível.' }, { status: 503 });
    }

    // 1. Enviar payload JSON para o daemon server.js (/api/tenant/upload)
    const jsonStr = JSON.stringify({
      title: payload?.title,
      aspectRatio: payload?.aspectRatio,
      slides: payload?.slides,
      previewDataUrl: payload?.previewDataUrl,
      orgSlug: isPersonal ? undefined : orgSlug,
      scope: isPersonal ? 'personal' : 'org',
    });
    const jsonBlob = new Blob([jsonStr], { type: 'application/json' });
    const jsonBytes = jsonBlob.size;
    const jsonRelPath = `${effectiveTargetFolder}/${fileName}`;

    const formData = new FormData();
    formData.append('file', jsonBlob, fileName);
    formData.append('folderPath', effectiveTargetFolder);
    const uploadRes = await fetch(`${serverUrl}/api/tenant/upload`, {
      method: 'POST',
      headers: { 'x-tenant-ticket': ticket },
      body: formData,
    });

    if (!uploadRes.ok) {
      const errJson = await uploadRes.json().catch(() => ({}));
      return NextResponse.json({
        ok: false,
        error: errJson.error || `Falha no upload para o cofre (${uploadRes.status}).`,
      }, { status: uploadRes.status });
    }

    // 2. Indexa JSON em public.user_files_index SOMENTE após validação de sucesso do upload
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
      visibility: isPersonal ? 'private' : 'org',
      has_pin: false,
    }, { onConflict: 'vault_scope_key,relative_path' });

    // 3. Se houver preview PNG, salva também a imagem física no server.js e indexa
    if (payload?.previewDataUrl && typeof payload.previewDataUrl === 'string' && payload.previewDataUrl.startsWith('data:image/')) {
      try {
        const base64Data = payload.previewDataUrl.split(',')[1];
        if (base64Data) {
          const buffer = Buffer.from(base64Data, 'base64');
          const previewName = fileName.replace(/\.json$/, '') + '.png';
          const previewRelPath = `${effectiveTargetFolder}/${previewName}`;
          const previewBlob = new Blob([buffer], { type: 'image/png' });

          const previewForm = new FormData();
          previewForm.append('file', previewBlob, previewName);
          previewForm.append('folderPath', effectiveTargetFolder);
          const previewRes = await fetch(`${serverUrl}/api/tenant/upload`, {
            method: 'POST',
            headers: { 'x-tenant-ticket': ticket },
            body: previewForm,
          }).catch(() => null);

          if (previewRes && previewRes.ok) {
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
              visibility: isPersonal ? 'private' : 'org',
              has_pin: false,
            }, { onConflict: 'vault_scope_key,relative_path' });
          }
        }
      } catch {}
    }

    return NextResponse.json({ ok: true, path: jsonRelPath });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message) }, { status: 500 });
  }
}
