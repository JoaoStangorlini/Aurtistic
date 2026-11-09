// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/auth/actions.ts
'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
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

  // Cifra a credencial local para permitir logins futuros com 1 clique via SSO do HUB
  const encryptedSecret = encryptLinkSecret(password, secret);

  const hubConnection: HubConnectionData = {
    hub_user_id: payload.hubUserId,
    hub_email: payload.email,
    hub_username: payload.username,
    hub_full_name: payload.fullName,
    hub_avatar_url: payload.avatarUrl || null,
    is_labdiv: Boolean(payload.isLabdiv),
    organizations: payload.organizations || [],
    linked_at: new Date().toISOString(),
    encrypted_link_secret: encryptedSecret,
    linked_email: loginEmail,
  };

  // Salva no perfil do usuário
  try {
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
      .update({ features_config: updatedFeatures })
      .eq('id', aurtisticUser.id);
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

  // Migração de Ativos de Conta Secundária (Tarefas, Arquivos, Links, Membros)
  try {
    const { data: secondaryProfiles } = await supabase
      .from('user_profiles')
      .select('id, features_config')
      .neq('id', aurtisticUser.id);

    const secondaryUserIds = (secondaryProfiles || [])
      .filter((p: any) => {
        const hc = p?.features_config?.hub_connection;
        return (
          hc?.hub_user_id === payload.hubUserId ||
          (hc?.hub_email && hc.hub_email.toLowerCase() === payload.email.toLowerCase())
        );
      })
      .map((p: any) => p.id);

    for (const secId of secondaryUserIds) {
      await supabase.from('tasks').update({ user_id: aurtisticUser.id }).eq('user_id', secId);
      await supabase.from('events').update({ user_id: aurtisticUser.id }).eq('user_id', secId);
      await supabase.from('user_files_index').update({ user_id: aurtisticUser.id }).eq('user_id', secId);
      await supabase.from('share_links').update({ user_id: aurtisticUser.id }).eq('user_id', secId);

      const { data: secMemberships } = await supabase
        .from('organization_members')
        .select('*')
        .eq('user_id', secId);

      if (secMemberships && secMemberships.length > 0) {
        for (const m of secMemberships) {
          const { data: masterMembership } = await supabase
            .from('organization_members')
            .select('id')
            .eq('organization_id', m.organization_id)
            .eq('user_id', aurtisticUser.id)
            .maybeSingle();

          if (!masterMembership) {
            await supabase
              .from('organization_members')
              .update({ user_id: aurtisticUser.id })
              .eq('id', m.id);
          } else {
            await supabase
              .from('organization_members')
              .delete()
              .eq('id', m.id);
          }
        }
      }
    }

    // Reivindica perfis placeholder correspondentes ao email no LabDiv ou em outras orgs
    await supabase
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

