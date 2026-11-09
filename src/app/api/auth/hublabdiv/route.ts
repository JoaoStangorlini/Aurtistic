// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/api/auth/hublabdiv/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const LABDIV_ORG_ID = '1ab41410-0000-4000-8000-000000000001';

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false, isMember: false }, { status: 401 });
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('id, full_name, org_role, subteam_id, can_upload_org_vault')
      .eq('organization_id', LABDIV_ORG_ID)
      .eq('user_id', user.id)
      .maybeSingle();

    return NextResponse.json({
      authenticated: true,
      userId: user.id,
      email: user.email,
      isMember: Boolean(member),
      member: member || null,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const claimPlaceholderId = body.placeholderId || null;

    // Conexão administrativa isolada para executar RPC protegida
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: 'Credenciais de serviço não configuradas no servidor.' },
        { status: 500 }
      );
    }

    const adminClient = createAdminClient(supabaseUrl, serviceKey);

    const { data: rpcResult, error: rpcError } = await adminClient.rpc(
      'link_hublabdiv_member',
      {
        p_user_id: user.id,
        p_org_id: LABDIV_ORG_ID,
        p_target_placeholder_id: claimPlaceholderId,
      }
    );

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, result: rpcResult });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno no vínculo.' },
      { status: 500 }
    );
  }
}

