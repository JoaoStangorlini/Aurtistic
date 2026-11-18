// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/lib/edge-ticket.ts (Exclusivo Server-Side — Node.js crypto)

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  EdgeTenantTicketPayload,
  SignedEdgeTicket,
  StorageRole,
  TicketPurpose,
  UserFileIndexRow,
  UserStorageProfile,
} from '@/types';
import {
  DEFAULT_EDGE_STORAGE_URL,
  buildTenantStreamUrl,
  buildTenantThumbUrl,
} from './edge-urls';

export const PRIMARY_ADMIN_UUID = 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e';

export const DEFAULT_ECOSYSTEM_ORGS_BY_ID: Record<
  string,
  { id: string; slug: string; name: string; storage_quota_bytes: number; storage_used_bytes: number }
> = {
  '1ab41410-0000-4000-8000-000000000001': {
    id: '1ab41410-0000-4000-8000-000000000001',
    slug: 'labdiv',
    name: 'LabDiv',
    storage_quota_bytes: 53687091200,
    storage_used_bytes: 0,
  },
  '1ab41410-0000-4000-8000-000000000002': {
    id: '1ab41410-0000-4000-8000-000000000002',
    slug: 'show-da-fisica',
    name: 'Show de Física',
    storage_quota_bytes: 53687091200,
    storage_used_bytes: 0,
  },
  '1ab41410-0000-4000-8000-000000000003': {
    id: '1ab41410-0000-4000-8000-000000000003',
    slug: 'hs',
    name: 'Hackerspace IFUSP',
    storage_quota_bytes: 53687091200,
    storage_used_bytes: 0,
  },
};

export interface IssuedUserStorageSession {
  profile: UserStorageProfile;
  isApprovedForStorage: boolean;
  effectiveQuotaBytes: number;
  hasActiveEventBoost: boolean;
  vaultTicket: SignedEdgeTicket;
  mediaReadOnlyTicket: SignedEdgeTicket;
  serverUrl: string;
}

/**
 * Busca (ou auto-inicializa se ausente) o perfil de storage do usuário autenticado
 * e emite tanto o ticket de escrita do Cofre (15 min) quanto o ticket de mídia (2h).
 */
export async function issueUserStorageSession(
  supabase: SupabaseClient,
  userId: string,
  options?: { unlockedPins?: string[]; emailHint?: string }
): Promise<IssuedUserStorageSession> {
  const isPrimaryAdmin = userId === PRIMARY_ADMIN_UUID;

  let { data: profileRow } = await supabase
    .from('user_storage_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (!profileRow) {
    const fallbackSlug = isPrimaryAdmin
      ? 'stangorlini'
      : `criativo-${userId.slice(0, 6).toLowerCase()}`;

    const initialInsert = {
      user_id: userId,
      root_folder_slug: userId,
      public_slug: fallbackSlug,
      storage_role: isPrimaryAdmin ? 'admin' : 'member',
      approval_status: isPrimaryAdmin ? 'approved' : 'pending',
      quota_limit_bytes: isPrimaryAdmin ? 500 * 1024 * 1024 * 1024 : DEFAULT_APPROVED_QUOTA_BYTES,
      used_bytes: 0,
    };

    const { data: inserted } = await supabase
      .from('user_storage_profiles')
      .upsert(initialInsert, { onConflict: 'user_id' })
      .select('*')
      .maybeSingle();

    profileRow = inserted || {
      ...initialInsert,
      approved_at: isPrimaryAdmin ? new Date().toISOString() : null,
      approved_by: null,
      temp_quota_bytes: null,
      temp_quota_expires_at: null,
      temp_quota_reason: null,
      pinned_folders: [],
      preferences: { defaultView: 'grid', reducedMotion: true },
      last_sync_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const profile = profileRow as UserStorageProfile;
  const { isApprovedForStorage, effectiveQuotaBytes, hasActiveEventBoost } =
    computeEffectiveQuotaBytes(profile);

  const serverUrl = getEdgeStorageServerUrl();

  // Resolve organizações permitidas ao usuário para atalhos cross-scope seguros no Edge Server
  const allowedOrgSet = new Set<string>();
  try {
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, organization:organizations(slug)')
      .eq('user_id', userId);
    for (const m of memberships || []) {
      const orgObj = m.organization as { slug?: string } | { slug?: string }[] | null;
      const slug = Array.isArray(orgObj) ? orgObj[0]?.slug : orgObj?.slug;
      const fallbackSlug = DEFAULT_ECOSYSTEM_ORGS_BY_ID[String(m.organization_id || '')]?.slug;
      if (slug) allowedOrgSet.add(slug);
      else if (fallbackSlug) allowedOrgSet.add(fallbackSlug);
    }
    if (profile.storage_role === 'admin' || isPrimaryAdmin) {
      Object.values(DEFAULT_ECOSYSTEM_ORGS_BY_ID).forEach((o) => allowedOrgSet.add(o.slug));
    } else if (options?.emailHint || allowedOrgSet.size === 0) {
      const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
      const email = (options?.emailHint || authData?.user?.email || '').toLowerCase();
      if (email) {
        const hubBase = (
          process.env.NEXT_PUBLIC_HUB_URL ||
          process.env.HUB_URL ||
          'http://localhost:3001'
        ).replace(/\/+$/, '');
        const secret =
          process.env.HUB_SSO_SECRET ||
          process.env.ADMIN_SECRET_KEY ||
          process.env.EDGE_HMAC_SECRET ||
          'hub-default-sso-secret';
        const hubRes = await fetch(
          `${hubBase}/api/iniciativas/org-member-sync?email=${encodeURIComponent(email)}`,
          { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(1200) }
        ).catch(() => null);
        if (hubRes && hubRes.ok) {
          const hubData = await hubRes.json().catch(() => null);
          if (hubData && Array.isArray(hubData.organizations)) {
            hubData.organizations.forEach((s: string) => {
              if (typeof s === 'string' && s.trim()) allowedOrgSet.add(s.trim().toLowerCase());
            });
          }
        }
      }
    }
  } catch {}
  const allowedOrgSlugs = Array.from(allowedOrgSet);

  const vaultTicket = signEdgeTenantTicket({
    userId,
    role: profile.storage_role,
    purpose: 'vault',
    quotaLimitBytes: effectiveQuotaBytes,
    usedBytes: profile.used_bytes || 0,
    readOnly: !isApprovedForStorage,
    allowedOrgSlugs,
    unlockedPins: options?.unlockedPins,
    ttlMs: VAULT_TICKET_TTL_MS,
  });

  const mediaReadOnlyTicket = signEdgeTenantTicket({
    userId,
    role: profile.storage_role,
    purpose: 'vault',
    quotaLimitBytes: effectiveQuotaBytes,
    usedBytes: profile.used_bytes || 0,
    readOnly: true,
    allowedOrgSlugs,
    unlockedPins: options?.unlockedPins,
    ttlMs: MEDIA_READONLY_TICKET_TTL_MS,
  });

  return {
    profile,
    isApprovedForStorage,
    effectiveQuotaBytes,
    hasActiveEventBoost,
    vaultTicket,
    mediaReadOnlyTicket,
    serverUrl,
  };
}

export interface IssuedOrganizationStorageSession {
  organizationId: string;
  orgSlug: string;
  orgName: string;
  canWriteOrgVault: boolean;
  effectiveQuotaBytes: number;
  usedBytes: number;
  vaultTicket: SignedEdgeTicket;
  serverUrl: string;
}

/**
 * Emite sessão de armazenamento para o Cofre Compartilhado de uma Organização (Org Vault).
 * O isolamento é absoluto: o root no Fire Stick é `/storage/orgs/{orgSlug}`.
 */
export async function issueOrganizationVaultSession(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
  options?: { unlockedPins?: string[] }
): Promise<IssuedOrganizationStorageSession> {
  const { data: member } = await supabase
    .from('organization_members')
    .select('org_role, can_upload_org_vault, organization:organizations(*)')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let org: any = member?.organization;
  let isOrgAdmin = member?.org_role === 'admin';
  let canWrite = Boolean(isOrgAdmin || member?.can_upload_org_vault);

  if (!member || !member.organization) {
    const fallbackOrg = DEFAULT_ECOSYSTEM_ORGS_BY_ID[organizationId];
    if (member && fallbackOrg) {
      org = fallbackOrg;
    } else if (fallbackOrg) {
      let allowFallback = userId === PRIMARY_ADMIN_UUID;
      let isAdminUser = userId === PRIMARY_ADMIN_UUID;

      if (!allowFallback) {
        let user: import('@supabase/supabase-js').User | null = null;
        let isProfileAdmin = false;
        try {
          const [uRes, pRes] = await Promise.all([
            supabase.auth.getUser(),
            supabase.from('user_profiles').select('role').eq('id', userId).maybeSingle(),
          ]);
          user = uRes?.data?.user || null;
          isProfileAdmin = pRes?.data?.role === 'admin';
        } catch {}

        const email = (user?.email || '').toLowerCase().trim();
        const username = (user?.user_metadata?.username || '').toLowerCase().trim();
        const isConfirmedGlobalAdmin =
          isProfileAdmin ||
          userId === 'f2f1e6c9-a178-433f-9d87-37d6ce7ec94e' ||
          userId === '48b2fb73-c5d3-4eff-b727-54e4b91bf21b' ||
          userId === '8a3e4272-010d-4479-94cb-26178d544ea2' ||
          email === 'joaopaulostangorlini@usp.br' ||
          email === 'joaostangorlini@usp.br' ||
          email === 'joao@aurtistic.com' ||
          email === 'hublabdiv@gmail.com' ||
          username === 'joaostangorlini' ||
          username === 'joao' ||
          username === 'hublabdiv' ||
          user?.app_metadata?.role === 'admin' ||
          user?.user_metadata?.role === 'admin';

        if (isConfirmedGlobalAdmin) {
          allowFallback = true;
          isAdminUser = true;
        } else if (email) {
          try {
            const hubBase = (
              process.env.NEXT_PUBLIC_HUB_URL ||
              process.env.HUB_URL ||
              'http://localhost:3001'
            ).replace(/\/+$/, '');
            const secret =
              process.env.HUB_SSO_SECRET ||
              process.env.ADMIN_SECRET_KEY ||
              process.env.EDGE_HMAC_SECRET ||
              'hub-default-sso-secret';
            const hubRes = await fetch(
              `${hubBase}/api/iniciativas/org-member-sync?email=${encodeURIComponent(email)}`,
              {
                headers: { Authorization: `Bearer ${secret}` },
                signal: AbortSignal.timeout(1500),
              }
            ).catch(() => null);
            if (hubRes && hubRes.ok) {
              const hubData = await hubRes.json().catch(() => null);
              if (hubData && Array.isArray(hubData.organizations)) {
                allowFallback = hubData.organizations.includes(fallbackOrg.slug);
                isAdminUser = hubData.role === 'admin';
              }
            }
          } catch {}
        }
      }

      if (allowFallback) {
        org = fallbackOrg;
        isOrgAdmin = isAdminUser;
        canWrite = true;
      } else {
        throw new Error('[OrgVault] Usuário não é membro desta organização.');
      }
    } else {
      throw new Error('[OrgVault] Usuário não é membro desta organização.');
    }
  }

  const hasBoost =
    typeof org.storage_boost_bytes === 'number' &&
    org.storage_boost_bytes > 0 &&
    (!org.storage_boost_until || new Date(org.storage_boost_until).getTime() > Date.now());

  const effectiveQuotaBytes = hasBoost
    ? org.storage_boost_bytes
    : Math.max(0, org.storage_quota_bytes || 50 * 1024 * 1024 * 1024);

  const usedBytes = org.storage_used_bytes || 0;
  const serverUrl = getEdgeStorageServerUrl();

  const vaultTicket = signEdgeTenantTicket({
    userId,
    role: isOrgAdmin ? 'admin' : 'member',
    purpose: 'vault',
    quotaLimitBytes: effectiveQuotaBytes,
    usedBytes,
    scopeType: 'org',
    organizationId: org.id,
    orgSlug: org.slug,
    readOnly: !canWrite,
    unlockedPins: options?.unlockedPins,
    ttlMs: VAULT_TICKET_TTL_MS,
  });

  return {
    organizationId: org.id,
    orgSlug: org.slug,
    orgName: org.name,
    canWriteOrgVault: canWrite,
    effectiveQuotaBytes,
    usedBytes,
    vaultTicket,
    serverUrl,
  };
}

export const VAULT_TICKET_TTL_MS = 15 * 60 * 1000;               // 15 min p/ escrita no cofre
export const MEDIA_READONLY_TICKET_TTL_MS = 2 * 60 * 60 * 1000;  // 2h p/ stream 206 e galerias públicas
export const DEFAULT_APPROVED_QUOTA_BYTES = 25 * 1024 * 1024 * 1024; // 25 GB padrão após aprovação

export function computeEffectiveQuotaBytes(profile: UserStorageProfile): {
  isApprovedForStorage: boolean;
  effectiveQuotaBytes: number;
  hasActiveEventBoost: boolean;
} {
  if (profile.storage_role === 'admin') {
    return {
      isApprovedForStorage: true,
      effectiveQuotaBytes: Math.max(profile.quota_limit_bytes, 500 * 1024 * 1024 * 1024),
      hasActiveEventBoost: false,
    };
  }

  if (profile.approval_status !== 'approved') {
    return {
      isApprovedForStorage: false,
      effectiveQuotaBytes: 0,
      hasActiveEventBoost: false,
    };
  }

  const hasValidTempBoost =
    typeof profile.temp_quota_bytes === 'number' &&
    profile.temp_quota_bytes > 0 &&
    (!profile.temp_quota_expires_at || new Date(profile.temp_quota_expires_at).getTime() > Date.now());

  return {
    isApprovedForStorage: true,
    effectiveQuotaBytes: hasValidTempBoost
      ? profile.temp_quota_bytes!
      : Math.max(0, profile.quota_limit_bytes || DEFAULT_APPROVED_QUOTA_BYTES),
    hasActiveEventBoost: hasValidTempBoost,
  };
}

export function getEdgeStorageServerUrl(): string {
  const url =
    process.env.STORAGE_SERVER_URL ||
    process.env.NEXT_PUBLIC_STORAGE_SERVER_URL ||
    DEFAULT_EDGE_STORAGE_URL;
  return url.replace(/\/+$/, '');
}

export function resolveEdgeHmacSecret(): string {
  const configured =
    process.env.EDGE_HMAC_SECRET ||
    process.env.STORAGE_API_KEY ||
    process.env.API_SECRET_KEY;

  if (configured && configured.trim().length >= 16) return configured.trim();

  // Permite fallback determinístico SOMENTE em desenvolvimento local (nunca em produção real na Vercel/Cloud)
  const isProd = process.env.NODE_ENV === 'production';
  const serverUrl = getEdgeStorageServerUrl();
  const isLocalServer = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(serverUrl);

  if (!isProd || isLocalServer) {
    return '9db10bd8c7ac36d7a9481c3f9fb00054e1f016bca2c3ebe9';
  }

  throw new Error(
    '[EdgeTicket - SEGURANÇA CRÍTICA] Chave EDGE_HMAC_SECRET não configurada em ambiente de produção. Bloqueando derivação previsível.'
  );
}

export interface SignEdgeTicketOptions {
  userId: string;
  role?: StorageRole;
  purpose?: TicketPurpose;
  quotaLimitBytes?: number;
  usedBytes?: number;
  scopeType?: 'user' | 'org';
  organizationId?: string;
  orgSlug?: string;
  allowedOrgSlugs?: string[];
  allowedPrefix?: string;
  /** Lista explícita de caminhos relativos permitidos quando purpose === 'public_media' */
  allowedPaths?: string[];
  readOnly?: boolean;
  allowDownload?: boolean;
  unlockedPins?: string[];
  ttlMs?: number;
}

export function signEdgeTenantTicket(options: SignEdgeTicketOptions): SignedEdgeTicket {
  const cleanUserId = String(options.userId || '').trim();
  if (!cleanUserId || !/^[a-zA-Z0-9_-]{3,80}$/.test(cleanUserId)) {
    throw new Error('[EdgeTicket] userId inválido.');
  }

  const purpose: TicketPurpose = options.purpose || 'vault';
  const normalizedAllowedPaths = Array.isArray(options.allowedPaths)
    ? options.allowedPaths
        .map((p) => String(p || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
        .filter(Boolean)
    : undefined;

  if (
    purpose === 'public_media' &&
    !options.allowedPrefix &&
    (!normalizedAllowedPaths || normalizedAllowedPaths.length === 0)
  ) {
    throw new Error('[EdgeTicket] Escopo public_media exige allowedPaths ou allowedPrefix explícito.');
  }

  const secret = resolveEdgeHmacSecret();
  const now = Date.now();
  const isReadOnly = Boolean(options.readOnly || purpose === 'public_media');
  const ttlMs =
    typeof options.ttlMs === 'number' && options.ttlMs > 0
      ? Math.min(options.ttlMs, 12 * 60 * 60 * 1000)
      : isReadOnly
        ? MEDIA_READONLY_TICKET_TTL_MS
        : VAULT_TICKET_TTL_MS;

  const role: StorageRole = options.role === 'admin' ? 'admin' : 'member';
  const quotaLimitBytes = Math.max(0, Math.floor(options.quotaLimitBytes ?? 0));
  const usedBytes = Math.max(0, Math.floor(options.usedBytes ?? 0));

  const payload: EdgeTenantTicketPayload = {
    userId: cleanUserId,
    role,
    purpose,
    quotaLimitBytes,
    usedBytes,
    ...(options.scopeType ? { scopeType: options.scopeType } : {}),
    ...(options.organizationId ? { organizationId: options.organizationId } : {}),
    ...(options.orgSlug || (options.organizationId && DEFAULT_ECOSYSTEM_ORGS_BY_ID[options.organizationId]?.slug)
      ? { orgSlug: options.orgSlug || DEFAULT_ECOSYSTEM_ORGS_BY_ID[options.organizationId!]?.slug }
      : {}),
    ...(options.allowedOrgSlugs?.length ? { allowedOrgSlugs: options.allowedOrgSlugs } : {}),
    ...(options.allowedPrefix ? { allowedPrefix: options.allowedPrefix } : {}),
    ...(normalizedAllowedPaths ? { allowedPaths: normalizedAllowedPaths } : {}),
    ...(isReadOnly ? { readOnly: true } : {}),
    ...(options.allowDownload !== undefined ? { allowDownload: options.allowDownload } : {}),
    ...(options.unlockedPins?.length ? { unlockedPins: options.unlockedPins } : {}),
    iat: now,
    exp: now + ttlMs,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('base64url');

  return {
    ticket: `${payloadB64}.${signature}`,
    expiresAt: payload.exp,
    serverUrl: getEdgeStorageServerUrl(),
    userId: cleanUserId,
    role,
    purpose,
    quotaLimitBytes,
    usedBytes,
  };
}

/**
 * [CORREÇÃO v4.1 #5]: Assina 1 ticket curto individual por arquivo (allowedPaths: [item.relative_path])
 * no SSR e injeta signedThumbUrl e signedStreamUrl diretamente em cada item, evitando URLs gigantes (HTTP 414)
 * mesmo em galerias com 2.369 fotos!
 */
export function attachSignedPublicMediaUrls<T extends Pick<UserFileIndexRow, 'user_id' | 'relative_path'>>(
  items: T[],
  options?: {
    allowDownload?: boolean;
    ttlMs?: number;
    omitFullUrls?: boolean;
    useSharedPrefix?: string;
  }
): Array<T & { signedThumbUrl: string; signedStreamUrl: string; itemTicket: string }> {
  const serverUrl = getEdgeStorageServerUrl();

  // Otimização: se useSharedPrefix for passado (ex: 'Portfolio'), assina 1 ticket único
  // para o lote todo, economizando CPU HMAC e payload
  let sharedTicket: string | null = null;
  if (options?.useSharedPrefix && items.length > 0) {
    const firstUserId = items[0].user_id;
    const sameUser = items.every((it) => it.user_id === firstUserId);
    if (sameUser) {
      const signed = signEdgeTenantTicket({
        userId: firstUserId,
        purpose: 'public_media',
        allowedPrefix: options.useSharedPrefix,
        readOnly: true,
        allowDownload: options?.allowDownload ?? false,
        ttlMs: options?.ttlMs ?? MEDIA_READONLY_TICKET_TTL_MS,
      });
      sharedTicket = signed.ticket;
    }
  }

  return items.map((item) => {
    const ticketToUse =
      sharedTicket ||
      signEdgeTenantTicket({
        userId: item.user_id,
        purpose: 'public_media',
        allowedPaths: [item.relative_path],
        readOnly: true,
        allowDownload: options?.allowDownload ?? false,
        ttlMs: options?.ttlMs ?? MEDIA_READONLY_TICKET_TTL_MS,
      }).ticket;

    return {
      ...item,
      itemTicket: ticketToUse,
      signedThumbUrl: options?.omitFullUrls
        ? ''
        : buildTenantThumbUrl(item.relative_path, ticketToUse, { serverUrl }),
      signedStreamUrl: options?.omitFullUrls
        ? ''
        : buildTenantStreamUrl(item.relative_path, ticketToUse, { serverUrl }),
    };
  });
}

function isRelativeEdgePath(urlOrPath?: string | null): urlOrPath is string {
  if (!urlOrPath || typeof urlOrPath !== 'string') return false;
  const trimmed = urlOrPath.trim();
  if (!trimmed) return false;
  return (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    !trimmed.startsWith('data:') &&
    !trimmed.startsWith('blob:')
  );
}

/**
 * Assina URLs de leitura pública (TTL 2h, purpose: 'share') para fotos de recortes de jornal
 * (`physicalPagePhotoUrl` e `originalPhotoUrl`) armazenadas no Edge Server.
 */
export function signPressClippingsMediaUrls<T extends Record<string, any> | null>(
  profile: T,
  ownerId: string
): T {
  if (!profile || !ownerId) return profile;
  const rawClippings = profile?.features_config?.press_clippings;
  if (!Array.isArray(rawClippings) || rawClippings.length === 0) return profile;

  const serverUrl = getEdgeStorageServerUrl();
  const signRelPath = (rawPath: string): string => {
    const cleanRelPath = rawPath.trim().replace(/^\/+/, '');
    const { ticket } = signEdgeTenantTicket({
      userId: ownerId,
      role: 'member',
      purpose: 'share',
      allowedPaths: [cleanRelPath],
      readOnly: true,
      allowDownload: false,
      ttlMs: MEDIA_READONLY_TICKET_TTL_MS,
    });
    return buildTenantStreamUrl(cleanRelPath, ticket, { serverUrl });
  };

  const signedClippings = rawClippings.map((item: Record<string, any>) => {
    const nextItem = { ...item };
    if (isRelativeEdgePath(item?.physicalPagePhotoUrl)) {
      nextItem.signedPhysicalPageUrl = signRelPath(item.physicalPagePhotoUrl);
    }
    if (isRelativeEdgePath(item?.originalPhotoUrl)) {
      nextItem.signedOriginalPhotoUrl = signRelPath(item.originalPhotoUrl);
    }
    return nextItem;
  });

  return {
    ...profile,
    features_config: {
      ...(profile.features_config || {}),
      press_clippings: signedClippings,
    },
  };
}

