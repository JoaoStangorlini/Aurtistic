// Este programa é um software livre (Licença AGPLv3)
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import {
  formatSupabaseAuthError,
  normalizeAuthIdentifier,
  validateSignupInputs,
} from '@/lib/auth-identifier';
import { LEGAL_DOCS_VERSION } from '@/lib/legal-documents';

function sanitizeNextRoute(rawNext: unknown, fallback = '/'): string {
  const next = typeof rawNext === 'string' ? rawNext.trim() : '';
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return fallback;
}

export async function performLogin(
  formData: FormData,
  opts: { defaultRedirect?: string; revalidateTarget?: string } = {}
): Promise<never> {
  const supabase = await createClient();
  const rawInput =
    ((formData.get('username') as string) || (formData.get('email') as string) || '').trim();
  const password = String(formData.get('password') || '');
  const next = sanitizeNextRoute(formData.get('next'), opts.defaultRedirect || '/');

  const parsed = normalizeAuthIdentifier(rawInput, { strictUsername: false });
  if (!parsed.ok || !password) {
    const errMsg = !parsed.ok ? parsed.error : 'Preencha o usuário e a senha.';
    redirect(`/login?error=${encodeURIComponent(errMsg)}&next=${encodeURIComponent(next)}`);
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.email,
    password,
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        formatSupabaseAuthError(error, 'Usuário ou senha incorretos.')
      )}&next=${encodeURIComponent(next)}`
    );
  }

  revalidatePath(opts.revalidateTarget || '/', 'layout');

  let targetRoute = next;
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
        const defaultRoute = profile?.features_config?.modules?.defaultRoute;
        if (
          typeof defaultRoute === 'string' &&
          defaultRoute.startsWith('/') &&
          !defaultRoute.startsWith('//')
        ) {
          targetRoute = defaultRoute;
        }
      }
    } catch {
      // Fallback seguro para defaultRoute
    }
  }

  redirect(targetRoute);
}

export async function performSignup(
  formData: FormData,
  opts: { defaultRedirect?: string; revalidateTarget?: string } = {}
): Promise<never> {
  const supabase = await createClient();
  const rawInput =
    ((formData.get('username') as string) || (formData.get('email') as string) || '').trim();
  const password = String(formData.get('password') || '');
  const confirmPassword = String(formData.get('confirmPassword') || '');
  const acceptTermsRaw = formData.get('acceptTerms');
  const acceptTerms = acceptTermsRaw === 'on' || acceptTermsRaw === 'true';
  const next = sanitizeNextRoute(formData.get('next'), opts.defaultRedirect || '/');

  const validated = validateSignupInputs({
    rawIdentifier: rawInput,
    password,
    confirmPassword,
    acceptTerms,
  });

  if (!validated.ok) {
    redirect(
      `/login?error=${encodeURIComponent(validated.error)}&next=${encodeURIComponent(next)}`
    );
  }

  const { email, username } = validated.identifier;

  // Fonte única de provisionamento em public.user_profiles / user_storage_profiles:
  // a trigger handle_auth_user_provisioning() em auth.users gera os perfis e terms_accepted_at = NOW().
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username,
        display_name: username,
        terms_version: LEGAL_DOCS_VERSION,
        privacy_version: LEGAL_DOCS_VERSION,
      },
    },
  });

  if (error) {
    redirect(
      `/login?error=${encodeURIComponent(
        formatSupabaseAuthError(error, 'Não foi possível criar a conta. Tente novamente.')
      )}&next=${encodeURIComponent(next)}`
    );
  }

  if (!data?.session) {
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr) {
      redirect(
        `/login?error=${encodeURIComponent(
          formatSupabaseAuthError(
            signInErr,
            'Conta criada. Confirme seu e-mail (se aplicável) ou entre novamente.'
          )
        )}&next=${encodeURIComponent(next)}`
      );
    }
  }

  revalidatePath(opts.revalidateTarget || '/', 'layout');
  redirect(next);
}

export async function performPasswordReset(rawEmail: string): Promise<{ ok: boolean; message: string }> {
  const parsed = normalizeAuthIdentifier(rawEmail, { strictUsername: false });
  if (!parsed.ok || parsed.kind !== 'email') {
    return {
      ok: false,
      message:
        'A recuperação por link está disponível apenas para contas criadas com um e-mail real.',
    };
  }

  try {
    const hdrs = await headers();
    const host = hdrs.get('x-forwarded-host') || hdrs.get('host') || 'aurtistic.vercel.app';
    const proto = hdrs.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
    const origin = `${proto}://${host}`;

    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(parsed.email, {
      redirectTo: `${origin}/auth/callback?next=/configuracoes-avancadas`,
    });
  } catch {
    // Resposta neutra para evitar enumeração ou vazamento de detalhes internos.
  }

  return {
    ok: true,
    message:
      'Se este e-mail estiver cadastrado, enviaremos um link de redefinição de senha em instantes.',
  };
}
