// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const rawNext = searchParams.get('next') || '/';
  const source = searchParams.get('source');

  // Sanitização rigorosa contra Open Redirect (CWE-601)
  let safeNext = '/';
  if (
    typeof rawNext === 'string' &&
    rawNext.startsWith('/') &&
    !rawNext.startsWith('//') &&
    !rawNext.includes('\\') &&
    !/^\/+[a-zA-Z0-9]+:/.test(rawNext)
  ) {
    safeNext = rawNext;
  }

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.user) {
      // Se a origem for o fluxo do HUB LabDiv, associa automaticamente o usuário à organização LabDiv
      if (source === 'hublabdiv') {
        const labdivOrgId = '1ab41410-0000-4000-8000-000000000001';
        try {
          // Busca placeholder correspondente pelo e-mail se houver
          const { data: placeholder } = await supabase
            .from('organization_members')
            .select('id')
            .eq('organization_id', labdivOrgId)
            .eq('is_placeholder', true)
            .ilike('email', data.user.email || '')
            .maybeSingle();

          await supabase.rpc('link_hublabdiv_member', {
            p_user_id: data.user.id,
            p_org_id: labdivOrgId,
            p_target_placeholder_id: placeholder?.id || null,
          });
        } catch {
          // Silencioso se já estiver associado ou política restringir
        }
      }

      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  // Falha na troca do código
  return NextResponse.redirect(`${origin}/login?error=auth_exchange_failed`);
}

