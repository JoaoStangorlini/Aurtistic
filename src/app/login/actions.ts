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
