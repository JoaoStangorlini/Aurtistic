// Este programa é um software livre (Licença AGPLv3)
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { verifyHubSsoTicket } from '@/lib/hub-sso';
import { ensureEcosystemOrganizationsSeeded } from '@/app/(dashboard)/organizacoes/actions';

const ORG_SLUG_TO_ID: Record<string, string> = {
  labdiv: '1ab41410-0000-4000-8000-000000000001',
  'show-da-fisica': '1ab41410-0000-4000-8000-000000000002',
  hs: '1ab41410-0000-4000-8000-000000000003',
  profis: '1ab41410-0000-4000-8000-000000000004',
};

const ALLOWED_ORIGINS = new Set([
  'https://hub-lab-div.vercel.app',
  'https://aurtistic.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);

function normalizeOrgSlug(raw: string): string {
  const s = raw.trim().toLowerCase().replace(/_/g, '-');
  if (s === 'hackerspace' || s === 'hs') return 'hs';
  if (s === 'show-da-fisica' || s === 'showdefisica') return 'show-da-fisica';
  if (s === 'profis' || s === 'pro-fis' || s === 'pro_fis') return 'profis';
  return s;
}

function corsHeaders(origin: string | null): Record<string, string> {
  const isAllowed =
    origin &&
    (ALLOWED_ORIGINS.has(origin) ||
      origin.endsWith('.hublabdiv.com.br') ||
      /^http:\/\/[a-z0-9-]+\.localhost:3001$/i.test(origin));
  const allowOrigin = isAllowed ? origin! : 'https://hub-lab-div.vercel.app';
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-supabase-auth-token',
    'Access-Control-Allow-Credentials': 'true',
  };
}

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get('origin')),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  const headers = corsHeaders(origin);

  try {
    const body = await request.json().catch(() => ({}));
    const secret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET;
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'Segredo SSO não configurado.' }, { status: 500, headers });
    }

    // SUPORTE A SYNC DETERMINÍSTICO DE MEMBRO VIA ADMIN DO HUB
    if (body.action === 'sync_membership' || body.action === 'remove') {
      const authHeader = request.headers.get('authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '').trim();
      const hmacSig = request.headers.get('x-hub-signature') || '';

      const isAuthorized =
        token === secret ||
        body.secret === secret ||
        (hmacSig && crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex') === hmacSig);

      if (!isAuthorized) {
        return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401, headers });
      }

      const syncEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
      const syncSlug = typeof body.orgSlug === 'string' ? normalizeOrgSlug(body.orgSlug) : '';
      const syncOrgId = ORG_SLUG_TO_ID[syncSlug];

      if (!syncEmail || !syncOrgId) {
        return NextResponse.json({ ok: false, error: 'E-mail ou orgSlug inválido.' }, { status: 400, headers });
      }

      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      const adminDb = serviceRoleKey
        ? createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey)
        : null;

      if (!adminDb) {
        return NextResponse.json({ ok: false, error: 'Service role key indisponível.' }, { status: 500, headers });
      }

      if (body.action === 'remove' || body.enabled === false) {
        await adminDb
          .from('organization_members')
          .delete()
          .eq('organization_id', syncOrgId)
          .ilike('email', syncEmail);

        return NextResponse.json({ ok: true, removed: true, orgSlug: syncSlug }, { headers });
      } else {
        const { data: existing } = await adminDb
          .from('organization_members')
          .select('id')
          .eq('organization_id', syncOrgId)
          .ilike('email', syncEmail)
          .maybeSingle();

        if (!existing) {
          await adminDb.from('organization_members').insert({
            organization_id: syncOrgId,
            email: syncEmail,
            full_name: body.fullName || syncEmail.split('@')[0],
            org_role: 'member',
          });
        }
        return NextResponse.json({ ok: true, added: true, orgSlug: syncSlug }, { headers });
      }
    }

    const ticket = typeof body.ticket === 'string' ? body.ticket : '';
    const rawOrgSlug = typeof body.orgSlug === 'string' ? body.orgSlug : '';
    const orgSlug = rawOrgSlug ? normalizeOrgSlug(rawOrgSlug) : '';

    if (!ticket) {
      return NextResponse.json({ ok: false, error: 'Ticket ausente.' }, { status: 400, headers });
    }

    const verification = verifyHubSsoTicket(ticket, secret);
    if (!verification.valid || !verification.payload) {
      return NextResponse.json(
        { ok: false, error: verification.error || 'Ticket inválido.' },
        { status: 401, headers }
      );
    }

    const payload = verification.payload;
    const cookieStore = await cookies();
    const pendingCookies: { name: string; value: string; options: CookieOptions }[] = [];

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          pendingCookies.push({ name, value, options });
        },
        remove(name: string, options: CookieOptions) {
          pendingCookies.push({ name, value: '', options: { ...options, maxAge: 0 } });
        },
      },
    });

    const rawUser = payload.username || payload.fullName?.split(' ')[0] || 'membro';
    const cleanUser =
      rawUser
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_]/g, '')
        .toLowerCase() || 'membro_hub';

    const ticketEmail = payload.email?.includes('@')
      ? payload.email.toLowerCase().trim()
      : `${cleanUser}@aurtistic.local`;

    let authUser: { id: string; email?: string } | null = null;
    let authSession: { access_token?: string; refresh_token?: string } | null = null;

    // NÍVEL 1: Reaproveita sessão ativa válida no Aurtistic sem jamais sobrescrevê-la.
    // NÃO retorna antes de sincronizar organization_members abaixo.
    const { data: activeSessionData } = await supabase.auth.getUser();
    if (activeSessionData?.user) {
      const activeEmail = activeSessionData.user.email?.toLowerCase().trim();
      const activeHubUserId = String(activeSessionData.user.user_metadata?.hub_user_id || '').trim();
      if (
        (!payload.email && !payload.hubUserId) ||
        activeEmail === ticketEmail ||
        (payload.hubUserId && activeHubUserId === String(payload.hubUserId).trim())
      ) {
        authUser = activeSessionData.user;
        const { data: sessionWrap } = await supabase.auth.getSession();
        authSession = sessionWrap.session;
      }
    }

    const supabaseAdmin = serviceRoleKey
      ? createAdminClient(supabaseUrl, serviceRoleKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

    // NÍVEL 2 & 3: Só autentica se não houver sessão ativa reutilizável
    if (!authUser) {
      if (supabaseAdmin) {
        // Verifica se o e-mail já existe no banco do Aurtistic (sem sobrescrever com sso_*)
        let existingUserFound = false;
        const { data: existingList } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 1000,
        });
        const matchedUser = existingList?.users?.find(
          (u) => u.email?.toLowerCase().trim() === ticketEmail
        );
        if (matchedUser) {
          existingUserFound = true;
        }

        if (!existingUserFound) {
          // NÍVEL 3: Provisiona somente quando o e-mail realmente não existe
          const { data: createdData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
            email: ticketEmail,
            email_confirm: true,
            user_metadata: {
              full_name: payload.fullName,
              hub_user_id: payload.hubUserId,
              hub_username: payload.username,
            },
          });
          if (createErr && !createErr.message.toLowerCase().includes('already')) {
            return NextResponse.json({ ok: false, error: createErr.message }, { status: 401, headers });
          }
          if (createdData?.user) {
            authUser = createdData.user;
          }
        }

        // Autentica na própria conta existente (ou recém-criada) via MagicLink OTP server-side
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: ticketEmail,
        });
        if (linkErr || !linkData?.properties?.hashed_token) {
          return NextResponse.json(
            { ok: false, error: linkErr?.message || 'Falha ao gerar token OTP da conta.' },
            { status: 401, headers }
          );
        }

        const { data: otpData, error: otpErr } = await supabase.auth.verifyOtp({
          token_hash: linkData.properties.hashed_token,
          type: 'magiclink',
        });
        if (otpErr || !otpData.user) {
          return NextResponse.json(
            { ok: false, error: otpErr?.message || 'Falha ao validar sessão OTP.' },
            { status: 401, headers }
          );
        }
        authUser = otpData.user;
        authSession = otpData.session;
      } else {
        // Fallback local quando SUPABASE_SERVICE_ROLE_KEY não está no .env.local
        const ssoPassword =
          crypto.createHmac('sha256', secret).update(`aurtistic_sso_${payload.hubUserId}`).digest('hex') + 'A1!';
        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: ticketEmail,
          password: ssoPassword,
        });
        if (!signInErr && signInData.user) {
          authUser = signInData.user;
          authSession = signInData.session;
        } else {
          const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
            email: ticketEmail,
            password: ssoPassword,
            options: {
              data: {
                full_name: payload.fullName,
                hub_user_id: payload.hubUserId,
                hub_username: payload.username,
              },
            },
          });
          if (signUpErr || !signUpData.user) {
            return NextResponse.json(
              { ok: false, error: signUpErr?.message || signInErr?.message || 'Falha de autenticação SSO.' },
              { status: 401, headers }
            );
          }
          authUser = signUpData.user;
          authSession = signUpData.session;
        }
      }
    }

    // SINCRONIZAÇÃO OBRIGATÓRIA EM organization_members (executa inclusive no Nível 1!)
    const userId = authUser?.id;
    const dbClient = supabaseAdmin || supabase;
    const ticketOrgs = Array.isArray(payload.organizations)
      ? payload.organizations.map(normalizeOrgSlug)
      : [];
    const isHubAdmin = payload.role === 'admin' || payload.role === 'moderator';

    if (userId) {
      // Auto-seed defensivo de todas as 4 organizações e subtimes no banco remoto
      await ensureEcosystemOrganizationsSeeded(dbClient, {
        id: userId,
        email: ticketEmail,
        role: payload.role,
        fullName: payload.fullName,
      });

      const orgsToGrant = isHubAdmin
        ? Object.keys(ORG_SLUG_TO_ID)
        : ticketOrgs.filter((slug) => Boolean(ORG_SLUG_TO_ID[slug]));

      // Adiciona/garante o usuário nas organizações concedidas no ticket (upsert seguro)
      for (const grantedSlug of orgsToGrant) {
        const grantedOrgId = ORG_SLUG_TO_ID[grantedSlug];
        if (!grantedOrgId) continue;

        const { data: existingMember } = await dbClient
          .from('organization_members')
          .select('id, org_role')
          .eq('organization_id', grantedOrgId)
          .eq('user_id', userId)
          .maybeSingle();

        if (!existingMember) {
          const { error: insErr } = await dbClient.from('organization_members').insert({
            organization_id: grantedOrgId,
            user_id: userId,
            full_name: payload.fullName || cleanUser,
            email: ticketEmail,
            org_role: isHubAdmin ? 'admin' : 'member',
          });

          if (insErr) {
            try {
              await dbClient.rpc('ensure_sso_member', {
                p_org_id: grantedOrgId,
                p_role: isHubAdmin ? 'admin' : 'member',
              });
            } catch {
              // RPC opcional de contingência
            }
          }
        }
      }
      // NOTA DE BLINDAGEM: Remoção destrutiva no login eliminada para proteger membros
      // recém-ingressados via código de convite e criadores. A remoção é feita deterministicamente
      // via ação administrativa na Matriz de Credenciamento.
    }

    const targetOrgId = ORG_SLUG_TO_ID[orgSlug];
    let isMember = false;
    let memberRole: string | null = null;

    if (userId && targetOrgId) {
      const { data: memberData } = await dbClient
        .from('organization_members')
        .select('org_role')
        .eq('organization_id', targetOrgId)
        .eq('user_id', userId)
        .maybeSingle();

      if (memberData) {
        isMember = true;
        memberRole = memberData.org_role;
      } else if (isHubAdmin || ticketOrgs.includes(orgSlug)) {
        isMember = true;
        memberRole = isHubAdmin ? 'admin' : 'member';
      }
    }

    const res = NextResponse.json(
      {
        ok: true,
        userId,
        isMember,
        memberRole,
        access_token: authSession?.access_token || null,
        refresh_token: authSession?.refresh_token || null,
      },
      { status: 200, headers }
    );

    const isHttps = request.url.startsWith('https://');
    for (const c of pendingCookies) {
      const cookieParts = [
        `${c.name}=${encodeURIComponent(c.value)}`,
        `Path=${c.options.path || '/'}`,
        c.options.maxAge !== undefined ? `Max-Age=${c.options.maxAge}` : '',
        c.options.httpOnly ? 'HttpOnly' : '',
        isHttps ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax',
      ].filter(Boolean);
      res.headers.append('Set-Cookie', cookieParts.join('; '));
    }

    return res;
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Erro interno hub-embed.' },
      { status: 500, headers }
    );
  }
}
