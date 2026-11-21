// Este programa é um software livre (Licença AGPLv3)
import { createClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';
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
        let resolvedSsoUserId: string | null = null;
        const adminClient = createAdminClient();
        if (adminClient) {
          if (sso.hubUserId) {
            const { data: secByHub } = await adminClient
              .from('user_private_secrets')
              .select('user_id')
              .eq('hub_user_id', sso.hubUserId)
              .maybeSingle();
            if (secByHub?.user_id) resolvedSsoUserId = secByHub.user_id;
          }
          if (!resolvedSsoUserId && sso.email) {
            const { data: secByEmail } = await adminClient
              .from('user_private_secrets')
              .select('user_id')
              .ilike('linked_email', sso.email)
              .maybeSingle();
            if (secByEmail?.user_id) resolvedSsoUserId = secByEmail.user_id;
          }
        }

        const ssoUserId = resolvedSsoUserId || sso.hubUserId || 'sso-guest';
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

  // Busca índice de arquivos em projeção leve (sem exif_data das fotos no SSR) + paginação
  const LIGHT_INDEX_COLUMNS =
    'id, user_id, organization_id, relative_path, filename, mime_type, size_bytes, is_directory, has_pin, linked_task_id, linked_task_ids, show_in_portfolio, show_in_curriculum, curriculum_label, title, description, album, category, tags, is_favorite, visibility, display_order, created_at, updated_at';
  const scopeFilterOr =
    memberOrgIds.length > 0
      ? `user_id.eq.${user.id},organization_id.in.(${memberOrgIds.join(',')})`
      : null;

  const indexedFiles: any[] = [];
  const PAGE_SIZE = 1000;
  for (let offset = 0; offset < 10000; offset += PAGE_SIZE) {
    let pageQuery = supabase
      .from('user_files_index')
      .select(LIGHT_INDEX_COLUMNS);
    pageQuery = scopeFilterOr ? pageQuery.or(scopeFilterOr) : pageQuery.eq('user_id', user.id);
    const { data: pageRows } = await pageQuery
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (!Array.isArray(pageRows) || pageRows.length === 0) break;
    indexedFiles.push(...pageRows);
    if (pageRows.length < PAGE_SIZE) break;
  }

  // Carrega exif_data exclusivamente de atalhos de pasta (poucas linhas) para preservar resolução cross-scope
  let shortcutsMetaQuery = supabase
    .from('user_files_index')
    .select('id, exif_data')
    .or('mime_type.eq.inode/directory+shortcut,relative_path.ilike.%.shortcut.json')
    .limit(200);
  if (scopeFilterOr) {
    shortcutsMetaQuery = shortcutsMetaQuery.or(scopeFilterOr);
  } else {
    shortcutsMetaQuery = shortcutsMetaQuery.eq('user_id', user.id);
  }
  const { data: shortcutMetaRows } = await shortcutsMetaQuery;
  const shortcutExifById = new Map<string, Record<string, unknown>>();
  for (const row of shortcutMetaRows || []) {
    if (row?.id && row.exif_data) {
      shortcutExifById.set(row.id, row.exif_data as Record<string, unknown>);
    }
  }
  for (const row of indexedFiles) {
    row.exif_data = shortcutExifById.get(row.id) || {};
  }

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
  const formattedOrgs = (rawOrgs || []).map((o: any) => {
    const hasOrgBoost = Boolean(
      o.event_boost_active ||
      (typeof o.storage_boost_bytes === 'number' &&
       o.storage_boost_bytes > 0 &&
       (!o.storage_boost_until || new Date(o.storage_boost_until).getTime() > Date.now()))
    );

    return {
      id: o.id,
      name: o.name || 'LabDiv',
      slug: o.slug || 'labdiv',
      role: o.myRole || o.role || 'membro',
      can_upload_vault: o.canUploadOrgVault !== false,
      quotaBytes: hasOrgBoost && typeof o.storage_boost_bytes === 'number' && o.storage_boost_bytes > 0
        ? Number(o.storage_boost_bytes)
        : Number(o.vault_quota_bytes || o.storage_quota_bytes || 26843545600),
      usedBytes: Number(o.vault_used_bytes || o.storage_used_bytes || 0),
      boostActive: hasOrgBoost,
      boostExpiresAt: o.event_boost_expires_at || o.storage_boost_until || null,
      boostReason: o.event_boost_reason || o.storage_boost_reason || null,
    };
  });

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
