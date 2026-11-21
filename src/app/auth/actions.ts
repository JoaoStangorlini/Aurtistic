// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/auth/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
import {
  verifyHubSsoTicket,
  encryptLinkSecret,
  type HubConnectionData,
} from '@/lib/hub-sso';

const LABDIV_ORG_ID = '1ab41410-0000-4000-8000-000000000001';

/**
 * Vincula uma conta Aurtistic existente a uma identidade autenticada do HUB LabDiv
 */
export async function linkExistingAccountAction(formData: FormData) {
  const ticket = formData.get('ticket') as string;
  const usernameOrEmail = ((formData.get('username') as string) || '').trim();
  const password = formData.get('password') as string;
  const rawNext = (formData.get('next') as string) || '/labdiv';

  const safeNext =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/labdiv';

  if (!ticket) {
    redirect(`/login?error=${encodeURIComponent('Ticket SSO ausente.')}`);
  }

  const secret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET;
  if (!secret) {
    redirect(`/login?error=${encodeURIComponent('Segredo SSO não configurado.')}`);
  }

  const verification = verifyHubSsoTicket(ticket, secret);
  if (!verification.valid || !verification.payload) {
    redirect(
      `/auth/vincular-conta?ticket=${encodeURIComponent(ticket)}&error=${encodeURIComponent(
        verification.error || 'Ticket SSO inválido.'
      )}&next=${encodeURIComponent(safeNext)}`
    );
  }

  const payload = verification.payload;
  const supabase = await createClient();

  if (!usernameOrEmail || !password) {
    redirect(
      `/auth/vincular-conta?ticket=${encodeURIComponent(ticket)}&error=${encodeURIComponent(
        'Informe o usuário e a senha da conta Aurtistic existente.'
      )}&next=${encodeURIComponent(safeNext)}`
    );
  }

  // Normaliza o identificador da conta Aurtistic
  let loginEmail = '';
  if (usernameOrEmail.includes('@')) {
    loginEmail = usernameOrEmail.toLowerCase().trim();
  } else {
    const sanitizedUsername = usernameOrEmail
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .toLowerCase();

    if (!sanitizedUsername) {
      redirect(
        `/auth/vincular-conta?ticket=${encodeURIComponent(ticket)}&error=${encodeURIComponent(
          'Nome de usuário inválido.'
        )}&next=${encodeURIComponent(safeNext)}`
      );
    }
    loginEmail = `${sanitizedUsername}@aurtistic.local`;
  }

  // Valida as credenciais da conta Aurtistic existente
  const { data: authData, error: signInError } =
    await supabase.auth.signInWithPassword({
      email: loginEmail,
      password,
    });

  if (signInError || !authData.user) {
    redirect(
      `/auth/vincular-conta?ticket=${encodeURIComponent(ticket)}&error=${encodeURIComponent(
        'Usuário ou senha do Aurtistic incorretos. Verifique suas credenciais.'
      )}&next=${encodeURIComponent(safeNext)}`
    );
  }

  const aurtisticUser = authData.user;

  // Cifra a credencial local e armazena estritamente na tabela privada (service_role only)
  const encryptedSecret = encryptLinkSecret(password, secret);
  const adminClient = createAdminClient();

  if (adminClient) {
    try {
      await adminClient.from('user_private_secrets').upsert(
        {
          user_id: aurtisticUser.id,
          hub_user_id: payload.hubUserId,
          linked_email: loginEmail,
          encrypted_link_secret: encryptedSecret,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      );
    } catch (secErr) {
      console.warn('[auth/actions] Falha ao persistir user_private_secrets:', secErr);
    }
  }

  const hubConnection: HubConnectionData = {
    hub_user_id: payload.hubUserId,
    hub_email: payload.email,
    hub_username: payload.username,
    hub_full_name: payload.fullName,
    hub_avatar_url: payload.avatarUrl || null,
    is_labdiv: Boolean(payload.isLabdiv),
    organizations: payload.organizations || [],
    linked_at: new Date().toISOString(),
    linked_email: loginEmail,
  };

  // Salva hub_connection público (sem encrypted_link_secret) no perfil do usuário de forma atômica
  try {
    const { error: rpcErr } = await supabase.rpc('merge_user_features_config', {
      p_patch: { hub_connection: hubConnection },
    });

    if (rpcErr && (rpcErr.code === '42883' || rpcErr.message?.includes('merge_user_features_config'))) {
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('features_config')
        .eq('id', aurtisticUser.id)
        .maybeSingle();

      const currentFeatures = existingProfile?.features_config || {};
      const updatedFeatures = {
        ...currentFeatures,
        hub_connection: hubConnection,
      };

      await supabase
        .from('user_profiles')
        .upsert({ id: aurtisticUser.id, features_config: updatedFeatures }, { onConflict: 'id' });
    }
  } catch (err) {
    console.error('Erro ao atualizar hub_connection no perfil:', err);
  }

  // Atualiza metadados do auth
  try {
    await supabase.auth.updateUser({
      data: {
        hub_user_id: payload.hubUserId,
        hub_email: payload.email,
        hub_username: payload.username,
        is_labdiv: Boolean(payload.isLabdiv),
      },
    });
  } catch {
    // Não impeditivo
  }

  // Migração de Ativos de Conta Secundária (Tarefas, Arquivos, Links, Membros) usando adminClient
  try {
    const dbReader = adminClient || supabase;
    let secondaryUserIds: string[] = [];

    if (adminClient) {
      const { data: secretMatches } = await adminClient
        .from('user_private_secrets')
        .select('user_id')
        .eq('hub_user_id', payload.hubUserId)
        .neq('user_id', aurtisticUser.id);
      if (Array.isArray(secretMatches)) {
        secondaryUserIds = secretMatches.map((r: any) => r.user_id).filter(Boolean);
      }

      if (secondaryUserIds.length === 0) {
        const { data: secondaryProfiles } = await adminClient
          .from('user_profiles')
          .select('id, features_config')
          .neq('id', aurtisticUser.id);

        secondaryUserIds = (secondaryProfiles || [])
          .filter((p: any) => {
            const hc = p?.features_config?.hub_connection;
            return (
              hc?.hub_user_id === payload.hubUserId ||
              (hc?.hub_email && hc.hub_email.toLowerCase() === payload.email.toLowerCase())
            );
          })
          .map((p: any) => p.id);
      }
    }

    for (const secId of secondaryUserIds) {
      await dbReader.from('tasks').update({ user_id: aurtisticUser.id }).eq('user_id', secId);
      await dbReader.from('events').update({ user_id: aurtisticUser.id }).eq('user_id', secId);
      await dbReader.from('user_files_index').update({ user_id: aurtisticUser.id }).eq('user_id', secId);
      await dbReader.from('share_links').update({ user_id: aurtisticUser.id }).eq('user_id', secId);

      const { data: secMemberships } = await dbReader
        .from('organization_members')
        .select('*')
        .eq('user_id', secId);

      if (secMemberships && secMemberships.length > 0) {
        for (const m of secMemberships) {
          const { data: masterMembership } = await dbReader
            .from('organization_members')
            .select('id')
            .eq('organization_id', m.organization_id)
            .eq('user_id', aurtisticUser.id)
            .maybeSingle();

          if (!masterMembership) {
            await dbReader
              .from('organization_members')
              .update({ user_id: aurtisticUser.id })
              .eq('id', m.id);
          } else {
            await dbReader
              .from('organization_members')
              .delete()
              .eq('id', m.id);
          }
        }
      }
    }

    // Reivindica perfis placeholder correspondentes ao email no LabDiv ou em outras orgs
    await dbReader
      .from('organization_members')
      .update({
        user_id: aurtisticUser.id,
        is_placeholder: false,
        full_name: payload.fullName || aurtisticUser.user_metadata?.full_name || 'Membro LabDiv',
      })
      .eq('email', payload.email)
      .eq('is_placeholder', true);
  } catch (migErr) {
    console.warn('Aviso na migração de ativos de conta secundária:', migErr);
  }

  // Sincroniza filiação no LabDiv
  if (payload.isLabdiv || payload.organizations?.includes('labdiv')) {
    try {
      await supabase.from('organization_members').upsert(
        {
          organization_id: LABDIV_ORG_ID,
          user_id: aurtisticUser.id,
          full_name: payload.fullName || aurtisticUser.user_metadata?.full_name || 'Membro LabDiv',
          email: payload.email,
          org_role: payload.role === 'admin' ? 'admin' : 'member',
          can_upload_org_vault: true,
          cognitive_capacity: 'normal',
          is_placeholder: false,
        },
        { onConflict: 'organization_id,user_id' }
      );
    } catch {
      // Ignora falhas se tabela não existir
    }
  }

  revalidatePath('/', 'layout');
  redirect(`${safeNext}?hub_linked=success`);
}

/**
 * Cria uma nova conta Aurtistic diretamente a partir da identidade do HUB LabDiv
 */
export async function createAccountFromHubAction(formData: FormData) {
  const ticket = formData.get('ticket') as string;
  const rawNext = (formData.get('next') as string) || '/labdiv';
  const safeNext =
    rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/labdiv';

  if (!ticket) {
    redirect(`/login?error=${encodeURIComponent('Ticket SSO ausente.')}`);
  }

  const secret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET;
  if (!secret) {
    redirect(`/login?error=${encodeURIComponent('Segredo SSO não configurado.')}`);
  }

  const verification = verifyHubSsoTicket(ticket, secret);
  if (!verification.valid || !verification.payload) {
    redirect(
      `/login?error=${encodeURIComponent(
        verification.error || 'Ticket SSO expirado ou inválido.'
      )}`
    );
  }

  // Redireciona de volta para o hub-callback com o ticket para provisionamento direto
  redirect(`/auth/hub-callback?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(safeNext)}&action=provision_direct`);
}

/**
 * Desvincula o perfil do HUB LabDiv da conta atualmente autenticada no Aurtistic
 */
export async function unlinkHubAccountAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: false, error: 'Usuário não autenticado.' };
  }

  try {
    const adminClient = createAdminClient();
    if (adminClient) {
      await adminClient.from('user_private_secrets').delete().eq('user_id', user.id);
    }

    const { error: rpcErr } = await supabase.rpc('merge_user_features_config', {
      p_patch: { hub_connection: null },
    });

    if (rpcErr && (rpcErr.code === '42883' || rpcErr.message?.includes('merge_user_features_config'))) {
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('features_config')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfile?.features_config) {
        const updatedFeatures = { ...existingProfile.features_config };
        delete updatedFeatures.hub_connection;

        await supabase
          .from('user_profiles')
          .update({ features_config: updatedFeatures })
          .eq('id', user.id);
      }
    }

    await supabase.auth.updateUser({
      data: {
        hub_user_id: null,
        hub_email: null,
        hub_username: null,
      },
    });

    revalidatePath('/configuracoes-avancadas');
    revalidatePath('/labdiv');
    return { success: true };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao desvincular conta.',
    };
  }
}

