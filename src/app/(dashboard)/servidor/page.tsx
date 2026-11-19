// Este programa é um software livre (Licença AGPLv3)
import { createClient } from '@/utils/supabase/server';
import { redirect } from 'next/navigation';
import { issueUserStorageSession } from '@/lib/edge-ticket';
import { getUserOrganizationsAction } from '@/app/(dashboard)/organizacoes/actions';
import { PRIMARY_ADMIN_UUID } from '@/lib/portfolio-catalog';
import { UserVaultWorkspace } from '@/components/servidor/UserVaultWorkspace';

export const dynamic = 'force-dynamic';

export default async function ServidorPage({
  searchParams,
}: {
  searchParams?: Promise<{ org?: string; ticket?: string; embed?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const queryOrg = resolvedParams?.org;
  const queryTicket = resolvedParams?.ticket;
  const supabase = await createClient();
  let {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && queryTicket) {
    const secret = process.env.HUB_SSO_SECRET || process.env.EDGE_HMAC_SECRET;
    if (secret) {
      const { verifyHubSsoTicket } = await import('@/lib/hub-sso');
      const verification = verifyHubSsoTicket(queryTicket, secret);
      if (verification.valid && verification.payload) {
        const sso = verification.payload;
        const { data: foundUser } = await supabase
          .from('user_profiles')
          .select('id, username')
          .eq('email', sso.email)
          .maybeSingle();

        const ssoUserId = foundUser?.id || sso.hubUserId || 'sso-guest';
        user = {
          id: ssoUserId,
          email: sso.email,
          user_metadata: {
            full_name: sso.fullName,
            username: sso.username,
          },
          app_metadata: {
            role: sso.role === 'admin' ? 'admin' : 'member',
          },
          aud: 'authenticated',
          created_at: new Date().toISOString(),
        } as any;
      }
    }
  }

  if (!user) {
    redirect('/login?next=/servidor');
  }

  // Emite sessão de armazenamento isolada por usuário via Ticket HMAC-SHA256
  let session;
  try {
    session = await issueUserStorageSession(supabase, user.id);
  } catch (err) {
    console.error('[ServidorPage] Erro ao emitir sessão de storage:', err);
    // Em caso de falha de segredo em produção ou erro crítico, retorne perfil estritamente bloqueado
    const fallbackProfile: import('@/types').UserStorageProfile = {
      user_id: user.id,
      root_folder_slug: user.id,
      public_slug: `criativo-${user.id.slice(0, 6).toLowerCase()}`,
      storage_role: 'member',
      approval_status: 'pending',
      approved_at: null,
      approved_by: null,
      quota_limit_bytes: 0,
      temp_quota_bytes: null,
      temp_quota_expires_at: null,
      temp_quota_reason: null,
      used_bytes: 0,
      pinned_folders: [],
      preferences: { defaultView: 'grid', reducedMotion: true },
      last_sync_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    session = {
      profile: fallbackProfile,
      isApprovedForStorage: false,
      effectiveQuotaBytes: 0,
      hasActiveEventBoost: false,
      vaultTicket: {
        ticket: '',
        payload: {
          userId: user.id,
          role: 'member',
          purpose: 'vault',
          quotaLimitBytes: 0,
          usedBytes: 0,
          iat: 0,
          exp: 0,
          readOnly: true,
        },
        expiresAt: new Date(0).toISOString(),
        userId: user.id,
        role: 'member',
        purpose: 'vault' as const,
        quotaLimitBytes: 0,
        usedBytes: 0,
      },
      mediaReadOnlyTicket: {
        ticket: '',
        payload: {
          userId: user.id,
          role: 'member',
          purpose: 'vault',
          quotaLimitBytes: 0,
          usedBytes: 0,
          iat: 0,
          exp: 0,
          readOnly: true,
        },
        expiresAt: new Date(0).toISOString(),
        userId: user.id,
        role: 'member',
        purpose: 'vault' as const,
        quotaLimitBytes: 0,
        usedBytes: 0,
      },
      serverUrl: 'https://storage.hublabdiv.com.br',
    };
  }

  // Busca organizações das quais o usuário é membro para navegação no Cofre da Organização
  const userOrgsRes = await getUserOrganizationsAction();
  let rawOrgs = userOrgsRes.ok ? userOrgsRes.organizations || [] : [];

  const memberOrgIds = (rawOrgs || [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((o: any) => String(o?.id || ''))
    .filter((id: string) => /^[0-9a-f-]{36}$/i.test(id));

  // Busca índice de arquivos do usuário + itens/atalhos das organizações em que ele é membro (Ponto 9)
  let filesQuery = supabase.from('user_files_index').select('*');
  if (memberOrgIds.length > 0) {
    filesQuery = filesQuery.or(`user_id.eq.${user.id},organization_id.in.(${memberOrgIds.join(',')})`);
  } else {
    filesQuery = filesQuery.eq('user_id', user.id);
  }
  const { data: indexedFiles } = await filesQuery.order('created_at', { ascending: false });

  // Busca links de compartilhamento do usuário
  const { data: shareLinks } = await supabase
    .from('share_links')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Busca tarefas do usuário para vinculação direta
  const { data: userTasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  // Busca perfil para obter nome/username amigável e avatar
  const { data: userProfileData } = await supabase
    .from('user_profiles')
    .select('username, features_config')
    .eq('id', user.id)
    .maybeSingle();

  const userAvatarUrl =
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    (user.id === PRIMARY_ADMIN_UUID &&
    userProfileData?.features_config?.advanced_settings?.sync_curriculum_photo !== false
      ? '/perfil.jpeg'
      : null);

  const userDisplayName =
    user.user_metadata?.full_name ||
    userProfileData?.username ||
    user.user_metadata?.username ||
    user.user_metadata?.name ||
    (user.email ? user.email.split('@')[0] : 'Pessoal');

  // Se a lista estiver vazia e o usuário for o Admin primário ou tiver perfil admin, inclui LabDiv como padrão
  if (
    rawOrgs.length === 0 &&
    (session.profile.storage_role === 'admin' || user.id === PRIMARY_ADMIN_UUID)
  ) {
    rawOrgs = [
      {
        id: '1ab41410-0000-4000-8000-000000000001',
        name: 'LabDiv',
        slug: 'labdiv',
        role: 'admin',
        canUploadOrgVault: true,
        vault_quota_bytes: 53687091200,
        vault_used_bytes: 0,
        event_boost_active: false,
        event_boost_expires_at: null,
        event_boost_reason: null,
      },
    ];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const formattedOrgs = (rawOrgs || []).map((o: any) => ({
    id: o.id,
    name: o.name || 'LabDiv',
    slug: o.slug || 'labdiv',
    role: o.myRole || o.role || 'membro',
    can_upload_vault: o.canUploadOrgVault !== false,
    quotaBytes: Number(o.vault_quota_bytes || o.storage_quota_bytes || 26843545600),
    usedBytes: Number(o.vault_used_bytes || o.storage_used_bytes || 0),
    boostActive: Boolean(o.event_boost_active),
    boostExpiresAt: o.event_boost_expires_at || null,
    boostReason: o.event_boost_reason || null,
  }));

  const initialOrgId = queryOrg
    ? (formattedOrgs.find((o: any) => o.id === queryOrg || o.slug === queryOrg)?.id || null)
    : null;

  return (
    <div className="min-h-full flex flex-col bg-transparent">
      <UserVaultWorkspace
        profile={session.profile}
        isApprovedForStorage={session.isApprovedForStorage}
        effectiveQuotaBytes={session.effectiveQuotaBytes}
        hasActiveEventBoost={session.hasActiveEventBoost}
        initialVaultTicket={session.vaultTicket.ticket}
        serverUrl={session.serverUrl}
        initialIndexedFiles={indexedFiles || []}
        initialShareLinks={shareLinks || []}
        userTasks={userTasks || []}
        userOrganizations={formattedOrgs}
        userName={userDisplayName}
        userAvatarUrl={userAvatarUrl}
        initialOrgId={initialOrgId}
      />
    </div>
  );
}
