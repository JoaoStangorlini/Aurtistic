// Este programa é um software livre (Licença AGPLv3)
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { getTaskColumns, getUserProfile } from '@/app/(dashboard)/actions';
import { getUserOrganizationsAction } from '@/app/(dashboard)/organizacoes/actions';
import { LabDivWorkspaceClient } from '@/components/organizacoes/LabDivWorkspaceClient';
import type {
  Organization,
  OrganizationMember,
  OrganizationSubteam,
  OrganizationMeeting,
} from '@/types/organizations';

export const dynamic = 'force-dynamic';

export default async function LabDivPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/labdiv');
  }

  // 1. Busca organização LabDiv pelo slug ou UUID
  const { data: orgData } = await supabase
    .from('organizations')
    .select('*')
    .or("slug.eq.labdiv,id.eq.1ab41410-0000-4000-8000-000000000001")
    .maybeSingle();

  const organization: Organization = orgData || {
    id: '1ab41410-0000-4000-8000-000000000001',
    name: 'LabDiv',
    slug: 'labdiv',
    description: 'Laboratório de Divulgação Científica (LabDiv - IFUSP)',
    created_by: 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e',
    vault_quota_bytes: 26843545600,
    vault_used_bytes: 0,
    event_boost_active: false,
    event_boost_expires_at: null,
    event_boost_reason: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

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

  // 4. Verifica permissão de acesso
  let myMember =
    members.find(
      (m) =>
        m.user_id === user.id ||
        (m.email && user.email && m.email.toLowerCase() === user.email.toLowerCase())
    ) || null;

  const isPrimaryAdmin = user.id === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';
  const isHubLabDivAdmin =
    user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386' ||
    user.id === 'fb12ee7b-da8f-4b80-ac5c-3b8d478047d2' ||
    Boolean(user.email?.includes('hublabdiv')) ||
    Boolean(user.email?.endsWith('@usp.br')) ||
    Boolean(user.user_metadata?.hub_user_id);

  if (!myMember && !isPrimaryAdmin && !isHubLabDivAdmin) {
    redirect('/');
  }

  if (!myMember && (isPrimaryAdmin || isHubLabDivAdmin)) {
    const isLeadAdmin =
      isPrimaryAdmin ||
      user.id === '7dcfe172-1cf0-4389-9abd-f340b1408386' ||
      user.email === 'joaopaulostangorlini@usp.br' ||
      user.email === 'andyraposo@usp.br';

    myMember = {
      id: user.id,
      organization_id: organization.id,
      user_id: user.id,
      full_name:
        user.user_metadata?.full_name ||
        user.user_metadata?.username ||
        (isPrimaryAdmin ? 'João Stangorlini' : 'Membro HUB LabDiv'),
      email: user.email || '',
      org_role: isLeadAdmin ? 'admin' : 'member',
      can_upload_org_vault: true,
      cognitive_capacity: 'normal',
      is_placeholder: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  // 5. Busca reuniões da organização
  const { data: meetingsData } = await supabase
    .from('organization_meetings')
    .select('*, organization:organizations(name, slug)')
    .eq('organization_id', organization.id)
    .order('scheduled_at', { ascending: false });

  const meetings: OrganizationMeeting[] = meetingsData || [];

  // 6. Busca tarefas vinculadas ao LabDiv (organization_id OU dimensão legada HUB / LabDiv)
  let tasksData: any[] = [];
  let isDbMigrationPending = false;

  const { data: rawTasks, error: tErr } = await supabase
    .from('tasks')
    .select('*')
    .or(`organization_id.eq.${organization.id},dimensao.eq.HUB,dimensao.eq.LabDiv`)
    .or('is_personal.is.null,is_personal.eq.false')
    .order('created_at', { ascending: false });

  if (tErr) {
    // Se a coluna organization_id ainda não foi criada no banco (migração 06 pendente)
    if (tErr.message?.includes('organization_id') || (tErr as any).code === '42703') {
      isDbMigrationPending = true;
      const { data: fallbackTasks, error: fErr } = await supabase
        .from('tasks')
        .select('*')
        .or('dimensao.eq.HUB,dimensao.eq.LabDiv')
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
  const profile = await getUserProfile();
  const orgsRes = await getUserOrganizationsAction();
  const userOrganizations = orgsRes.ok && Array.isArray(orgsRes.organizations) ? orgsRes.organizations : [organization];

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
      userOrganizations={userOrganizations}
    />
  );
}
