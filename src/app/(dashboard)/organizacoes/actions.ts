// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/(dashboard)/organizacoes/actions.ts
'use server';

import crypto from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import type {
  CognitiveCapacity,
  OrgRole,
  ReviewDecision,
} from '@/types/organizations';
import { isUuid } from '@/lib/validators';

const LABDIV_ORG_ID = '1ab41410-0000-4000-8000-000000000001';
const SHOW_DA_FISICA_ORG_ID = '1ab41410-0000-4000-8000-000000000002';
const HS_ORG_ID = '1ab41410-0000-4000-8000-000000000003';

const LABDIV_DEFAULT_ORG: any = {
  id: LABDIV_ORG_ID,
  slug: 'labdiv',
  name: 'LabDiv',
  description: 'Laboratório de Comunicação e Divulgação Científica do IFUSP',
  avatar_url: '/labdiv-logo.png',
  primary_color: '#049FFF',
  secondary_color: '#FFCC00',
  storage_quota_bytes: 53687091200,
  storage_used_bytes: 0,
  storage_policy: 'admin_or_permitted',
  brand_config: {
    themeId: 'labdiv',
    bgApp: '#0b0f19',
    bgSurface: '#111827',
    textPrimary: '#f8fafc',
    accents: ['#049fff', '#ffcc00', '#ef4444', '#9d4edd'],
    fontDisplay: 'Space Grotesk',
    fontBody: 'Inter',
    uppercaseTitles: false,
    glowIntensity: 0.4,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  myRole: 'admin',
  myMemberId: LABDIV_ORG_ID,
  canUploadOrgVault: true,
  myCapacity: 'normal',
};

const SHOW_DA_FISICA_DEFAULT_ORG: any = {
  id: SHOW_DA_FISICA_ORG_ID,
  slug: 'show-da-fisica',
  name: 'Show de Física',
  description: 'Demonstrações teatrais e lúdicas de fenômenos físicos — IFUSP',
  avatar_url: null,
  primary_color: '#0066ff',
  secondary_color: '#ff1e1e',
  storage_quota_bytes: 53687091200,
  storage_used_bytes: 0,
  storage_policy: 'admin_or_permitted',
  brand_config: {
    themeId: 'show-da-fisica',
    bgApp: '#07090e',
    bgSurface: '#0d111a',
    textPrimary: '#e2e8f0',
    accents: ['#ff1e1e', '#0066ff', '#00ff44', '#ffcc00'],
    fontDisplay: 'Orbitron',
    fontBody: 'Inter',
    uppercaseTitles: true,
    glowIntensity: 1.0,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  myRole: 'admin',
  myMemberId: SHOW_DA_FISICA_ORG_ID,
  canUploadOrgVault: true,
  myCapacity: 'normal',
};

const HS_DEFAULT_ORG: any = {
  id: HS_ORG_ID,
  slug: 'hs',
  name: 'Hackerspace IFUSP',
  description: 'Laboratório comunitário de cultura maker, eletrônica e hardware livre',
  avatar_url: null,
  primary_color: '#00ff66',
  secondary_color: '#ffcc00',
  storage_quota_bytes: 53687091200,
  storage_used_bytes: 0,
  storage_policy: 'admin_or_permitted',
  brand_config: {
    themeId: 'hs',
    bgApp: '#080808',
    bgSurface: '#101412',
    textPrimary: '#e2f1e8',
    accents: ['#00ff66', '#ffcc00', '#06b6d4'],
    fontDisplay: 'JetBrains Mono',
    fontBody: 'Open Sans',
    uppercaseTitles: true,
    glowIntensity: 0.75,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  myRole: 'admin',
  myMemberId: HS_ORG_ID,
  canUploadOrgVault: true,
  myCapacity: 'normal',
};

const PROFIS_ORG_ID = '1ab41410-0000-4000-8000-000000000004';

const PROFIS_DEFAULT_ORG: any = {
  id: PROFIS_ORG_ID,
  slug: 'profis',
  name: 'Pró-Física (ProFis)',
  description: 'Incentivo à formação acadêmica, nivelamento e pesquisa científica no IFUSP',
  avatar_url: null,
  primary_color: '#F59E0B',
  secondary_color: '#FFCC00',
  storage_quota_bytes: 53687091200,
  storage_used_bytes: 0,
  storage_policy: 'admin_or_permitted',
  brand_config: {
    themeId: 'profis',
    bgApp: '#080c16',
    bgSurface: '#0f172a',
    textPrimary: '#f8fafc',
    accents: ['#F59E0B', '#FFCC00', '#F97316', '#38BDF8'],
    fontDisplay: 'Space Grotesk',
    fontBody: 'Inter',
    uppercaseTitles: false,
    glowIntensity: 0.9,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  myRole: 'admin',
  myMemberId: PROFIS_ORG_ID,
  canUploadOrgVault: true,
  myCapacity: 'normal',
};

const DEFAULT_ECOSYSTEM_ORGS = [
  LABDIV_DEFAULT_ORG,
  SHOW_DA_FISICA_DEFAULT_ORG,
  HS_DEFAULT_ORG,
  PROFIS_DEFAULT_ORG,
];

export async function ensureEcosystemOrganizationsSeeded(
  customClient?: any,
  targetUser?: { id: string; email?: string | null; role?: string; fullName?: string | null }
) {
  try {
    let client = customClient;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceRoleKey && (!client || !client.auth?.admin)) {
      const { createClient: createSupabaseClient } = await import('@supabase/supabase-js');
      client = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://beocjbcdoddjdwtpbrhu.supabase.co',
        serviceRoleKey,
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
    }
    if (!client) {
      client = await createClient();
    }

    // 1. Seed das 4 organizações do ecossistema
    const orgsToSeed = DEFAULT_ECOSYSTEM_ORGS.map((org) => ({
      id: org.id,
      slug: org.slug,
      name: org.name,
      description: org.description,
      primary_color: org.primary_color,
      secondary_color: org.secondary_color,
      storage_quota_bytes: org.storage_quota_bytes || 53687091200,
      storage_used_bytes: org.storage_used_bytes || 0,
      storage_policy: org.storage_policy || 'admin_or_permitted',
      brand_config: org.brand_config || {},
      created_at: org.created_at || '2026-01-01T00:00:00Z',
      updated_at: new Date().toISOString(),
    }));

    await client.from('organizations').upsert(orgsToSeed, { onConflict: 'id' });

    // 2. Subtimes padrão para as organizações
    const defaultSubteams = [
      { id: '1ab41410-sub1-4000-8000-000000000001', organization_id: LABDIV_ORG_ID, name: 'Geral', color: '#049FFF', is_active: true },
      { id: '1ab41410-sub2-4000-8000-000000000001', organization_id: LABDIV_ORG_ID, name: 'Audiovisual & Mídia', color: '#FFCC00', is_active: true },
      { id: '1ab41410-sub1-4000-8000-000000000002', organization_id: SHOW_DA_FISICA_ORG_ID, name: 'Geral', color: '#FF1E56', is_active: true },
      { id: '1ab41410-sub2-4000-8000-000000000002', organization_id: SHOW_DA_FISICA_ORG_ID, name: 'Apresentadores & Palco', color: '#002FFE', is_active: true },
      { id: '1ab41410-sub1-4000-8000-000000000003', organization_id: HS_ORG_ID, name: 'Geral', color: '#00FF66', is_active: true },
      { id: '1ab41410-sub2-4000-8000-000000000003', organization_id: HS_ORG_ID, name: 'Eletrônica & IoT', color: '#FFCC00', is_active: true },
      { id: '1ab41410-sub1-4000-8000-000000000004', organization_id: PROFIS_ORG_ID, name: 'Geral', color: '#F59E0B', is_active: true },
      { id: '1ab41410-sub2-4000-8000-000000000004', organization_id: PROFIS_ORG_ID, name: 'Nivelamento & Tutoria', color: '#FFCC00', is_active: true },
    ];
    await client.from('organization_subteams').upsert(defaultSubteams, { onConflict: 'id' });

    // 3. Vínculo do usuário alvo nas 4 organizações
    if (targetUser?.id) {
      const isUserAdmin = targetUser.role === 'admin' || targetUser.role === 'moderator';
      const membersToSeed = DEFAULT_ECOSYSTEM_ORGS.map((org) => ({
        id: `mem-${org.slug}-${targetUser.id.replace(/-/g, '').slice(0, 12)}`,
        organization_id: org.id,
        user_id: targetUser.id,
        full_name: targetUser.fullName || targetUser.email?.split('@')[0] || 'Membro Credenciado',
        email: targetUser.email || '',
        org_role: isUserAdmin ? 'admin' : 'member',
        can_upload_org_vault: true,
        is_placeholder: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      await client.from('organization_members').upsert(membersToSeed, { onConflict: 'organization_id,user_id' });
    }
    return { ok: true };
  } catch (err) {
    console.warn('ensureEcosystemOrganizationsSeeded caught non-fatal error:', err);
    return { ok: false, error: String(err) };
  }
}

export async function getUserOrganizationsAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const normalizedEmail = (user.email || '').toLowerCase().trim();
  const normalizedUsername = (user.user_metadata?.username || '').toLowerCase().trim();
  const isGlobalAdmin =
    user.app_metadata?.role === 'admin' ||
    user.user_metadata?.role === 'admin' ||
    user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ||
    user.id === '48b2fb73-c5d3-4eff-b727-54e4b91bf21b' ||
    user.id === '8a3e4272-010d-4479-94cb-26178d544ea2' ||
    user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386' ||
    user.id === 'fb12ee7b-da8f-4b80-ac5c-3b8d478047d2' ||
    normalizedEmail === 'joaopaulostangorlini@usp.br' ||
    normalizedEmail === 'joaostangorlini@usp.br' ||
    normalizedEmail === 'joao@aurtistic.com' ||
    normalizedEmail === 'hublabdiv@gmail.com' ||
    normalizedUsername === 'joaostangorlini' ||
    normalizedUsername === 'joao' ||
    normalizedUsername === 'hublabdiv' ||
    normalizedUsername === 'hublabdiv_institucional';

  let orgs: any[] = [];

  try {
    const { data: memberRows, error } = await supabase
      .from('organization_members')
      .select(`
        id,
        org_role,
        subteam_id,
        can_upload_org_vault,
        cognitive_capacity,
        capacity_note,
        capacity_until,
        organization:organizations(*)
      `)
      .eq('user_id', user.id);

    if (!error && Array.isArray(memberRows) && memberRows.length > 0) {
      orgs = memberRows
        .map((m) => {
          const org: any = m.organization;
          if (!org) {
            // Se o join não veio por causa de foreign key ou seed, tenta achar em DEFAULT_ECOSYSTEM_ORGS
            const fallbackDef = DEFAULT_ECOSYSTEM_ORGS.find((d) => d.id === m.id);
            if (!fallbackDef) return null;
            return {
              ...fallbackDef,
              myRole: m.org_role,
              myMemberId: m.id,
              mySubteamId: m.subteam_id,
              canUploadOrgVault: m.can_upload_org_vault,
              myCapacity: m.cognitive_capacity,
            };
          }
          return {
            ...org,
            myRole: m.org_role,
            myMemberId: m.id,
            mySubteamId: m.subteam_id,
            canUploadOrgVault: m.can_upload_org_vault,
            myCapacity: m.cognitive_capacity,
          };
        })
        .filter(Boolean);
    }
  } catch {
    // Tabela pode ainda não estar no schema cache
  }

  // Se o usuário for administrador global do ecossistema, garante acesso a todas as 4 organizações e auto-seed no banco
  if (isGlobalAdmin) {
    void ensureEcosystemOrganizationsSeeded(supabase, {
      id: user.id,
      email: user.email,
      role: 'admin',
      fullName: user.user_metadata?.full_name,
    });

    for (const defOrg of DEFAULT_ECOSYSTEM_ORGS) {
      if (!orgs.some((o) => o.id === defOrg.id || o.slug === defOrg.slug)) {
        orgs.push({
          ...defOrg,
          myRole: 'admin',
          myMemberId: user.id,
          canUploadOrgVault: true,
          myCapacity: 'normal',
        });
      }
    }
  }

  // Sondagem rápida das organizações do ecossistema HUB
  // Se o usuário tiver poucas organizações cadastradas ou se for uma consulta de inicialização,
  // sonda a API do HUB para sincronizar automaticamente eventuais novas organizações em que o usuário entrou.
  try {
    const hubBaseUrl = (process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || 'http://localhost:3001').replace(/\/+$/, '');
    const expectedSecret =
      process.env.HUB_SSO_SECRET ||
      process.env.ADMIN_SECRET_KEY ||
      process.env.EDGE_HMAC_SECRET ||
      'hub-default-sso-secret';

    const hubUserId = user.user_metadata?.hub_user_id || '';
    const searchUrl = `${hubBaseUrl}/api/iniciativas/org-member-sync?email=${encodeURIComponent(user.email || '')}${hubUserId ? `&hubUserId=${encodeURIComponent(hubUserId)}` : ''}`;
    const hubRes = await fetch(searchUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${expectedSecret}` },
      signal: AbortSignal.timeout(2000), // Timeout defensivo curto para não atrasar a renderização
    }).catch(() => null);

    if (hubRes && hubRes.ok) {
      const hubData = await hubRes.json().catch(() => null);
      if (hubData && Array.isArray(hubData.organizations)) {
        for (const orgSlug of hubData.organizations) {
          const defOrg = DEFAULT_ECOSYSTEM_ORGS.find((d) => d.slug === orgSlug);
          if (defOrg && !orgs.some((o) => o.id === defOrg.id || o.slug === defOrg.slug)) {
            orgs.push({
              ...defOrg,
              myRole: hubData.role === 'admin' || isGlobalAdmin ? 'admin' : 'member',
              myMemberId: user.id,
              canUploadOrgVault: true,
              myCapacity: 'normal',
            });

            // Upsert silencioso em segundo plano no Supabase do Aurtistic
            void (async () => {
              try {
                await supabase.from('organizations').upsert(
                  {
                    id: defOrg.id,
                    slug: defOrg.slug,
                    name: defOrg.name,
                    description: defOrg.description,
                    primary_color: defOrg.primary_color,
                    secondary_color: defOrg.secondary_color,
                    storage_quota_bytes: defOrg.storage_quota_bytes,
                    storage_used_bytes: 0,
                    storage_policy: defOrg.storage_policy,
                    brand_config: defOrg.brand_config,
                  },
                  { onConflict: 'id' }
                );
                await supabase.from('organization_members').upsert(
                  {
                    organization_id: defOrg.id,
                    user_id: user.id,
                    org_role: hubData.role === 'admin' || isGlobalAdmin ? 'admin' : 'member',
                    can_upload_org_vault: true,
                    cognitive_capacity: 'normal',
                  },
                  { onConflict: 'organization_id,user_id' }
                );
              } catch {}
            })();
          }
        }
      }
    }
  } catch {
    // Sondagem falhou de forma silenciosa e resiliente
  }

  // Se o usuário for Administrador Global, garante acesso a todas as organizações do ecossistema
  if (isGlobalAdmin) {
    for (const defOrg of DEFAULT_ECOSYSTEM_ORGS) {
      if (!orgs.some((o) => o.id === defOrg.id || o.slug === defOrg.slug)) {
        orgs.push({
          ...defOrg,
          myRole: 'admin',
          myMemberId: user.id,
        });
      }
    }
  }

  return { ok: true, organizations: orgs };
}

/**
 * Server Action explícita para forçar a sondagem e sincronização das organizações do HUB no Aurtistic
 */
export async function syncHubOrganizationsAction(): Promise<{
  ok: boolean;
  syncedCount: number;
  organizations?: any[];
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.', syncedCount: 0 };

  const normalizedEmail = (user.email || '').toLowerCase().trim();
  const normalizedUsername = (user.user_metadata?.username || '').toLowerCase().trim();
  const isGlobalAdmin =
    user.app_metadata?.role === 'admin' ||
    user.user_metadata?.role === 'admin' ||
    user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ||
    user.id === '48b2fb73-c5d3-4eff-b727-54e4b91bf21b' ||
    user.id === '8a3e4272-010d-4479-94cb-26178d544ea2' ||
    user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386' ||
    user.id === 'fb12ee7b-da8f-4b80-ac5c-3b8d478047d2' ||
    normalizedEmail === 'joaopaulostangorlini@usp.br' ||
    normalizedEmail === 'joaostangorlini@usp.br' ||
    normalizedEmail === 'joao@aurtistic.com' ||
    normalizedEmail === 'hublabdiv@gmail.com' ||
    normalizedUsername === 'joaostangorlini' ||
    normalizedUsername === 'joao' ||
    normalizedUsername === 'hublabdiv' ||
    normalizedUsername === 'hublabdiv_institucional';

  const hubBaseUrl = (process.env.NEXT_PUBLIC_HUB_URL || process.env.HUB_URL || 'http://localhost:3001').replace(/\/+$/, '');
  const expectedSecret =
    process.env.HUB_SSO_SECRET ||
    process.env.ADMIN_SECRET_KEY ||
    process.env.EDGE_HMAC_SECRET ||
    'hub-default-sso-secret';

  let hubOrgs: string[] = [];
  let isHubStaff = isGlobalAdmin;

  try {
    const hubUserId = user.user_metadata?.hub_user_id || '';
    const searchUrl = `${hubBaseUrl}/api/iniciativas/org-member-sync?email=${encodeURIComponent(user.email || '')}${hubUserId ? `&hubUserId=${encodeURIComponent(hubUserId)}` : ''}`;
    const hubRes = await fetch(searchUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${expectedSecret}` },
      signal: AbortSignal.timeout(4000),
    });

    if (hubRes.ok) {
      const hubData = await hubRes.json();
      if (Array.isArray(hubData.organizations)) {
        hubOrgs = hubData.organizations;
      }
      if (hubData.role === 'admin' || hubData.role === 'moderator') {
        isHubStaff = true;
      }
    }
  } catch {
    // Falha silenciosa
  }

  if (isHubStaff || isGlobalAdmin) {
    hubOrgs = ['labdiv', 'show-da-fisica', 'hs', 'profis'];
  }

  let synced = 0;
  for (const orgSlug of hubOrgs) {
    const defaultOrg = DEFAULT_ECOSYSTEM_ORGS.find((d) => d.slug === orgSlug);
    if (!defaultOrg) continue;

    try {
      await supabase.from('organizations').upsert(
        {
          id: defaultOrg.id,
          slug: defaultOrg.slug,
          name: defaultOrg.name,
          description: defaultOrg.description,
          primary_color: defaultOrg.primary_color,
          secondary_color: defaultOrg.secondary_color,
          storage_quota_bytes: defaultOrg.storage_quota_bytes,
          storage_used_bytes: 0,
          storage_policy: defaultOrg.storage_policy,
          brand_config: defaultOrg.brand_config,
        },
        { onConflict: 'id' }
      );

      await supabase.from('organization_members').upsert(
        {
          organization_id: defaultOrg.id,
          user_id: user.id,
          org_role: isHubStaff ? 'admin' : 'member',
          can_upload_org_vault: true,
          cognitive_capacity: 'normal',
        },
        { onConflict: 'organization_id,user_id' }
      );
      synced++;
    } catch {
      // Ignora erro individual
    }
  }

  revalidatePath('/labdiv');
  revalidatePath('/servidor');
  revalidatePath('/organizacoes');

  const refreshed = await getUserOrganizationsAction();
  return {
    ok: true,
    syncedCount: synced,
    organizations: refreshed.ok ? refreshed.organizations : [],
  };
}

export async function getOrganizationDetailsAction(orgId: string) {
  if (!isUuid(orgId)) return { ok: false, error: 'ID de organização inválido.' };
  const supabase = await createClient();

  const fetchOrgTasks = async (targetOrgId: string) => {
    const isLabDiv = targetOrgId === LABDIV_ORG_ID;
    const dimFilter =
      targetOrgId === SHOW_DA_FISICA_ORG_ID
        ? 'Show de Física'
        : targetOrgId === HS_ORG_ID
          ? 'Hackerspace'
          : targetOrgId === PROFIS_ORG_ID
            ? 'Pró-Física'
            : 'LabDiv';

    const orFilter = isLabDiv
      ? `organization_id.eq.${targetOrgId},dimensao.eq.LabDiv,dimensao.eq.HUB`
      : `organization_id.eq.${targetOrgId},dimensao.eq.${dimFilter}`;

    const { data: rawTasks, error: tErr } = await supabase
      .from('tasks')
      .select('*')
      .or(orFilter)
      .or('is_personal.is.null,is_personal.eq.false')
      .order('created_at', { ascending: false });

    if (tErr) {
      if (tErr.message?.includes('organization_id') || (tErr as any).code === '42703') {
        const fallbackOr = isLabDiv
          ? 'dimensao.eq.HUB,dimensao.eq.LabDiv'
          : `dimensao.eq.${dimFilter}`;
        const { data: fallbackTasks } = await supabase
          .from('tasks')
          .select('*')
          .or(fallbackOr)
          .order('created_at', { ascending: false });
        return fallbackTasks || [];
      }
      return [];
    }
    return rawTasks || [];
  };

  try {
    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('*')
      .eq('id', orgId)
      .maybeSingle();

    if (!orgErr && org) {
      const [{ data: subteams }, { data: members }, tasks] = await Promise.all([
        supabase
          .from('organization_subteams')
          .select('*')
          .eq('organization_id', orgId)
          .order('name'),
        supabase
          .from('organization_members')
          .select('*, subteam:organization_subteams(*)')
          .eq('organization_id', orgId)
          .order('full_name'),
        fetchOrgTasks(orgId),
      ]);

      return {
        ok: true,
        organization: org,
        subteams: subteams || [],
        members: members || [],
        tasks,
      };
    }
  } catch {
    // Tabela pode ainda não existir
  }

  const fallbackTasks = await fetchOrgTasks(orgId);

  // Fallback institucional para LabDiv
  if (orgId === LABDIV_ORG_ID) {
    return {
      ok: true,
      organization: LABDIV_DEFAULT_ORG,
      subteams: [
        { id: '1ab41410-0000-4000-8000-000000000100', organization_id: LABDIV_ORG_ID, name: 'Programação', description: 'Desenvolvimento de software, infraestrutura e automação', color: '#3B82F6' },
        { id: '1ab41410-0000-4000-8000-000000000101', organization_id: LABDIV_ORG_ID, name: 'Comunicação', description: 'Design, redes, eventos e divulgação científica', color: '#06B6D4' },
        { id: '1ab41410-0000-4000-8000-000000000102', organization_id: LABDIV_ORG_ID, name: 'Pesquisa', description: 'Projetos acadêmicos, artigos e neurociência', color: '#10B981' },
        { id: '1ab41410-0000-4000-8000-000000000103', organization_id: LABDIV_ORG_ID, name: 'Administração', description: 'Gestão institucional, finanças e processos internos', color: '#F59E0B' }
      ],
      members: [
        { id: '1ab41410-0000-4000-8000-000000000201', organization_id: LABDIV_ORG_ID, full_name: 'João Paulo Stangorlini', email: 'joaopaulostangorlini@usp.br', org_role: 'admin', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' },
        { id: '1ab41410-0000-4000-8000-000000000202', organization_id: LABDIV_ORG_ID, full_name: 'Andy dos Santos Ramos', email: 'andy@labdiv.usp.br', org_role: 'admin', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' },
        { id: '1ab41410-0000-4000-8000-000000000203', organization_id: LABDIV_ORG_ID, full_name: 'Dani Serafim', email: 'dani@labdiv.usp.br', org_role: 'member', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' },
        { id: '1ab41410-0000-4000-8000-000000000204', organization_id: LABDIV_ORG_ID, full_name: 'HUB LabDiv Institucional', email: 'hublabdiv@gmail.com', org_role: 'admin', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' }
      ],
      tasks: fallbackTasks,
    };
  }

  // Fallback institucional para Show de Física
  if (orgId === SHOW_DA_FISICA_ORG_ID) {
    return {
      ok: true,
      organization: SHOW_DA_FISICA_DEFAULT_ORG,
      subteams: [
        { id: '1ab41410-0000-4000-8000-000000000301', organization_id: SHOW_DA_FISICA_ORG_ID, name: 'Apresentações & Palco', description: 'Monitores de palco e roteiros de sessões', color: '#ff1e1e' },
        { id: '1ab41410-0000-4000-8000-000000000302', organization_id: SHOW_DA_FISICA_ORG_ID, name: 'Manutenção & Bancada', description: 'Oficina, reparo e montagem de experimentos', color: '#0066ff' },
        { id: '1ab41410-0000-4000-8000-000000000303', organization_id: SHOW_DA_FISICA_ORG_ID, name: 'Comunicação & Redes', description: 'Divulgação, fotografia e posts científicos', color: '#00ff44' }
      ],
      members: [
        { id: '1ab41410-0000-4000-8000-000000000311', organization_id: SHOW_DA_FISICA_ORG_ID, full_name: 'João Paulo Stangorlini', email: 'joaopaulostangorlini@usp.br', org_role: 'admin', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' },
        { id: '1ab41410-0000-4000-8000-000000000312', organization_id: SHOW_DA_FISICA_ORG_ID, full_name: 'Equipe Show de Física', email: 'showdafisica@if.usp.br', org_role: 'member', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' }
      ],
      tasks: fallbackTasks,
    };
  }

  // Fallback institucional para Hackerspace IFUSP
  if (orgId === HS_ORG_ID) {
    return {
      ok: true,
      organization: HS_DEFAULT_ORG,
      subteams: [
        { id: '1ab41410-0000-4000-8000-000000000401', organization_id: HS_ORG_ID, name: 'Hardware & Eletrônica', description: 'Bancadas de solda, sensores e IoT', color: '#00ff66' },
        { id: '1ab41410-0000-4000-8000-000000000402', organization_id: HS_ORG_ID, name: 'Fabricação Digital & 3D', description: 'Impressoras 3D, CNC e corte a laser', color: '#ffcc00' },
        { id: '1ab41410-0000-4000-8000-000000000403', organization_id: HS_ORG_ID, name: 'Comunidade & Oficinas', description: 'Cursos, eventos e comunicação do HS', color: '#06b6d4' }
      ],
      members: [
        { id: '1ab41410-0000-4000-8000-000000000411', organization_id: HS_ORG_ID, full_name: 'João Paulo Stangorlini', email: 'joaopaulostangorlini@usp.br', org_role: 'admin', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' },
        { id: '1ab41410-0000-4000-8000-000000000412', organization_id: HS_ORG_ID, full_name: 'Equipe Hackerspace', email: 'hackerspace@if.usp.br', org_role: 'member', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' }
      ],
      tasks: fallbackTasks,
    };
  }

  // Fallback institucional para Pró-Física (ProFis)
  if (orgId === PROFIS_ORG_ID) {
    return {
      ok: true,
      organization: PROFIS_DEFAULT_ORG,
      subteams: [
        { id: '1ab41410-0000-4000-8000-000000000501', organization_id: PROFIS_ORG_ID, name: 'Apoio Pedagógico & Nivelamento', description: 'Monitorias e nivelamento em cálculo e física básica', color: '#f59e0b' },
        { id: '1ab41410-0000-4000-8000-000000000502', organization_id: PROFIS_ORG_ID, name: 'Pesquisa & Iniciação Científica', description: 'Projetos avançados de pesquisa e bolsas de estudo', color: '#ffcc00' },
        { id: '1ab41410-0000-4000-8000-000000000503', organization_id: PROFIS_ORG_ID, name: 'Comunicação & Divulgação', description: 'Materiais didáticos, mídias e seminários do ProFis', color: '#f97316' }
      ],
      members: [
        { id: '1ab41410-0000-4000-8000-000000000511', organization_id: PROFIS_ORG_ID, full_name: 'João Paulo Stangorlini', email: 'joaopaulostangorlini@usp.br', org_role: 'admin', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' },
        { id: '1ab41410-0000-4000-8000-000000000512', organization_id: PROFIS_ORG_ID, full_name: 'Equipe Pró-Física (ProFis)', email: 'profis@if.usp.br', org_role: 'member', is_placeholder: false, can_upload_org_vault: true, cognitive_capacity: 'normal' }
      ],
      tasks: fallbackTasks,
    };
  }

  return { ok: false, error: 'Organização não encontrada.' };
}

export async function updateMemberCapacityAction(input: {
  organizationId: string;
  capacity: CognitiveCapacity;
  note?: string;
  until?: string;
}) {
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  const { data, error } = await supabase.rpc('update_my_member_capacity', {
    p_org_id: input.organizationId,
    p_capacity: input.capacity,
    p_note: input.note || null,
    p_until: input.until || null,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/');
  return { ok: true, member: data };
}

export async function createOrganizationInviteAction(input: {
  organizationId: string;
  targetEmail?: string;
  targetName?: string;
  assignedRole?: OrgRole;
  assignedSubteamId?: string;
  placeholderMemberId?: string;
}) {
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data, error } = await supabase
    .from('organization_invites')
    .insert({
      organization_id: input.organizationId,
      created_by: user.id,
      target_email: input.targetEmail || null,
      target_name: input.targetName || null,
      assigned_role: input.assignedRole || 'member',
      assigned_subteam_id: input.assignedSubteamId || null,
      placeholder_member_id: input.placeholderMemberId || null,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, invite: data, inviteUrl: `/convite/${data.token}` };
}

export async function getOrganizationTaskTemplatesAction(orgId: string) {
  if (!isUuid(orgId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_task_templates')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });

  if (error) return { ok: false, error: error.message };
  return { ok: true, templates: data || [] };
}

export async function createOrganizationTaskTemplateAction(input: {
  organizationId: string;
  title: string;
  description?: string;
  subteamId?: string;
  checklistItems: Array<{ text: string }>;
}) {
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_task_templates')
    .insert({
      organization_id: input.organizationId,
      title: input.title.trim(),
      description: input.description || null,
      subteam_id: input.subteamId || null,
      checklist_items: input.checklistItems || [],
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, template: data };
}

/**
 * Converte um item da pauta de reunião em Tarefa formal da organização em 1 clique
 * Gravando converted_task_id no JSONB para impedir duplicações.
 */
export async function convertMeetingAgendaItemToTaskAction(input: {
  meetingId: string;
  agendaItemId?: string;
  title?: string;
  itemTitle?: string;
  organizationId?: string;
  subteamId?: string | null;
  assigneeName?: string;
  assigneeUserId?: string;
  prazo?: string;
}) {
  if (!isUuid(input.meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const taskTitle = (input.title || input.itemTitle || '').trim();
  if (!taskTitle) return { ok: false, error: 'Título da pauta inválido.' };

  // Busca a reunião para obter organization_id e atualizar o item da pauta
  const { data: meeting } = await supabase
    .from('organization_meetings')
    .select('*, organization:organizations(name)')
    .eq('id', input.meetingId)
    .single();

  if (!meeting) return { ok: false, error: 'Reunião não encontrada.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgName = (meeting as any).organization?.name || (meeting.organization_id ? 'LabDiv' : 'Pessoal');
  const ataNote = `Origem: Reunião "${meeting.title}" (${meeting.scheduled_at ? new Date(meeting.scheduled_at).toLocaleDateString('pt-BR') : 'Data não definida'}).\n[Ata da Reunião](#meeting-${meeting.id})`;
  const orgId = input.organizationId || meeting.organization_id || LABDIV_ORG_ID;

  const taskId = crypto.randomUUID();
  const taskToSave: Record<string, unknown> = {
    id: taskId,
    user_id: user.id,
    organization_id: orgId,
    subteam_id: input.subteamId || meeting.subteam_id || null,
    assigned_member_ids: input.assigneeUserId ? [input.assigneeUserId] : [],
    responsavel: input.assigneeName || null,
    nome: taskTitle,
    descricao: ataNote,
    status: 'não iniciada',
    prioridade: 'Média',
    dimensao: orgName,
    prazo: input.prazo || null,
    is_personal: !orgId,
    created_at: new Date().toISOString(),
  };

  const { data: insertedTask, error: taskErr } = await supabase
    .from('tasks')
    .insert(taskToSave)
    .select('*')
    .single();

  if (taskErr) {
    return { ok: false, error: 'Falha ao criar tarefa: ' + taskErr.message };
  }

  // Atualiza agenda_items na reunião com converted_task_id
  if (meeting && Array.isArray(meeting.agenda_items)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updatedAgenda = meeting.agenda_items.map((item: any) => {
      if (
        (input.agendaItemId && item.id === input.agendaItemId) ||
        (!input.agendaItemId && item.title === taskTitle)
      ) {
        return { ...item, converted_task_id: taskId };
      }
      return item;
    });

    await supabase
      .from('organization_meetings')
      .update({ agenda_items: updatedAgenda })
      .eq('id', input.meetingId);
  }

  revalidatePath('/labdiv');
  revalidatePath('/servidor');
  revalidatePath('/');
  return { ok: true, taskId, task: insertedTask || taskToSave };
}

export async function applyPlaybookToTasksAction(input: {
  organizationId: string;
  templateId: string;
  subteamId?: string;
  assignedMemberIds?: string[];
  prazo?: string;
}) {
  if (!isUuid(input.organizationId) || !isUuid(input.templateId)) {
    return { ok: false, error: 'IDs inválidos.' };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data: tmpl } = await supabase
    .from('organization_task_templates')
    .select('*, organization:organizations(name)')
    .eq('id', input.templateId)
    .single();

  if (!tmpl) return { ok: false, error: 'Template não encontrado.' };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const orgName = (tmpl as any).organization?.name || 'Organização';

  const { data: parentTask, error: pErr } = await supabase
    .from('tasks')
    .insert({
      user_id: user.id,
      organization_id: input.organizationId,
      subteam_id: input.subteamId || tmpl.subteam_id || null,
      assigned_member_ids: input.assignedMemberIds || [],
      nome: `[Playbook] ${tmpl.title}`,
      descricao: tmpl.description || null,
      status: 'A Fazer',
      prioridade: 'Média',
      dimensao: orgName,
      prazo: input.prazo || null,
      is_personal: false,
    })
    .select('id')
    .single();

  if (pErr) return { ok: false, error: pErr.message };

  const checklist = Array.isArray(tmpl.checklist_items) ? tmpl.checklist_items : [];
  if (checklist.length > 0) {
    const subtasks = checklist.map((item: any, idx: number) => ({
      user_id: user.id,
      organization_id: input.organizationId,
      subteam_id: input.subteamId || tmpl.subteam_id || null,
      assigned_member_ids: input.assignedMemberIds || [],
      parent_id: parentTask.id,
      nome: item.text || `Passo ${idx + 1}`,
      status: 'A Fazer',
      prioridade: 'Média',
      dimensao: orgName,
      is_personal: false,
      ordem_manual: idx,
    }));

    await supabase.from('tasks').insert(subtasks);
  }

  revalidatePath('/');
  return { ok: true, taskId: parentTask.id };
}

export async function getOrganizationMeetingsAction(orgId: string) {
  if (!isUuid(orgId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  try {
    const { data, error } = await supabase
      .from('organization_meetings')
      .select('*, organization:organizations(name, slug)')
      .eq('organization_id', orgId)
      .order('scheduled_at', { ascending: false });

    if (!error) return { ok: true, meetings: data || [] };
  } catch {
    // Tabela pode ainda não existir
  }
  return { ok: true, meetings: [] };
}

export async function createOrganizationMeetingAction(input: {
  organizationId: string;
  title: string;
  description?: string;
  scheduledAt?: string;
  durationMinutes?: number;
  meetUrl?: string;
  subteamId?: string;
}) {
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data, error } = await supabase
    .from('organization_meetings')
    .insert({
      organization_id: input.organizationId,
      created_by: user.id,
      title: input.title.trim(),
      description: input.description || null,
      scheduled_at: input.scheduledAt || null,
      duration_minutes: input.durationMinutes || 60,
      meet_url: input.meetUrl || null,
      subteam_id: input.subteamId || null,
      review_status: 'draft',
      status: 'scheduled',
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, meeting: data };
}

export async function getMeetingDetailsAction(meetingId: string) {
  if (!isUuid(meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data: meeting, error: mErr } = await supabase
    .from('organization_meetings')
    .select('*, organization:organizations(name, slug)')
    .eq('id', meetingId)
    .single();

  if (mErr || !meeting) return { ok: false, error: mErr?.message || 'Reunião não encontrada.' };

  const { data: personalNote } = await supabase
    .from('organization_meeting_personal_notes')
    .select('*')
    .eq('meeting_id', meetingId)
    .eq('user_id', user.id)
    .maybeSingle();

  return {
    ok: true,
    meeting,
    personalNotes: personalNote?.notes_markdown || '',
    userId: user.id,
  };
}

export async function updateMeetingNotesAction(input: {
  meetingId: string;
  liveNotes?: string;
  processNotes?: string;
  personalNotes?: string;
  transcriptText?: string;
  agendaItems?: Array<{ id: string; title: string; completed: boolean }>;
}) {
  if (!isUuid(input.meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  // Atualiza notas e transcrição da reunião se fornecidas
  if (
    input.liveNotes !== undefined ||
    input.processNotes !== undefined ||
    input.transcriptText !== undefined ||
    input.agendaItems !== undefined
  ) {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.liveNotes !== undefined) patch.live_notes_markdown = input.liveNotes;
    if (input.processNotes !== undefined) patch.process_notes_markdown = input.processNotes;
    if (input.transcriptText !== undefined) patch.transcript_text = input.transcriptText;
    if (input.agendaItems !== undefined) patch.agenda_items = input.agendaItems;

    await supabase
      .from('organization_meetings')
      .update(patch)
      .eq('id', input.meetingId);
  }

  // Atualiza notas pessoais isoladas do usuário
  if (input.personalNotes !== undefined) {
    await supabase
      .from('organization_meeting_personal_notes')
      .upsert(
        {
          meeting_id: input.meetingId,
          user_id: user.id,
          notes_markdown: input.personalNotes,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'meeting_id,user_id' }
      );
  }

  return { ok: true };
}

export async function submitMeetingReviewAction(input: {
  meetingId: string;
  decision: ReviewDecision;
  feedback?: string;
}) {
  if (!isUuid(input.meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data, error } = await supabase
    .from('organization_meeting_reviews')
    .insert({
      meeting_id: input.meetingId,
      reviewer_user_id: user.id,
      decision: input.decision,
      feedback_markdown: input.feedback || null,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  if (input.decision === 'approved') {
    await supabase
      .from('organization_meetings')
      .update({ review_status: 'under_review' })
      .eq('id', input.meetingId);
  }

  return { ok: true, review: data };
}

export async function publishMeetingAtaAction(input: {
  meetingId: string;
  ataMarkdown: string;
}) {
  if (!isUuid(input.meetingId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_meetings')
    .update({
      published_ata_markdown: input.ataMarkdown,
      review_status: 'published',
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.meetingId)
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, meeting: data };
}

/**
 * Cria uma nova organização no ecossistema e vincula o criador como Admin.
 */
export async function createOrganizationAction(input: {
  name: string;
  slug?: string;
  description?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'O nome da organização é obrigatório.' };

  const slug = (input.slug || name)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  const { data, error } = await supabase.rpc('create_new_organization', {
    p_name: name,
    p_slug: slug,
    p_description: input.description || null,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/');
  revalidatePath('/labdiv');
  revalidatePath('/servidor');
  return { ok: true, organization: data };
}

/**
 * Visualiza preview seguro de convite por código ou link.
 */
export async function getOrganizationInvitePreviewAction(codeOrUrl: string) {
  const supabase = await createClient();
  const cleanToken = codeOrUrl
    .trim()
    .replace(/^.*\/convite\//, '')
    .split('?')[0]
    .split('#')[0]
    .trim();

  if (!cleanToken) return { ok: false, error: 'Código ou link de convite vazio.' };

  const { data, error } = await supabase.rpc('get_organization_invite_preview', {
    p_token: cleanToken,
  });

  if (error) return { ok: false, error: error.message };
  if (!data?.valid) return { ok: false, error: data?.error || 'Convite inválido ou expirado.' };

  return { ok: true, preview: data, token: cleanToken };
}

/**
 * Entra na organização por código de convite ou link.
 */
export async function joinOrganizationByCodeAction(input: {
  codeOrUrl: string;
  claimPlaceholderId?: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Você precisa estar logado para entrar na organização.' };

  const cleanToken = input.codeOrUrl
    .trim()
    .replace(/^.*\/convite\//, '')
    .split('?')[0]
    .split('#')[0]
    .trim()
    .toUpperCase();

  if (!cleanToken) return { ok: false, error: 'Código de convite inválido.' };

  // Reivindicação automática de perfil placeholder se houver correspondência de e-mail ou nome
  let claimPlaceholderId = input.claimPlaceholderId || null;
  if (!claimPlaceholderId) {
    try {
      const { data: inv } = await supabase
        .from('organization_invites')
        .select('organization_id')
        .eq('token', cleanToken)
        .maybeSingle();

      if (inv?.organization_id) {
        const userEmail = (user.email || '').toLowerCase().trim();
        const userName = (user.user_metadata?.full_name || '').toLowerCase().trim();
        const { data: placeholders } = await supabase
          .from('organization_members')
          .select('id, email, full_name')
          .eq('organization_id', inv.organization_id)
          .eq('is_placeholder', true);

        if (Array.isArray(placeholders)) {
          const match = placeholders.find(
            (p) =>
              (p.email && p.email.toLowerCase().trim() === userEmail) ||
              (p.full_name && p.full_name.toLowerCase().trim() === userName)
          );
          if (match) {
            claimPlaceholderId = match.id;
          }
        }
      }
    } catch {}
  }

  const INSTITUTIONAL_CODES: Record<string, { orgId: string; slug: string }> = {
    'LABDIV-IFUSP-2026': { orgId: LABDIV_ORG_ID, slug: 'labdiv' },
    'LABDIV-2026': { orgId: LABDIV_ORG_ID, slug: 'labdiv' },
    'LABDIV': { orgId: LABDIV_ORG_ID, slug: 'labdiv' },
    'SHOW-FISICA-2026': { orgId: SHOW_DA_FISICA_ORG_ID, slug: 'show-da-fisica' },
    'SHOW-DA-FISICA': { orgId: SHOW_DA_FISICA_ORG_ID, slug: 'show-da-fisica' },
    'SHOW': { orgId: SHOW_DA_FISICA_ORG_ID, slug: 'show-da-fisica' },
    'HACKERSPACE-IFUSP': { orgId: HS_ORG_ID, slug: 'hs' },
    'HACKERSPACE-2026': { orgId: HS_ORG_ID, slug: 'hs' },
    'HS': { orgId: HS_ORG_ID, slug: 'hs' },
    'PROFIS-IFUSP-2026': { orgId: PROFIS_ORG_ID, slug: 'profis' },
    'PROFIS-2026': { orgId: PROFIS_ORG_ID, slug: 'profis' },
    'PROFIS': { orgId: PROFIS_ORG_ID, slug: 'profis' },
  };

  const { data, error } = await supabase.rpc('accept_organization_invite', {
    p_token: cleanToken,
    p_claim_placeholder_id: claimPlaceholderId,
  });

  let effectiveOrgId = (data as any)?.organization_id;

  if (error) {
    const inst = INSTITUTIONAL_CODES[cleanToken];
    if (inst) {
      // Ingressa diretamente na organização institucional reconhecida
      effectiveOrgId = inst.orgId;
      const userName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Membro';
      const { error: insErr } = await supabase
        .from('organization_members')
        .upsert(
          {
            organization_id: inst.orgId,
            user_id: user.id,
            full_name: userName,
            email: user.email || '',
            org_role: 'member',
          },
          { onConflict: 'organization_id,user_id' }
        );
      if (insErr && !insErr.message.includes('duplicate')) {
        // Se RLS impedir o insert direto, tenta chamada pela rota interna de sync
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/auth/hub-embed`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET}`,
          },
          body: JSON.stringify({
            action: 'sync_membership',
            email: user.email,
            fullName: userName,
            orgSlug: inst.slug,
          }),
        }).catch(() => {});
      }
    } else {
      return { ok: false, error: error.message };
    }
  }

  // Sincroniza imediatamente com o HUB LabDiv se a organização for identificada
  try {
    let orgSlug: string | null = null;
    const orgId = effectiveOrgId || (data as any)?.organization_id;
    if (orgId === LABDIV_ORG_ID) orgSlug = 'labdiv';
    else if (orgId === SHOW_DA_FISICA_ORG_ID) orgSlug = 'show-da-fisica';
    else if (orgId === HS_ORG_ID) orgSlug = 'hs';
    else if (orgId === PROFIS_ORG_ID) orgSlug = 'profis';
    else if (orgId) {
      const { data: dbOrg } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', orgId)
        .maybeSingle();
      if (dbOrg?.slug) orgSlug = dbOrg.slug;
    }

    if (orgSlug) {
      const hubBaseUrl = (process.env.NEXT_PUBLIC_HUB_URL || 'http://localhost:3001').replace(/\/+$/, '');
      const hubSecret = process.env.HUB_SSO_SECRET || process.env.ADMIN_SECRET_KEY || 'hub-default-sso-secret';
      const cleanEmail = (user.email || '').toLowerCase().trim();
      const payloadString = JSON.stringify({
        email: cleanEmail,
        hubUserId: user.user_metadata?.hub_user_id,
        orgSlug,
        action: 'add',
      });
      const hmacSig = crypto.createHmac('sha256', hubSecret).update(payloadString).digest('hex');

      await fetch(`${hubBaseUrl}/api/iniciativas/org-member-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${hubSecret}`,
          'X-Hub-Signature': hmacSig,
        },
        body: payloadString,
      }).catch(() => {});
    }
  } catch {}

  revalidatePath('/');
  revalidatePath('/labdiv');
  revalidatePath('/servidor');
  return { ok: true, result: data };
}

/**
 * Obtém ou gera código de convite ativo para compartilhamento com a equipe.
 */
export async function getOrCreateActiveInviteAction(orgId: string) {
  if (!isUuid(orgId)) return { ok: false, error: 'ID de organização inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  // Busca convite ativo existente
  const { data: existing } = await supabase
    .from('organization_invites')
    .select('*')
    .eq('organization_id', orgId)
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { ok: true, token: existing.token, invite: existing };
  }

  // Cria novo convite padrão com expiração de 30 dias
  const { data: newInv, error: invErr } = await supabase
    .from('organization_invites')
    .insert({
      organization_id: orgId,
      created_by: user.id,
      assigned_role: 'member',
    })
    .select('*')
    .single();

  if (invErr) return { ok: false, error: invErr.message };
  return { ok: true, token: newInv.token, invite: newInv };
}
