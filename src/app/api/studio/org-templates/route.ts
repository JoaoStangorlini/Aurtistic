// Este programa é um software livre (Licença AGPLv3)
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const orgSlug = req.nextUrl.searchParams.get('org') || '';
    const supabase = await createClient();
    const { data: org } = await supabase.from('organizations').select('id').eq('slug', orgSlug).maybeSingle();
    if (!org?.id) return NextResponse.json({ templates: [] });

    const { data } = await supabase
      .from('user_files_index')
      .select('id, filename, relative_path')
      .eq('organization_id', org.id)
      .like('relative_path', `%/studio/modelos/%`)
      .eq('mime_type', 'application/json')
      .eq('is_directory', false)
      .limit(30);

    const templates = (data || []).map((r: any) => ({
      id: r.id,
      title: r.filename.replace(/\.json$/, '').replace(/[-_]/g, ' '),
      relativePath: r.relative_path,
    }));
    return NextResponse.json({ templates });
  } catch {
    return NextResponse.json({ templates: [] });
  }
}

