// Este programa é um software livre (Licença AGPLv3)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: NextRequest) {
  try {
    const { targetFolder, fileName, orgSlug, payload } = await req.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug || '').maybeSingle();

    const relativePath = `${targetFolder}/${fileName}`;
    const contentStr = JSON.stringify(payload);
    const sizeBytes = new TextEncoder().encode(contentStr).length;

    // Determina categoria e album com base no folder
    const isModelo = targetFolder.includes('/modelos');
    const category = isModelo ? 'Modelos Studio' : 'Artes Prontas';
    const album = 'Studio';

    // Indexa em user_files_index para aparecer no Cofre (/servidor)
    await supabase.from('user_files_index').upsert({
      user_id: user.id,
      organization_id: org?.id ?? null,
      relative_path: relativePath,
      filename: fileName,
      mime_type: 'application/json',
      size_bytes: sizeBytes,
      is_directory: false,
      album,
      category,
      visibility: 'org',
      has_pin: false,
    }, { onConflict: 'vault_scope_key,relative_path' });

    return NextResponse.json({ ok: true, path: relativePath });
  } catch (err: any) {
    console.error('[studio/vault-save]', err);
    return NextResponse.json({ ok: false, error: String(err?.message) }, { status: 500 });
  }
}

