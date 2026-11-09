// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/auth/hub-callback/route.ts
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/utils/supabase/server';
import {
  verifyHubSsoTicket,
  decryptLinkSecret,
  type HubConnectionData,
} from '@/lib/hub-sso';

const LABDIV_ORG_ID = '1ab41410-0000-4000-8000-000000000001';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const ticket = searchParams.get('ticket');
  const rawNext = searchParams.get('next') || '/labdiv';
  const action = searchParams.get('action'); // 'link', 'provision_direct', etc.

  // Sanitização rigorosa de redirecionamento (CWE-601)
  let safeNext = '/labdiv';
  if (
    typeof rawNext === 'string' &&
    rawNext.startsWith('/') &&
    !rawNext.startsWith('//') &&
    !rawNext.includes('\\') &&
    !/^\/+[a-zA-Z0-9]+:/.test(rawNext)
  ) {
    safeNext = rawNext;
  }

  // Validação opcional de parâmetro CSRF (state) quando originado pelo botão SSO do Aurtistic
  const state = searchParams.get('state');
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/aurtistic_sso_state=([^;]+)/);
  const cookieState = match ? match[1] : null;

  if (cookieState && state && cookieState !== state) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Falha na validação CSRF do SSO (state mismatch).')}`
    );
  }

  if (!ticket) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent('Ticket SSO ausente.')}`);
  }

  const secret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET;
  if (!secret) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent('Segredo SSO não configurado no servidor.')}`
    );
  }

  // 1. Valida ticket criptográfico do HUB LabDiv
  const verification = verifyHubSsoTicket(ticket, secret);
  if (!verification.valid || !verification.payload) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(verification.error || 'Ticket SSO inválido.')}`
    );
  }

  const payload = verification.payload;
  const supabase = await createClient();

  // 2. CENÁRIO A: O usuário já está autenticado no Aurtistic e solicitou vinculação
  const {
    data: { user: currentUser },
  } = await supabase.auth.getUser();

  if (currentUser) {
    // Salva a vinculação do HUB na conta atualmente ativa
    try {
      const { data: existingProfile } = await supabase
        .from('user_profiles')
        .select('features_config')
        .eq('id', currentUser.id)
        .maybeSingle();

      const hubConn: HubConnectionData = {
        hub_user_id: payload.hubUserId,
        hub_email: payload.email,
        hub_username: payload.username,
        hub_full_name: payload.fullName,
        hub_avatar_url: payload.avatarUrl || null,
        is_labdiv: Boolean(payload.isLabdiv),
        organizations: payload.organizations || [],
        linked_at: new Date().toISOString(),
        linked_email: currentUser.email || undefined,
      };

      const updatedFeatures = {
        ...(existingProfile?.features_config || {}),
        hub_connection: hubConn,
      };

      await supabase
        .from('user_profiles')
        .update({ features_config: updatedFeatures })
        .eq('id', currentUser.id);

      await supabase.auth.updateUser({
        data: {
          hub_user_id: payload.hubUserId,
          hub_email: payload.email,
          hub_username: payload.username,
          is_labdiv: Boolean(payload.isLabdiv),
        },
      });

      // Sincroniza LabDiv na organização
      if (payload.isLabdiv || payload.organizations?.includes('labdiv')) {
        await supabase.from('organization_members').upsert(
          {
            organization_id: LABDIV_ORG_ID,
            user_id: currentUser.id,
            full_name: payload.fullName || currentUser.user_metadata?.full_name || 'Membro LabDiv',
            email: payload.email,
            org_role: payload.role === 'admin' ? 'admin' : 'member',
            can_upload_org_vault: true,
            cognitive_capacity: 'normal',
            is_placeholder: false,
          },
          { onConflict: 'organization_id,user_id' }
        );
      }
    } catch (err) {
      console.error('Erro ao vincular perfil à sessão ativa:', err);
    }

    let finalNext = safeNext;
    if (finalNext === '/labdiv' || finalNext === '/') {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('features_config')
        .eq('id', currentUser.id)
        .maybeSingle();
      const modules = profile?.features_config?.modules;
      if (modules?.defaultRoute && modules.defaultRoute.startsWith('/') && !modules.defaultRoute.startsWith('//')) {
        finalNext = modules.defaultRoute;
      }
    }

    const res = NextResponse.redirect(`${origin}${finalNext}?hub_linked=success`);
    res.cookies.set('aurtistic_sso_state', '', { maxAge: 0, path: '/' });
    return res;
  }

  // 3. CENÁRIO B: Usuário deslogado -> Verificar se este hub_user_id já está vinculado a uma conta existente
  try {
    const { data: linkedProfiles } = await supabase
      .from('user_profiles')
      .select('*')
      .filter('features_config->hub_connection->>hub_user_id', 'eq', payload.hubUserId)
      .limit(1);

    if (linkedProfiles && linkedProfiles.length > 0) {
      const profile = linkedProfiles[0];
      const hubConn = profile.features_config?.hub_connection as HubConnectionData | undefined;

      // Se possui credencial cifrada vinculada, faz login direto com 1 toque
      if (hubConn?.encrypted_link_secret) {
        const decryptedPassword = decryptLinkSecret(hubConn.encrypted_link_secret, secret);
        if (decryptedPassword) {
          const loginEmail = hubConn.linked_email || `${profile.username}@aurtistic.local`;
          const { error: ssoErr } = await supabase.auth.signInWithPassword({
            email: loginEmail,
            password: decryptedPassword,
          });

          if (!ssoErr) {
            // Sincroniza pertinência ao LabDiv
            if (payload.isLabdiv || payload.organizations?.includes('labdiv')) {
              try {
                await supabase.from('organization_members').upsert(
                  {
                    organization_id: LABDIV_ORG_ID,
                    user_id: profile.id,
                    full_name: payload.fullName,
                    email: payload.email,
                    org_role: payload.role === 'admin' ? 'admin' : 'member',
                    can_upload_org_vault: true,
                    cognitive_capacity: 'normal',
                    is_placeholder: false,
                  },
                  { onConflict: 'organization_id,user_id' }
                );
              } catch {}
            }
            let finalNext = safeNext;
            if (finalNext === '/labdiv' || finalNext === '/') {
              const { data: userProfile } = await supabase
                .from('user_profiles')
                .select('features_config')
                .eq('id', profile.id)
                .maybeSingle();
              const modules = userProfile?.features_config?.modules;
              if (modules?.defaultRoute && modules.defaultRoute.startsWith('/') && !modules.defaultRoute.startsWith('//')) {
                finalNext = modules.defaultRoute;
              }
            }

            const res = NextResponse.redirect(`${origin}${finalNext}`);
            res.cookies.set('aurtistic_sso_state', '', { maxAge: 0, path: '/' });
            return res;
          }
        }
      }
    }
  } catch (err) {
    console.error('Erro ao buscar conta vinculada:', err);
  }

  // 4. CENÁRIO C: Se o usuário solicitou expressamente provisionar nova conta direta
  if (action === 'provision_direct') {
    const rawUsername = payload.username || payload.fullName?.split(' ')[0] || 'membro';
    const sanitizedUsername =
      rawUsername
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toLowerCase() || 'membro_hub';

    const userEmail = payload.email?.includes('@')
      ? payload.email.toLowerCase().trim()
      : `${sanitizedUsername}@aurtistic.local`;

    const ssoPassword =
      crypto.createHmac('sha256', secret).update(`aurtistic_sso_${payload.hubUserId}`).digest('hex') + 'A1!';

    let { error: authError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: ssoPassword,
    });

    if (authError) {
      const { error: signUpError } = await supabase.auth.signUp({
        email: userEmail,
        password: ssoPassword,
        options: {
          data: {
            full_name: payload.fullName,
            username: sanitizedUsername,
            hub_user_id: payload.hubUserId,
            avatar_url: payload.avatarUrl,
          },
        },
      });

      if (signUpError && !signUpError.message.includes('already registered')) {
        return NextResponse.redirect(
          `${origin}/login?error=${encodeURIComponent('Falha ao registrar sessão SSO: ' + signUpError.message)}`
        );
      }

      const retry = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: ssoPassword,
      });
      authError = retry.error;
    }

    if (authError) {
      return NextResponse.redirect(
        `${origin}/login?error=${encodeURIComponent('Erro na sessão SSO: ' + authError.message)}`
      );
    }

    const {
      data: { user: aurtisticUser },
    } = await supabase.auth.getUser();

    if (aurtisticUser) {
      const hubConn: HubConnectionData = {
        hub_user_id: payload.hubUserId,
        hub_email: payload.email,
        hub_username: payload.username,
        hub_full_name: payload.fullName,
        hub_avatar_url: payload.avatarUrl || null,
        is_labdiv: Boolean(payload.isLabdiv),
        organizations: payload.organizations || [],
        linked_at: new Date().toISOString(),
        linked_email: userEmail,
      };

      try {
        await supabase.from('user_profiles').upsert(
          {
            id: aurtisticUser.id,
            username: sanitizedUsername,
            quick_links: [],
            quick_filters: ['responsavel', 'dimensao'],
            quick_sorts: ['status', 'prazo', 'prioridade', 'manual'],
            features_config: {
              active: ['tasks', 'resumo', 'curriculo', 'portfolio', 'servidor', 'organizacoes'],
              order: ['tasks', 'resumo', 'curriculo', 'portfolio', 'servidor', 'organizacoes'],
              layout_style: 'default',
              hub_connection: hubConn,
            },
          },
          { onConflict: 'id' }
        );
      } catch {}

      if (payload.isLabdiv || payload.organizations?.includes('labdiv')) {
        try {
          await supabase.from('organization_members').upsert(
            {
              organization_id: LABDIV_ORG_ID,
              user_id: aurtisticUser.id,
              full_name: payload.fullName,
              email: payload.email,
              org_role: payload.role === 'admin' ? 'admin' : 'member',
              can_upload_org_vault: true,
              cognitive_capacity: 'normal',
              is_placeholder: false,
            },
            { onConflict: 'organization_id,user_id' }
          );
        } catch {}
      }
    }

    let finalNext = safeNext;
    if ((finalNext === '/labdiv' || finalNext === '/') && aurtisticUser) {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('features_config')
        .eq('id', aurtisticUser.id)
        .maybeSingle();
      const modules = profile?.features_config?.modules;
      if (modules?.defaultRoute && modules.defaultRoute.startsWith('/') && !modules.defaultRoute.startsWith('//')) {
        finalNext = modules.defaultRoute;
      }
    }

    const res = NextResponse.redirect(`${origin}${finalNext}`);
    res.cookies.set('aurtistic_sso_state', '', { maxAge: 0, path: '/' });
    return res;
  }

  // 5. CENÁRIO D: Nenhuma conta vinculada detectada -> Oferece a tela para vincular a uma conta existente ou criar nova
  return NextResponse.redirect(
    `${origin}/auth/vincular-conta?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(safeNext)}`
  );
}
