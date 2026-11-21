// Este programa é um software livre (Licença AGPLv3)
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { getTaskColumns, getUserProfile } from '@/app/(dashboard)/actions';
import { getUserOrganizationsAction } from '@/app/(dashboard)/organizacoes/actions';
import { LabDivWorkspaceClient } from '@/components/organizacoes/LabDivWorkspaceClient';
import { OrganizationBrandProvider } from '@/components/organizacoes/OrganizationBrandProvider';
import { OrgRestrictedAccessView } from '@/components/organizacoes/OrgRestrictedAccessView';
import { normalizeOrgBrandSlug } from '@/lib/org-brand-tokens';
import { isUuid } from '@/lib/validators';
import type {
  Organization,
  OrganizationMember,
  OrganizationSubteam,
  OrganizationMeeting,
} from '@/types/organizations';

export const dynamic = 'force-dynamic';

interface LabDivPageProps {
  searchParams?: Promise<{ org?: string; view?: string }>;
}

export default async function LabDivPage({ searchParams }: LabDivPageProps) {
  const params = await searchParams;
  const rawOrgParam = (params?.org || 'labdiv').toLowerCase().trim();
  const targetOrgParam =
    rawOrgParam === 'hackerspace'
      ? 'hs'
      : rawOrgParam === 'show' || rawOrgParam === 'show_da_fisica' || rawOrgParam === 'showdefisica'
        ? 'show-da-fisica'
        : rawOrgParam.includes('profis')
          ? 'labdiv'
          : rawOrgParam;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/labdiv${targetOrgParam ? `?org=${targetOrgParam}` : ''}`);
  }

  // 1. Busca organização pelo slug ou UUID
  let query = supabase.from('organizations').select('*');
  if (isUuid(targetOrgParam)) {
    query = query.eq('id', targetOrgParam);
  } else {
    query = query.eq('slug', targetOrgParam);
  }
  const { data: orgData } = await query.maybeSingle();

  const defaultOrgsMap: Record<string, Organization> = {
    'labdiv': {
      id: '1ab41410-0000-4000-8000-000000000001',
      name: 'LabDiv',
      slug: 'labdiv',
      description: 'Laboratório de Comunicação e Divulgação Científica do IFUSP',
      avatar_url: '/labdiv-logo.png',
      primary_color: '#1F9FCF',
      secondary_color: '#FFCC00',
      storage_quota_bytes: 53687091200,
      storage_used_bytes: 0,
      storage_policy: 'admin_or_permitted',
      brand_config: {
        themeId: 'labdiv',
        bgApp: '#070c16',
        bgSurface: '#0d1524',
        textPrimary: '#f8fafc',
        accents: ['#1F9FCF', '#F14343', '#FFCC00', '#0F4780'],
        fontDisplay: 'Space Grotesk',
        fontBody: 'Inter',
        uppercaseTitles: false,
        glowIntensity: 0.75,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    'show-da-fisica': {
      id: '1ab41410-0000-4000-8000-000000000002',
      name: 'Show de Física',
      slug: 'show-da-fisica',
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    'hs': {
      id: '1ab41410-0000-4000-8000-000000000003',
      name: 'Hackerspace IFUSP',
      slug: 'hs',
      description: 'Laboratório comunitário de cultura maker, eletrônica e hardware livre',
      avatar_url: '/hs-logo.png',
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  };

  const defaultByUuid = Object.values(defaultOrgsMap).find((d) => d.id === targetOrgParam);
  const organization: Organization = orgData || defaultByUuid || defaultOrgsMap[targetOrgParam] || defaultOrgsMap['labdiv'];

  // 2. Busca subequipes (com fallback estruturado)
  const { data: subteamsData } = await supabase
    .from('organization_subteams')
    .select('*')
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: true });

  const subteams: OrganizationSubteam[] =
    subteamsData && subteamsData.length > 0
      ? subteamsData
      : [
          {
            id: '1ab41410-0000-4000-8000-000000000011',
            organization_id: organization.id,
            name: 'Programação',
            description: 'Desenvolvimento de software, infraestrutura e automação',
            color: '#3B82F6',
            created_at: new Date().toISOString(),
          },
          {
            id: '1ab41410-0000-4000-8000-000000000012',
            organization_id: organization.id,
            name: 'Comunicação',
            description: 'Design, redes, eventos e divulgação científica',
            color: '#06B6D4',
            created_at: new Date().toISOString(),
          },
          {
            id: '1ab41410-0000-4000-8000-000000000013',
            organization_id: organization.id,
            name: 'Pesquisa',
            description: 'Estudos acadêmicos, acessibilidade e neurociência',
            color: '#10B981',
            created_at: new Date().toISOString(),
          },
          {
            id: '1ab41410-0000-4000-8000-000000000014',
            organization_id: organization.id,
            name: 'Administração',
            description: 'Gestão institucional, finanças e processos internos',
            color: '#F59E0B',
            created_at: new Date().toISOString(),
          },
        ];

  // 3. Busca membros da organização (com fallback estruturado)
  const { data: membersData } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', organization.id)
    .order('created_at', { ascending: true });

  const members: OrganizationMember[] =
    membersData && membersData.length > 0
      ? membersData
      : [
          {
            id: '1ab41410-0000-4000-8000-000000000021',
            organization_id: organization.id,
            user_id: 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e',
            full_name: 'João Stangorlini',
            email: 'joao@aurtistic.com',
            org_role: 'admin',
            can_upload_org_vault: true,
            cognitive_capacity: 'normal',
            is_placeholder: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: '1ab41410-0000-4000-8000-000000000022',
            organization_id: organization.id,
            user_id: '7dcfe172-1cf0-4389-9abd-f340b1408386',
            full_name: 'HUB LabDiv',
            email: 'hublabdiv@gmail.com',
            org_role: 'admin',
            can_upload_org_vault: true,
            cognitive_capacity: 'normal',
            is_placeholder: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: '1ab41410-0000-4000-8000-000000000023',
            organization_id: organization.id,
            user_id: null,
            full_name: 'Andy',
            email: null,
            org_role: 'member',
            can_upload_org_vault: false,
            cognitive_capacity: 'normal',
            is_placeholder: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: '1ab41410-0000-4000-8000-000000000024',
            organization_id: organization.id,
            user_id: null,
            full_name: 'Leo',
            email: null,
            org_role: 'member',
            can_upload_org_vault: false,
            cognitive_capacity: 'normal',
            is_placeholder: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: '1ab41410-0000-4000-8000-000000000025',
            organization_id: organization.id,
            user_id: null,
            full_name: 'Dani',
            email: null,
            org_role: 'member',
            can_upload_org_vault: false,
            cognitive_capacity: 'normal',
            is_placeholder: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: '1ab41410-0000-4000-8000-000000000026',
            organization_id: organization.id,
            user_id: null,
            full_name: 'Lorenzo',
            email: null,
            org_role: 'member',
            can_upload_org_vault: false,
            cognitive_capacity: 'normal',
            is_placeholder: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: '1ab41410-0000-4000-8000-000000000027',
            organization_id: organization.id,
            user_id: null,
            full_name: 'Nacky',
            email: null,
            org_role: 'member',
            can_upload_org_vault: false,
            cognitive_capacity: 'normal',
            is_placeholder: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];

  // 4. Verifica permissão de acesso (sem bypass cego por @usp.br ou hub_user_id)
  const [profile, orgsRes] = await Promise.all([
    getUserProfile(),
    getUserOrganizationsAction(),
  ]);
  const userOrganizations = orgsRes.ok && Array.isArray(orgsRes.organizations) ? orgsRes.organizations : [];
  const normalizedCurrentSlug = normalizeOrgBrandSlug(organization.slug);
  const isOrgInHub = userOrganizations.some(
    (o) => o.id === organization.id || normalizeOrgBrandSlug(o.slug) === normalizedCurrentSlug
  );

  let myMember =
    members.find(
      (m) =>
        m.user_id === user.id ||
        (m.email && user.email && m.email.toLowerCase() === user.email.toLowerCase())
    ) || null;

  const normalizedEmail = (user.email || '').toLowerCase().trim();
  const isPrimaryAdmin =
    user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ||
    user.id === '48b2fb73-c5d3-4eff-b727-54e4b91bf21b' ||
    user.id === '8a3e4272-010d-4479-94cb-26178d544ea2';
  const isProfileAdmin = profile?.role === 'admin';
  const isConfirmedAdmin =
    isPrimaryAdmin ||
    isProfileAdmin ||
    myMember?.org_role === 'admin' ||
    user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386' ||
    user.id === 'fb12ee7b-da8f-4b80-ac5c-3b8d478047d2' ||
    normalizedEmail === 'joaopaulostangorlini@usp.br' ||
    normalizedEmail === 'joaostangorlini@usp.br' ||
    normalizedEmail === 'joao@aurtistic.com' ||
    normalizedEmail === 'hublabdiv@gmail.com' ||
    user.app_metadata?.role === 'admin';

  if (!myMember && !isConfirmedAdmin && !isOrgInHub) {
    return (
      <OrganizationBrandProvider
        orgSlug={normalizedCurrentSlug}
        brandConfig={(organization.brand_config as Record<string, unknown> | null) || null}
      >
        <OrgRestrictedAccessView organization={organization} orgSlug={normalizedCurrentSlug} />
      </OrganizationBrandProvider>
    );
  }

  if (!myMember && (isConfirmedAdmin || isOrgInHub)) {
    const isLeadAdmin =
      isPrimaryAdmin ||
      isProfileAdmin ||
      user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386' ||
      user.id === '48b2fb73-c5d3-4eff-b727-54e4b91bf21b' ||
      normalizedEmail === 'joaopaulostangorlini@usp.br' ||
      normalizedEmail === 'joaostangorlini@usp.br' ||
      normalizedEmail === 'hublabdiv@gmail.com' ||
      user.app_metadata?.role === 'admin';

    myMember = {
      id: user.id,
      organization_id: organization.id,
      user_id: user.id,
      full_name:
        profile?.display_name ||
        user.user_metadata?.full_name ||
        profile?.username ||
        (isPrimaryAdmin ? 'João Stangorlini' : 'Membro HUB LabDiv'),
      email: user.email || '',
      org_role: isLeadAdmin ? 'admin' : 'member',
      can_upload_org_vault: true,
      cognitive_capacity: 'normal',
      is_placeholder: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    members.unshift(myMember);
  }

  // 5. Busca reuniões da organização
  const { data: meetingsData } = await supabase
    .from('organization_meetings')
    .select('*, organization:organizations(name, slug)')
    .eq('organization_id', organization.id)
    .order('scheduled_at', { ascending: false });

  const meetings: OrganizationMeeting[] = meetingsData || [];

  // 6. Busca tarefas vinculadas à Organização (organization_id OU dimensão correspondente)
  let tasksData: any[] = [];
  let isDbMigrationPending = false;

  const isShow = organization.slug === 'show-da-fisica';
  const isHs = organization.slug === 'hs';
  const isLabDiv = !isShow && !isHs;
  const dimFilter = isShow
    ? 'Show de Física'
    : isHs
      ? 'Hackerspace'
      : 'LabDiv';

  const orFilter = isLabDiv
    ? `organization_id.eq.${organization.id},dimensao.eq.LabDiv,dimensao.eq.HUB`
    : `organization_id.eq.${organization.id},dimensao.eq.${dimFilter}`;

  const { data: rawTasks, error: tErr } = await supabase
    .from('tasks')
    .select('*')
    .or(orFilter)
    .or('is_personal.is.null,is_personal.eq.false')
    .order('created_at', { ascending: false });

  if (tErr) {
    // Se a coluna organization_id ainda não foi criada no banco (migração 06 pendente)
    if (tErr.message?.includes('organization_id') || (tErr as any).code === '42703') {
      isDbMigrationPending = true;
      const fallbackOr = isLabDiv
        ? 'dimensao.eq.HUB,dimensao.eq.LabDiv'
        : `dimensao.eq.${dimFilter}`;
      const { data: fallbackTasks, error: fErr } = await supabase
        .from('tasks')
        .select('*')
        .or(fallbackOr)
        .order('created_at', { ascending: false });

      if (!fErr && fallbackTasks) {
        tasksData = fallbackTasks;
      }
    } else {
      return (
        <div className="h-full flex flex-col p-4 md:p-8 bg-app">
          <div className="p-4 bg-[#93000a]/20 border border-[#93000a] text-[#ffdad6] rounded-md text-sm">
            Erro ao carregar tarefas do LabDiv: {tErr.message}
          </div>
        </div>
      );
    }
  } else {
    tasksData = rawTasks || [];
  }

  // 7. Busca eventos do usuário para alimentar disponibilidade When2Meet
  const { data: userEventsData } = await supabase
    .from('events')
    .select('*')
    .eq('user_id', user.id);

  const columns = await getTaskColumns();
  const finalUserOrganizations = userOrganizations.length > 0 ? userOrganizations : [organization];

  return (
    <LabDivWorkspaceClient
      organization={organization}
      subteams={subteams}
      members={members}
      initialTasks={tasksData || []}
      initialMeetings={meetings}
      columns={columns}
      currentUserId={user.id}
      myMember={myMember}
      quickFilters={profile?.quick_filters || ['responsavel', 'dimensao']}
      quickSorts={profile?.quick_sorts || ['status', 'prazo', 'prioridade', 'manual']}
      advancedSettings={profile?.features_config?.advanced_settings || {}}
      userEvents={userEventsData || []}
      isDbMigrationPending={isDbMigrationPending}
      userOrganizations={finalUserOrganizations}
      initialView={params?.view === 'studio' ? 'studio' : 'organizacoes'}
    />
  );
}
