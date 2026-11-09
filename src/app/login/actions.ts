// Este programa é um software livre (Licença AGPLv3)
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { signHubSsoTicket } from '@/lib/hub-sso';

/**
 * Autenticação padrão de Usuário e Senha do Aurtistic
 */
export async function login(formData: FormData) {
  const supabase = await createClient();

  let rawInput = (
    (formData.get('username') as string) ||
    (formData.get('email') as string) ||
    ''
  ).trim();
  if (rawInput.startsWith('@')) {
    rawInput = rawInput.slice(1);
  }
  const password = formData.get('password') as string;
  const next = (formData.get('next') as string) || '/';

  if (!rawInput || !password) {
    redirect(`/login?error=${encodeURIComponent('Preencha o usuário e a senha.')}&next=${encodeURIComponent(next)}`);
  }

  let email = '';

  if (rawInput.includes('@')) {
    email = rawInput;
  } else {
    // Sanitização idêntica ao loginAurtistic histórico para preservar contas existentes
    const sanitizedUsername = rawInput
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .toLowerCase();

    if (!sanitizedUsername) {
      redirect(`/login?error=${encodeURIComponent('Usuário inválido.')}&next=${encodeURIComponent(next)}`);
    }

    email = `${sanitizedUsername}@aurtistic.local`;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/login?error=${encodeURIComponent('Usuário ou senha incorretos.')}&next=${encodeURIComponent(next)}`);
  }

  revalidatePath('/', 'layout');

  let targetRoute = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  if (targetRoute === '/') {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('features_config')
          .eq('id', user.id)
          .maybeSingle();
        const modules = profile?.features_config?.modules;
        if (modules?.defaultRoute && modules.defaultRoute.startsWith('/') && !modules.defaultRoute.startsWith('//')) {
          targetRoute = modules.defaultRoute;
        }
      }
    } catch {
      // fallback para '/'
    }
  }

  redirect(targetRoute);
}

/**
 * Cadastro direto de nova conta no Aurtistic
 */
export async function signup(formData: FormData) {
  const supabase = await createClient();

  let rawInput = (
    (formData.get('username') as string) ||
    (formData.get('email') as string) ||
    ''
  ).trim();
  const password = formData.get('password') as string;
  const fullName = ((formData.get('fullName') as string) || '').trim();
  const next = (formData.get('next') as string) || '/';

  if (!rawInput || !password) {
    redirect(`/login?error=${encodeURIComponent('Preencha os dados de cadastro.')}&next=${encodeURIComponent(next)}`);
  }

  if (rawInput.startsWith('@')) {
    rawInput = rawInput.slice(1);
  }

  let email = '';
  let username = '';

  if (rawInput.includes('@')) {
    email = rawInput.toLowerCase();
    username = email.split('@')[0];
  } else {
    username = rawInput
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .toLowerCase();

    if (!username) {
      redirect(`/login?error=${encodeURIComponent('Nome de usuário inválido.')}&next=${encodeURIComponent(next)}`);
    }

    email = `${username}@aurtistic.local`;
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        full_name: fullName || username,
      },
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent('Erro ao criar conta: ' + error.message)}&next=${encodeURIComponent(next)}`);
  }

  if (data?.user) {
    try {
      await supabase.from('user_profiles').upsert(
        {
          id: data.user.id,
          username,
          full_name: fullName || username,
          features_config: {
            active: ['tasks', 'resumo', 'curriculo', 'portfolio', 'servidor', 'organizacoes'],
            order: ['tasks', 'resumo', 'curriculo', 'portfolio', 'servidor', 'organizacoes'],
            layout_style: 'default',
          },
        },
        { onConflict: 'id' }
      );
    } catch {}
  }

  // Tenta autenticar automaticamente após cadastro
  await supabase.auth.signInWithPassword({ email, password });
  revalidatePath('/', 'layout');

  if (next && next.startsWith('/') && !next.startsWith('//')) {
    redirect(next);
  } else {
    redirect('/');
  }
}

/**
 * Retorna os membros oficiais do LabDiv cadastrados no HUB para o seletor rápido
 */
export async function getHubLabDivMembersAction() {
  const hubUrl = process.env.HUB_SUPABASE_URL;
  const hubKey = process.env.HUB_SUPABASE_ANON_KEY;

  if (!hubUrl || !hubKey) {
    return [];
  }

  try {
    const hubClient = createSupabaseClient(hubUrl, hubKey);
    const { data, error } = await hubClient
      .from('profiles')
      .select('id, full_name, username, email, avatar_url, role, is_labdiv, member_initiatives')
      .eq('is_labdiv', true)
      .order('full_name', { ascending: true });

    if (error || !data) return [];
    return data;
  } catch {
    return [];
  }
}

/**
 * Autentica diretamente com a identidade institucional do HUB LabDiv
 */
export async function loginHubMemberDirectAction(identifier: string, next: string = '/labdiv') {
  const hubUrl = process.env.HUB_SUPABASE_URL;
  const hubKey = process.env.HUB_SUPABASE_ANON_KEY;
  const ssoSecret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET;

  if (!hubUrl || !hubKey || !ssoSecret) {
    redirect(`/login?error=${encodeURIComponent('Configuração de integração com o HUB incompleta.')}&next=${encodeURIComponent(next)}`);
  }

  try {
    const hubClient = createSupabaseClient(hubUrl, hubKey);

    // Busca usuário no HUB por email, username ou id
    let query = hubClient
      .from('profiles')
      .select('id, full_name, username, email, avatar_url, role, is_labdiv, member_initiatives');

    if (identifier.includes('@')) {
      query = query.ilike('email', identifier.trim());
    } else if (identifier.length === 36 && identifier.includes('-')) {
      query = query.eq('id', identifier.trim());
    } else {
      query = query.or(`username.ilike.${identifier.trim()},full_name.ilike.%${identifier.trim()}%`);
    }

    const { data: profiles, error: queryErr } = await query.limit(1);

    if (queryErr || !profiles || profiles.length === 0) {
      redirect(`/login?error=${encodeURIComponent('Membro do HUB não localizado.')}&next=${encodeURIComponent(next)}`);
    }

    const profile = profiles[0];

    // Mapeia organizações do usuário
    const orgsSet = new Set<string>();
    if (profile.is_labdiv) orgsSet.add('labdiv');
    if (Array.isArray(profile.member_initiatives)) {
      profile.member_initiatives.forEach((init: string) => {
        if (typeof init === 'string' && init.trim()) {
          orgsSet.add(init.trim().toLowerCase());
        }
      });
    }

    const rawUsername =
      profile.username?.trim() ||
      profile.full_name?.split(' ')[0] ||
      profile.email?.split('@')[0] ||
      'membro';

    // Gera ticket SSO autenticado
    const ticket = signHubSsoTicket(
      {
        hubUserId: profile.id,
        email: profile.email || `${rawUsername.toLowerCase()}@aurtistic.local`,
        username: rawUsername,
        fullName: profile.full_name || rawUsername,
        avatarUrl: profile.avatar_url || null,
        isLabdiv: Boolean(profile.is_labdiv),
        organizations: Array.from(orgsSet),
        role: profile.role || 'user',
      },
      ssoSecret,
      300
    );

    // Redireciona para o callback interno para sincronizar sessão e cookies
    redirect(`/auth/hub-callback?ticket=${encodeURIComponent(ticket)}&next=${encodeURIComponent(next)}`);
  } catch (err: unknown) {
    if ((err as any)?.digest?.startsWith('NEXT_REDIRECT')) {
      throw err;
    }
    redirect(
      `/login?error=${encodeURIComponent(
        'Falha no vínculo com o HUB: ' + (err instanceof Error ? err.message : String(err))
      )}&next=${encodeURIComponent(next)}`
    );
  }
}
