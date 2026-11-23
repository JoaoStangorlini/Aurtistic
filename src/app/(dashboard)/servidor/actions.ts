// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/app/(dashboard)/servidor/actions.ts
'use server';

import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import type {
  AdminStorageUserSummary,
  EdgeMutationResponse,
  EdgeVaultEntry,
  GalleryTimelineCursor,
  GalleryTimelineItem,
  ItemVisibility,
  ShareMode,
  SignedEdgeTicket,
  StorageGlobalSettings,
  TicketPurpose,
} from '@/types';
import { buildTenantStreamUrl, buildTenantThumbUrl } from '@/lib/edge-urls';
import {
  issueUserStorageSession,
  issueOrganizationVaultSession,
  computeEffectiveQuotaBytes,
  getEdgeStorageServerUrl,
  notifyEdgeWebdavCacheInvalidate,
  signEdgeTenantTicket,
  DEFAULT_ECOSYSTEM_ORGS_BY_ID,
  MEDIA_READONLY_TICKET_TTL_MS,
  VAULT_TICKET_TTL_MS,
} from '@/lib/edge-ticket';
import { hashShareOrFolderPin } from '@/lib/pin-scrypt';
import {
  isUuid,
  sanitizeRelativeTenantPath,
  validateNumericPin,
  validatePublicSlug,
} from '@/lib/validators';
import {
  createTenantFolderShortcutDirect,
  deleteTenantFolderShortcutDirect,
} from '@/lib/edge-client';

export interface EcosystemLinksPatch {
  addTaskIds?: string[];
  removeTaskIds?: string[];
  showInPortfolio?: boolean;
  showInCurriculum?: boolean;
  curriculumLabel?: string | null;
  album?: string;
  category?: string;
  title?: string | null;
  description?: string | null;
  tags?: string[];
  isFavorite?: boolean;
  visibility?: ItemVisibility;
  exifData?: Record<string, unknown>;
}

/**
 * Unificação Atômica de Mutação de Disco + Vínculos dos 4 Pilares
 * em UMA ÚNICA chamada (zero race condition na Aba 2 do TaskFilePickerModal e apenas 1 ciclo de revalidate).
 */
export async function syncUserFileIndexAction(input: {
  mutation: EdgeMutationResponse;
  ecosystemLinks?: EcosystemLinksPatch;
  organizationId?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sessão expirada.' };

  const { mutation, ecosystemLinks, organizationId } = input;
  const relRes = sanitizeRelativeTenantPath(mutation.item?.relativePath, { allowEmpty: false });
  if (!relRes.ok) return { ok: false, error: relRes.error };

  if (typeof mutation.total_used_bytes === 'number' && mutation.total_used_bytes >= 0) {
    if (organizationId) {
      await supabase.rpc('recalc_org_vault_used_bytes', {
        p_org_id: organizationId,
      });
    } else {
      await supabase.rpc('sync_user_storage_used_bytes', {
        p_used_bytes: Math.floor(mutation.total_used_bytes),
      });
    }
  }

  if (mutation.action === 'delete') {
    await supabase.rpc('delete_user_file_cascade', {
      p_target_path: relRes.data,
      p_organization_id: organizationId || null,
    });
    let delQuery = supabase
      .from('user_files_index')
      .delete()
      .or(`relative_path.eq.${relRes.data},relative_path.like.${relRes.data}/%`);
    if (organizationId) {
      delQuery = delQuery.eq('organization_id', organizationId);
    } else {
      delQuery = delQuery.eq('user_id', user.id).is('organization_id', null);
    }
    await delQuery;
  } else if (
    (mutation.action === 'rename' || mutation.action === 'move') &&
    mutation.old_relative_path
  ) {
    const oldRes = sanitizeRelativeTenantPath(mutation.old_relative_path, { allowEmpty: false });
    if (oldRes.ok) {
      const { data: affected } = await supabase.rpc('cascade_rename_user_files_index', {
        p_old_path: oldRes.data,
        p_new_path: relRes.data,
        p_new_filename: mutation.item.name,
        p_organization_id: organizationId || null,
      });
      if (!affected) {
        await supabase.from('user_files_index').upsert(
          {
            user_id: user.id,
            organization_id: organizationId || null,
            relative_path: relRes.data,
            filename: mutation.item.name,
            mime_type: mutation.item.mimeType || 'application/octet-stream',
            size_bytes: Math.max(0, Math.floor(mutation.item.sizeBytes || 0)),
            is_directory: Boolean(mutation.item.isDirectory),
            has_pin: Boolean(mutation.item.hasPin),
          },
          { onConflict: 'vault_scope_key,relative_path' }
        );
      }
    }
  } else {
    let query = supabase
      .from('user_files_index')
      .select('linked_task_ids, linked_task_id, visibility, show_in_portfolio, album, category, title, description, tags, is_favorite, exif_data')
      .eq('relative_path', relRes.data);

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    } else {
      query = query.eq('user_id', user.id).is('organization_id', null);
    }

    const { data: existing } = await query.maybeSingle();

    let mergedTaskIds: string[] = Array.isArray(existing?.linked_task_ids)
      ? [...existing.linked_task_ids]
      : existing?.linked_task_id
        ? [existing.linked_task_id]
        : [];

    if (ecosystemLinks?.addTaskIds) {
      for (const tid of ecosystemLinks.addTaskIds) {
        if (isUuid(tid) && !mergedTaskIds.includes(tid)) mergedTaskIds.push(tid);
      }
    }
    if (ecosystemLinks?.removeTaskIds) {
      const removeSet = new Set(ecosystemLinks.removeTaskIds);
      mergedTaskIds = mergedTaskIds.filter((tid) => !removeSet.has(tid));
    }

    const isPortfolioItem = !organizationId && relRes.data.startsWith('Portfolio/');
    const segments = relRes.data.split('/').filter(Boolean);
    const derivedAlbum = isPortfolioItem && segments.length > 2 ? segments[1] : (isPortfolioItem && segments.length === 2 ? 'Geral' : (existing?.album || 'Geral'));

    let mimeType = mutation.item.mimeType || 'application/octet-stream';
    if (mimeType === 'application/octet-stream') {
      const ext = relRes.data.split('.').pop()?.toLowerCase();
      if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'png') mimeType = 'image/png';
      else if (ext === 'webp') mimeType = 'image/webp';
      else if (ext === 'avif') mimeType = 'image/avif';
      else if (ext === 'md') mimeType = 'text/markdown';
    }

    const rowToUpsert: Record<string, unknown> = {
      user_id: user.id,
      organization_id: organizationId || null,
      relative_path: relRes.data,
      filename: mutation.item.name || relRes.data.split('/').filter(Boolean).pop() || 'arquivo',
      mime_type: mimeType,
      size_bytes: Math.max(0, Math.floor(mutation.item.sizeBytes || 0)),
      is_directory: Boolean(mutation.item.isDirectory),
      has_pin: Boolean(mutation.item.hasPin),
      linked_task_ids: mergedTaskIds,
      linked_task_id: mergedTaskIds[0] || null,
      show_in_portfolio: isPortfolioItem ? true : (existing?.show_in_portfolio ?? false),
      visibility: isPortfolioItem ? 'public' : (existing?.visibility ?? 'private'),
      album: existing?.album || derivedAlbum,
      category: existing?.category || (isPortfolioItem ? 'Fotografia' : 'Projeto'),
      tags: existing?.tags || [],
      is_favorite: existing?.is_favorite ?? false,
      ...(existing?.title ? { title: existing.title } : {}),
      ...(existing?.description ? { description: existing.description } : {}),
      exif_data: {
        ...(existing?.exif_data as Record<string, unknown> || {}),
        ...(mutation.item.exifData || {}),
        ...(ecosystemLinks?.exifData || {}),
      },
    };

    if (ecosystemLinks) {
      if (ecosystemLinks.showInPortfolio !== undefined) {
        rowToUpsert.show_in_portfolio = ecosystemLinks.showInPortfolio;
        if (
          ecosystemLinks.showInPortfolio &&
          !ecosystemLinks.visibility &&
          (!existing || existing.visibility === 'private')
        ) {
          rowToUpsert.visibility = 'public';
        }
      }
      if (ecosystemLinks.showInCurriculum !== undefined) {
        rowToUpsert.show_in_curriculum = ecosystemLinks.showInCurriculum;
      }
      if (ecosystemLinks.curriculumLabel !== undefined) {
        rowToUpsert.curriculum_label = ecosystemLinks.curriculumLabel;
      }
      if (ecosystemLinks.album !== undefined) rowToUpsert.album = ecosystemLinks.album;
      if (ecosystemLinks.category !== undefined) rowToUpsert.category = ecosystemLinks.category;
      if (ecosystemLinks.title !== undefined) rowToUpsert.title = ecosystemLinks.title;
      if (ecosystemLinks.description !== undefined) rowToUpsert.description = ecosystemLinks.description;
      if (ecosystemLinks.tags !== undefined) rowToUpsert.tags = ecosystemLinks.tags;
      if (ecosystemLinks.isFavorite !== undefined) rowToUpsert.is_favorite = ecosystemLinks.isFavorite;
      if (ecosystemLinks.visibility !== undefined) rowToUpsert.visibility = ecosystemLinks.visibility;
    }

    await supabase
      .from('user_files_index')
      .upsert(rowToUpsert, { onConflict: 'vault_scope_key,relative_path' });
  }

  revalidatePath('/servidor');
  revalidatePath('/portfolio');
  revalidatePath('/curriculo');
  revalidatePath('/resumo');
  revalidatePath('/');
  return { ok: true };
}

/**
 * Atualiza vínculos (Tarefas, Portfólio, Currículo, Álbum, Favorito, Visibilidade)
 * de um arquivo já indexado (ou o insere se ainda não tinha registro).
 */
export async function updateFileEcosystemLinksAction(input: {
  relativePath: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  patch: EcosystemLinksPatch;
  organizationId?: string | null;
}) {
  const cleanRel = sanitizeRelativeTenantPath(input.relativePath, { allowEmpty: false });
  if (!cleanRel.ok) return { ok: false, error: cleanRel.error };

  const fallbackName =
    input.filename || cleanRel.data.split('/').filter(Boolean).pop() || 'arquivo';

  return syncUserFileIndexAction({
    mutation: {
      success: true,
      action: 'upsert',
      item: {
        name: fallbackName,
        relativePath: cleanRel.data,
        isDirectory: false,
        sizeBytes: input.sizeBytes ?? 0,
        mimeType: input.mimeType || 'application/octet-stream',
        kind: 'other',
        modifiedAt: new Date().toISOString(),
      },
    },
    ecosystemLinks: input.patch,
    organizationId: input.organizationId || null,
  });
}

/**
 * [AUTO-HEAL DISCO ↔ SUPABASE]: Reconcilia silenciosamente arquivos que estão fisicamente
 * no disco do Firestick mas ainda não tinham linha em user_files_index,
 * preservando intactos quaisquer vínculos existentes (ignoreDuplicates: true).
 */
export async function reconcileFolderIndexAction(input: {
  missingEntries: EdgeVaultEntry[];
  totalUsedBytes?: number;
  organizationId?: string | null;
  hdConnected?: boolean;
  degraded?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  if (typeof input.totalUsedBytes === 'number' && input.totalUsedBytes >= 0 && !input.degraded) {
    if (input.organizationId) {
      if (input.hdConnected !== false) {
        await supabase.rpc('recalc_org_vault_used_bytes', {
          p_org_id: input.organizationId,
        });
      }
    } else if (input.hdConnected !== false) {
      const candidateUsed = Math.floor(input.totalUsedBytes);
      let allowPersonalSync = true;

      // Bloqueia sobrescrita anômala (ex: "827 Bytes") se o índice do usuário possuir volume real muito maior
      if (candidateUsed < 10240) {
        const { data: idxCheck } = await supabase
          .from('user_files_index')
          .select('size_bytes')
          .eq('user_id', user.id)
          .is('organization_id', null)
          .gt('size_bytes', 0)
          .limit(50);

        const sampleSum = (idxCheck || []).reduce(
          (acc, r) => acc + Math.max(0, Number(r.size_bytes) || 0),
          0
        );
        if (sampleSum > 65536 && candidateUsed < sampleSum * 0.25) {
          allowPersonalSync = false;
        }
      }

      if (allowPersonalSync) {
        await supabase.rpc('sync_user_storage_used_bytes', {
          p_used_bytes: candidateUsed,
        });
      }
    }
  }

  if (Array.isArray(input.missingEntries) && input.missingEntries.length > 0) {
    const safeRows = input.missingEntries
      .map((entry) => {
        const check = sanitizeRelativeTenantPath(entry.relativePath, { allowEmpty: false });
        if (!check.ok) return null;
        return {
          user_id: user.id,
          organization_id: input.organizationId || null,
          relative_path: check.data,
          filename: entry.name,
          mime_type: entry.mimeType || 'application/octet-stream',
          size_bytes: Math.max(0, Math.floor(entry.sizeBytes || 0)),
          is_directory: Boolean(entry.isDirectory),
          has_pin: Boolean(entry.hasPin),
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (safeRows.length > 0) {
      await supabase
        .from('user_files_index')
        .upsert(safeRows, { onConflict: 'vault_scope_key,relative_path', ignoreDuplicates: true });
    }
  }

  return { ok: true };
}

/**
 * Governança Admin: Lista todos os usuários, status de aprovação e configurações globais.
 */
export async function adminListStorageUsersAction(): Promise<{
  ok: boolean;
  globalSettings?: StorageGlobalSettings;
  users?: AdminStorageUserSummary[];
  error?: string;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_list_storage_users');
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    globalSettings: data?.globalSettings as StorageGlobalSettings,
    users: (data?.users || []) as AdminStorageUserSummary[],
  };
}

/**
 * [CORREÇÃO v4.1 #3]: Governança Admin passando p_update_temp_boost explicitamente
 */
export async function adminUpdateGovernanceAction(input: {
  targetUserId?: string;
  approvalStatus?: 'pending' | 'approved' | 'suspended';
  quotaLimitGb?: number;
  updateTempBoost?: boolean;
  tempQuotaGb?: number | null;
  tempQuotaDays?: number | null;
  tempQuotaReason?: string | null;
  newGlobalDefaultGb?: number;
  requireAdminApproval?: boolean;
}) {
  const supabase = await createClient();
  const GB = 1024 * 1024 * 1024;

  const expiresAt =
    input.updateTempBoost && input.tempQuotaGb && input.tempQuotaDays && input.tempQuotaDays > 0
      ? new Date(Date.now() + input.tempQuotaDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { data, error } = await supabase.rpc('admin_update_user_storage_governance', {
    p_target_user_id: input.targetUserId || null,
    p_approval_status: input.approvalStatus || null,
    p_quota_limit_bytes:
      input.quotaLimitGb !== undefined ? Math.round(input.quotaLimitGb * GB) : null,
    p_update_temp_boost: Boolean(input.updateTempBoost),
    p_temp_quota_bytes:
      input.updateTempBoost && input.tempQuotaGb ? Math.round(input.tempQuotaGb * GB) : null,
    p_temp_quota_expires_at: expiresAt,
    p_temp_quota_reason: input.updateTempBoost ? input.tempQuotaReason ?? null : null,
    p_new_global_default_bytes:
      input.newGlobalDefaultGb !== undefined ? Math.round(input.newGlobalDefaultGb * GB) : null,
    p_require_admin_approval:
      input.requireAdminApproval !== undefined ? input.requireAdminApproval : null,
  });

  if (error) return { ok: false, error: error.message };
  if (input.targetUserId) {
    void notifyEdgeWebdavCacheInvalidate({
      userId: input.targetUserId,
      revokeAll: input.approvalStatus === 'suspended',
    });
  }
  revalidatePath('/servidor');
  return { ok: true, data };
}




/**
 * [CORREÇÃO v4.1 #4]: Sincroniza em lote (chunks de 500) as 2.369 fotos existentes do catalog.json
 * do Fire Stick para public.user_files_index na conta Admin (f2f1e6c9-a178-433f-9d87-37d6ce7ec94e)
 */
export async function syncLegacyPortfolioCatalogAction() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { profile } = await issueUserStorageSession(supabase, user.id);
  if (profile.storage_role !== 'admin') {
    return { ok: false, error: 'Apenas o administrador pode importar o acervo legado.' };
  }

  const adminTicket = signEdgeTenantTicket({
    userId: user.id,
    role: 'admin',
    purpose: 'vault',
    quotaLimitBytes: profile.quota_limit_bytes,
    usedBytes: profile.used_bytes,
    readOnly: true,
    ttlMs: VAULT_TICKET_TTL_MS,
  });

  const res = await fetch(`${getEdgeStorageServerUrl()}/api/tenant/legacy-catalog-export`, {
    headers: { 'x-tenant-ticket': adminTicket.ticket },
    cache: 'no-store',
  });
  if (!res.ok) {
    return { ok: false, error: `Falha ao ler catálogo do Fire Stick (${res.status}).` };
  }

  const payload = await res.json();
  const legacyItems: Array<{
    relativePath: string;
    filename: string;
    mimeType: string;
    sizeBytes: number;
    title: string;
    description: string;
    album: string;
    tags: string[];
    exifData: Record<string, unknown>;
    isFavorite: boolean;
    visibility: ItemVisibility;
    order: number;
  }> = Array.isArray(payload?.items) ? payload.items : [];

  const CHUNK_SIZE = 500;
  let importedCount = 0;

  for (let i = 0; i < legacyItems.length; i += CHUNK_SIZE) {
    const batch = legacyItems.slice(i, i + CHUNK_SIZE).map((it, idx) => ({
      user_id: user.id,
      relative_path: it.relativePath,
      filename: it.filename,
      mime_type: it.mimeType || 'image/jpeg',
      size_bytes: Math.max(0, Math.floor(it.sizeBytes || 0)),
      is_directory: false,
      show_in_portfolio: true,
      title: it.title || null,
      description: it.description || null,
      album: it.album || 'Geral',
      category: 'Fotografia',
      tags: Array.isArray(it.tags) ? it.tags : [],
      exif_data: it.exifData || {},
      is_favorite: Boolean(it.isFavorite),
      visibility: (
        it.visibility === 'private' || it.visibility === 'unlisted' ? it.visibility : 'public'
      ) as ItemVisibility,
      display_order: typeof it.order === 'number' ? it.order : i + idx,
    }));

    const { error } = await supabase
      .from('user_files_index')
      .upsert(batch, { onConflict: 'vault_scope_key,relative_path' });

    if (error) return { ok: false, error: error.message };
    importedCount += batch.length;
  }

  if (typeof payload?.totalUsedBytes === 'number' && payload.totalUsedBytes >= 0) {
    await supabase.rpc('sync_user_storage_used_bytes', {
      p_used_bytes: Math.floor(payload.totalUsedBytes),
    });
  }

  revalidatePath('/servidor');
  revalidatePath('/portfolio');
  revalidatePath('/resumo');
  return { ok: true, importedCount };
}

/**
 * [CORREÇÃO v4.1 #5]: Suporta readOnly explícito para emitir tickets de 2 horas (MEDIA_READONLY_TICKET_TTL_MS)
 * para o GlobalAudioDock mesmo no escopo 'vault'!
 */
export async function refreshTenantTicketAction(options: {
  purpose?: TicketPurpose;
  allowedPaths?: string[];
  unlockedPins?: string[];
  readOnly?: boolean;
}): Promise<
  | { ok: true; ticket: SignedEdgeTicket; isApprovedForStorage: boolean }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { profile } = await issueUserStorageSession(supabase, user.id, {
    unlockedPins: options.unlockedPins,
  });
  const { isApprovedForStorage, effectiveQuotaBytes } = computeEffectiveQuotaBytes(profile);
  const purpose = options.purpose || 'vault';
  const readOnly = Boolean(
    options.readOnly || purpose === 'public_media' || !isApprovedForStorage
  );

  const { data: memberOrgs } = await supabase
    .from('organization_members')
    .select('organization:organizations(slug)')
    .eq('user_id', user.id);

  const allowedOrgSlugs = Array.from(
    new Set(
      (memberOrgs || [])
        .map((row: any) => {
          const orgObj = Array.isArray(row.organization) ? row.organization[0] : row.organization;
          return String(orgObj?.slug || '').trim().toLowerCase();
        })
        .filter(Boolean)
    )
  );

  const ticket = signEdgeTenantTicket({
    userId: user.id,
    role: profile.storage_role,
    purpose,
    quotaLimitBytes: effectiveQuotaBytes,
    usedBytes: profile.used_bytes,
    allowedOrgSlugs,
    allowedPaths: options.allowedPaths,
    readOnly,
    unlockedPins: options.unlockedPins,
    ttlMs: readOnly ? MEDIA_READONLY_TICKET_TTL_MS : VAULT_TICKET_TTL_MS,
  });

  return { ok: true, ticket, isApprovedForStorage };
}

/**
 * Cria um link de compartilhamento e aprovação de clientes (/s/[token])
 */
export async function createShareLinkAction(input: {
  folderPath: string;
  albumTitle: string;
  mode?: ShareMode;
  pin?: string;
  allowDownload?: boolean;
  expiresInDays?: number | null;
  autoCreateTask?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const cleanFolder = sanitizeRelativeTenantPath(input.folderPath, { allowEmpty: false });
  if (!cleanFolder.ok) return { ok: false, error: cleanFolder.error };

  const cleanTitle = String(input.albumTitle || '').trim();
  if (!cleanTitle) return { ok: false, error: 'Informe um título para o álbum compartilhado.' };

  let pinHash: string | null = null;
  let plainPin: string | null = null;
  if (input.pin && input.pin.trim() !== '') {
    const validPin = validateNumericPin(input.pin);
    if (!validPin.ok) return { ok: false, error: validPin.error };
    plainPin = validPin.data;
    pinHash = hashShareOrFolderPin(validPin.data);
  }

  const token = crypto.randomBytes(12).toString('base64url');
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { data, error } = await supabase
    .from('share_links')
    .insert({
      user_id: user.id,
      token,
      folder_path: cleanFolder.data,
      album_title: cleanTitle,
      mode: input.mode || 'proofing',
      pin_hash: pinHash,
      allow_download: input.allowDownload ?? true,
      expires_at: expiresAt,
      auto_create_task: input.autoCreateTask ?? true,
    })
    .select('*')
    .single();

  if (error) return { ok: false, error: error.message };

  if (data?.id && plainPin) {
    const { error: pinPgErr } = await supabase.rpc('set_share_link_pin_pg_hash', {
      p_share_id: data.id,
      p_pin: plainPin,
    });
    if (pinPgErr && pinPgErr.code !== '42883') {
      console.warn('[createShareLinkAction] Aviso ao gravar pin_pg_hash:', pinPgErr.message);
    }
  }

  revalidatePath('/servidor');
  return { ok: true, shareLink: data };
}

export async function deleteShareLinkAction(shareId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };
  if (!isUuid(shareId)) return { ok: false, error: 'ID inválido.' };

  const { error } = await supabase
    .from('share_links')
    .delete()
    .eq('id', shareId)
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/servidor');
  return { ok: true };
}

/**
 * Propaga a exclusão ou renomeação de pastas para user_storage_profiles.pinned_folders
 * e share_links.folder_path em cascata.
 */
export async function cascadeFolderUpdateAction(input: {
  oldPath: string;
  newPath?: string;
  isDelete?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const oldP = input.oldPath.trim();
  if (!oldP) return { ok: false, error: 'Caminho inválido.' };

  const isDelete = Boolean(input.isDelete || !input.newPath);
  const newP = input.newPath ? input.newPath.trim() : '';

  try {
    // 1. Atualiza user_storage_profiles.pinned_folders
    const { data: profile } = await supabase
      .from('user_storage_profiles')
      .select('pinned_folders')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profile && Array.isArray(profile.pinned_folders)) {
      let updatedPins: string[] = [];
      if (isDelete) {
        updatedPins = profile.pinned_folders.filter(
          (p: string) => p !== oldP && !p.startsWith(`${oldP}/`)
        );
      } else {
        updatedPins = profile.pinned_folders.map((p: string) => {
          if (p === oldP) return newP;
          if (p.startsWith(`${oldP}/`)) return `${newP}/${p.slice(oldP.length + 1)}`;
          return p;
        });
      }

      await supabase
        .from('user_storage_profiles')
        .update({ pinned_folders: updatedPins })
        .eq('user_id', user.id);
    }

    // 2. Atualiza share_links (usando nome real da coluna folder_path)
    if (isDelete) {
      await supabase
        .from('share_links')
        .delete()
        .eq('user_id', user.id)
        .or(`folder_path.eq.${oldP},folder_path.ilike.${oldP}/%`);
    } else {
      const { data: links } = await supabase
        .from('share_links')
        .select('id, folder_path')
        .eq('user_id', user.id)
        .or(`folder_path.eq.${oldP},folder_path.ilike.${oldP}/%`);

      if (Array.isArray(links)) {
        for (const link of links) {
          let updatedPath = link.folder_path;
          if (link.folder_path === oldP) updatedPath = newP;
          else if (link.folder_path.startsWith(`${oldP}/`)) {
            updatedPath = `${newP}/${link.folder_path.slice(oldP.length + 1)}`;
          }
          await supabase
            .from('share_links')
            .update({ folder_path: updatedPath })
            .eq('id', link.id);
        }
      }
    }

    revalidatePath('/servidor');
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Falha na cascata.' };
  }
}

export async function updateStoragePublicSlugAction(rawSlug: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const check = validatePublicSlug(rawSlug);
  if (!check.ok) return { ok: false, error: check.error };

  const { error } = await supabase
    .from('user_storage_profiles')
    .update({ public_slug: check.data })
    .eq('user_id', user.id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/servidor');
  revalidatePath('/portfolio');
  revalidatePath('/resumo');
  return { ok: true, publicSlug: check.data };
}

/**
 * Emite ou renova sessão de acesso ao Org Vault (Cofre Compartilhado de Organização)
 */
export async function refreshOrganizationTicketAction(input: {
  organizationId: string;
  unlockedPins?: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID de organização inválido.' };

  try {
    const session = await issueOrganizationVaultSession(
      supabase,
      user.id,
      input.organizationId,
      { unlockedPins: input.unlockedPins }
    );
    return { ok: true, session };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : 'Falha ao emitir ticket de organização.' };
  }
}

/**
 * Solicitação de Boost de Quota para Cobertura de Evento (Pessoal ou Org)
 */
export async function requestEventQuotaBoostAction(input: {
  eventName: string;
  durationDays: number;
  boostGb: number;
  organizationId?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const days = Math.min(30, Math.max(1, Math.floor(input.durationDays || 7)));
  const boostBytes = Math.min(200, Math.max(10, Math.floor(input.boostGb || 50))) * 1024 * 1024 * 1024;
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  if (input.organizationId) {
    if (!isUuid(input.organizationId)) return { ok: false, error: 'ID de organização inválido.' };
    const { error } = await supabase
      .from('organizations')
      .update({
        storage_boost_bytes: boostBytes,
        storage_boost_until: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq('id', input.organizationId);

    if (error) return { ok: false, error: error.message };
  } else {
    // Para perfil pessoal, utiliza RPC SECURITY DEFINER com trava de governança e cooldown de 30 dias
    const { data: boostRes, error } = await supabase.rpc('request_personal_storage_boost', {
      p_reason: `Evento: ${input.eventName}`,
    });

    if (error) return { ok: false, error: error.message };
    if (boostRes && typeof boostRes === 'object' && 'expires_at' in boostRes) {
      revalidatePath('/servidor');
      return {
        ok: true,
        expiresAt: (boostRes as any).expires_at,
        boostBytes: (boostRes as any).boost_bytes || boostBytes,
      };
    }
  }

  revalidatePath('/servidor');
  return { ok: true, expiresAt, boostBytes };
}

export interface TagFolderDevicesInput {
  folderPath: string;
  deviceCategory: 'camera' | 'mobile' | 'drone' | 'other';
  deviceName: string;
  recursive?: boolean;
  organizationId?: string | null;
}

/**
 * Marca em massa o dispositivo (câmera ou celular) nas fotos de uma pasta/subpasta,
 * efetuando MERGE estrito no JSONB exif_data sem apagar campos EXIF originais.
 */
export async function tagFolderDevicesAction(input: TagFolderDevicesInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { folderPath, deviceCategory, deviceName, recursive = true, organizationId } = input;
  const cleanFolder = (folderPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  let query = supabase
    .from('user_files_index')
    .select('id, relative_path, exif_data')
    .eq('is_directory', false);

  if (organizationId) {
    query = query.eq('organization_id', organizationId);
  } else {
    query = query.eq('user_id', user.id).is('organization_id', null);
  }

  if (cleanFolder) {
    if (recursive) {
      query = query.or(`relative_path.eq.${cleanFolder},relative_path.ilike.${cleanFolder}/%`);
    } else {
      query = query.ilike('relative_path', `${cleanFolder}/%`);
    }
  }

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) {
    return { ok: false, error: fetchErr.message };
  }

  if (!rows || rows.length === 0) {
    return { ok: true, count: 0 };
  }

  const targetRows = recursive
    ? rows
    : rows.filter((r) => {
        const withoutPrefix = cleanFolder ? r.relative_path.slice(cleanFolder.length + 1) : r.relative_path;
        return !withoutPrefix.includes('/');
      });

  let updatedCount = 0;
  for (const row of targetRows) {
    const existingExif = (row.exif_data as Record<string, unknown>) || {};
    const mergedExif = {
      ...existingExif,
      deviceCategory,
      deviceName,
    };

    const { error: updErr } = await supabase
      .from('user_files_index')
      .update({ exif_data: mergedExif })
      .eq('id', row.id);

    if (!updErr) updatedCount++;
  }

  revalidatePath('/servidor');
  revalidatePath('/portfolio');
  return { ok: true, count: updatedCount };
}

export async function requestOrgVaultAccessAction(input: { organizationId: string }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data, error } = await supabase.rpc('request_org_vault_access', {
    p_org_id: input.organizationId,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/servidor');
  return { ok: true, data };
}

/**
 * Paginação por cursor (Keyset) para a Timeline Contínua Estilo Google Fotos.
 * Seleciona apenas colunas leves (sem exif_data completo) para manter payload rápido.
 */
export async function getGalleryTimelinePageAction(input?: {
  cursorCapturedAt?: string | null;
  cursorId?: string | null;
  filter?: 'all' | 'favorites' | 'camera' | 'mobile' | 'portfolio';
  limit?: number;
  organizationId?: string | null;
  album?: string | null;
}): Promise<{
  ok: boolean;
  items: GalleryTimelineItem[];
  nextCursor: GalleryTimelineCursor | null;
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, items: [], nextCursor: null, error: 'Não autenticado.' };

  const limit = Math.min(200, Math.max(24, input?.limit ?? 120));
  const filter = input?.filter || 'all';
  const orgId = input?.organizationId && isUuid(input.organizationId) ? input.organizationId : null;
  const targetAlbum = input?.album && input.album.trim() !== 'all' ? input.album.trim() : null;

  try {
    const runQuery = async (useFallbackExif = false) => {
      const selectFields = useFallbackExif
        ? 'id, relative_path, filename, mime_type, size_bytes, created_at, is_favorite, album, show_in_portfolio, exif_data'
        : 'id, relative_path, filename, mime_type, size_bytes, captured_at, created_at, is_favorite, album, device_source, show_in_portfolio';

      let query = supabase
        .from('user_files_index')
        .select(selectFields)
        .eq('is_directory', false)
        .or(
          'mime_type.ilike.image/%,mime_type.ilike.video/%,filename.ilike.%.jpg,filename.ilike.%.jpeg,filename.ilike.%.png,filename.ilike.%.webp,filename.ilike.%.gif,filename.ilike.%.avif,filename.ilike.%.heic,filename.ilike.%.mp4,filename.ilike.%.mov'
        );

      if (orgId) {
        query = query.eq('organization_id', orgId);
      } else {
        query = query.eq('user_id', user.id).is('organization_id', null);
      }

      if (targetAlbum) {
        query = query.or(`album.ilike."%${targetAlbum}%",relative_path.ilike."%${targetAlbum}%"`);
      }

      if (filter === 'favorites') query = query.eq('is_favorite', true);
      if (filter === 'portfolio') query = query.eq('show_in_portfolio', true);
      if (!useFallbackExif) {
        if (filter === 'mobile') query = query.ilike('device_source', '%mobile%');
        if (filter === 'camera') query = query.not('device_source', 'ilike', '%mobile%');
      }

      if (useFallbackExif) {
        query = query.order('created_at', { ascending: false }).order('id', { ascending: false });
        if (input?.cursorCapturedAt && input?.cursorId && isUuid(input.cursorId)) {
          query = query.or(
            `created_at.lt."${input.cursorCapturedAt}",and(created_at.eq."${input.cursorCapturedAt}",id.lt.${input.cursorId})`
          );
        }
      } else {
        query = query.order('captured_at', { ascending: false }).order('id', { ascending: false });
        if (input?.cursorCapturedAt && input?.cursorId && isUuid(input.cursorId)) {
          query = query.or(
            `captured_at.lt."${input.cursorCapturedAt}",and(captured_at.eq."${input.cursorCapturedAt}",id.lt.${input.cursorId})`
          );
        }
      }

      return await query.limit(limit + 1);
    };

    let result = await runQuery(false);
    if (result.error && (result.error.code === '42703' || result.error.message.includes('captured_at') || result.error.message.includes('device_source'))) {
      result = await runQuery(true);
    }

    if (result.error) {
      return { ok: false, items: [], nextCursor: null, error: result.error.message };
    }

    let rows = result.data || [];

    // Se estiver vazio na 1ª página sem filtro e sem orgId, tenta carregar o catálogo de portfólio prévio
    if (rows.length === 0 && !input?.cursorCapturedAt && !orgId && filter === 'all') {
      try {
        const { ensurePortfolioCatalogLoaded } = await import('@/lib/portfolio-catalog');
        await ensurePortfolioCatalogLoaded(supabase, user.id, { allowSeedFallback: true }).catch(() => []);
        const retryResult = await runQuery(false);
        if (!retryResult.error && retryResult.data && retryResult.data.length > 0) {
          rows = retryResult.data;
        } else {
          const retryFallback = await runQuery(true);
          if (!retryFallback.error && retryFallback.data) {
            rows = retryFallback.data;
          }
        }
      } catch {}
    }

    // Fallback Direto no Edge Server caso user_files_index continue vazio na 1ª página
    if (rows.length === 0 && !input?.cursorCapturedAt) {
      try {
        const serverUrl = getEdgeStorageServerUrl();
        const fallbackTicket = signEdgeTenantTicket({
          userId: user.id,
          role: orgId ? 'member' : 'admin',
          scopeType: orgId ? 'org' : 'user',
          organizationId: orgId || undefined,
          purpose: 'vault',
          readOnly: true,
          allowDownload: true,
          ttlMs: MEDIA_READONLY_TICKET_TTL_MS,
        });

        const edgeRes = await fetch(`${serverUrl}/api/tenant/list?folder=`, {
          headers: { 'x-tenant-ticket': fallbackTicket.ticket },
          next: { revalidate: 0 },
        }).catch(() => null);

        if (edgeRes && edgeRes.ok) {
          const edgeData = await edgeRes.json().catch(() => null);
          const rawFiles = Array.isArray(edgeData?.files) ? edgeData.files : [];
          let mediaFiles = rawFiles.filter(
            (f: any) =>
              !f.isDirectory &&
              (f.mimeType?.startsWith('image/') ||
                f.mimeType?.startsWith('video/') ||
                /\.(jpg|jpeg|png|webp|gif|avif|heic|mp4|mov)$/i.test(f.name || ''))
          );

          if (targetAlbum) {
            mediaFiles = mediaFiles.filter((f: any) => {
              const rel = (f.entryRelPath || f.path || f.name || '').toLowerCase();
              const alb = (f.album || '').toLowerCase();
              const term = targetAlbum.toLowerCase();
              return rel.includes(term) || alb.includes(term);
            });
          }

          if (mediaFiles.length > 0) {
            const edgeItems: GalleryTimelineItem[] = mediaFiles.map((f: any, idx: number) => {
              const relPath = f.entryRelPath || f.path || f.name;
              const signed = signEdgeTenantTicket({
                userId: user.id,
                role: 'member',
                purpose: 'vault',
                allowedPaths: [relPath],
                readOnly: true,
                allowDownload: true,
                ttlMs: MEDIA_READONLY_TICKET_TTL_MS,
              });

              return {
                id: `edge-${idx}-${Buffer.from(relPath).toString('base64url').slice(0, 16)}`,
                relative_path: relPath,
                filename: f.name || relPath.split('/').pop() || 'arquivo',
                mime_type: f.mimeType || 'image/jpeg',
                size_bytes: f.size || 0,
                captured_at: f.modifiedAt || new Date().toISOString(),
                is_favorite: false,
                album: '',
                device_source: 'edge',
                show_in_portfolio: false,
                signedThumbUrl: buildTenantThumbUrl(relPath, signed.ticket, { serverUrl }),
                signedStreamUrl: buildTenantStreamUrl(relPath, signed.ticket, { serverUrl }),
              };
            });

            return { ok: true, items: edgeItems, nextCursor: null };
          }
        }
      } catch {}
    }

    const hasMore = rows.length > limit;
    const pageRows = hasMore ? rows.slice(0, limit) : rows;
    const serverUrl = getEdgeStorageServerUrl();

    let resolvedOrgSlug: string | undefined;
    if (orgId) {
      const { data: orgRow } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', orgId)
        .maybeSingle();
      resolvedOrgSlug = orgRow?.slug || DEFAULT_ECOSYSTEM_ORGS_BY_ID[orgId]?.slug;
    }

    const items: GalleryTimelineItem[] = pageRows.map((row: any) => {
      const rowOrgId = row.organization_id || null;
      const isRowOrgScoped = Boolean(rowOrgId);
      const rowOrgSlug = rowOrgId
        ? (rowOrgId === orgId ? resolvedOrgSlug : DEFAULT_ECOSYSTEM_ORGS_BY_ID[rowOrgId]?.slug)
        : undefined;

      const signed = signEdgeTenantTicket({
        userId: isRowOrgScoped ? user.id : (row.user_id || user.id),
        role: 'member',
        purpose: 'vault',
        scopeType: isRowOrgScoped ? 'org' : 'user',
        organizationId: rowOrgId || undefined,
        orgSlug: rowOrgSlug,
        allowedPaths: [row.relative_path],
        readOnly: true,
        allowDownload: true,
        ttlMs: MEDIA_READONLY_TICKET_TTL_MS,
      });

      const derivedCapturedAt =
        row.captured_at ||
        row.exif_data?.DateTimeOriginal ||
        row.exif_data?.createDate ||
        row.created_at ||
        new Date().toISOString();

      const derivedDeviceSource =
        row.device_source ||
        (row.exif_data?.deviceCategory ? String(row.exif_data.deviceCategory) : null);

      return {
        id: row.id,
        relative_path: row.relative_path,
        filename: row.filename,
        mime_type: row.mime_type,
        size_bytes: row.size_bytes,
        captured_at: derivedCapturedAt,
        is_favorite: Boolean(row.is_favorite),
        album: row.album || '',
        device_source: derivedDeviceSource,
        show_in_portfolio: Boolean(row.show_in_portfolio),
        signedThumbUrl: buildTenantThumbUrl(row.relative_path, signed.ticket, { serverUrl }),
        signedStreamUrl: buildTenantStreamUrl(row.relative_path, signed.ticket, { serverUrl }),
      };
    });

    const last = items[items.length - 1];
    const nextCursor: GalleryTimelineCursor | null =
      hasMore && last
        ? { capturedAt: last.captured_at, id: last.id }
        : null;

    return { ok: true, items, nextCursor };
  } catch (err: unknown) {
    return {
      ok: false,
      items: [],
      nextCursor: null,
      error: err instanceof Error ? err.message : 'Erro ao carregar timeline.',
    };
  }
}

export async function getGalleryAlbumsAction(input?: {
  organizationId?: string | null;
}): Promise<{
  ok: boolean;
  albums: { name: string; count: number }[];
  error?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, albums: [], error: 'Não autenticado.' };

  const orgId = input?.organizationId && isUuid(input.organizationId) ? input.organizationId : null;

  try {
    let query = supabase
      .from('user_files_index')
      .select('album, relative_path')
      .eq('is_directory', false)
      .or(
        'mime_type.ilike.image/%,mime_type.ilike.video/%,filename.ilike.%.jpg,filename.ilike.%.jpeg,filename.ilike.%.png,filename.ilike.%.webp,filename.ilike.%.gif,filename.ilike.%.avif,filename.ilike.%.heic,filename.ilike.%.mp4,filename.ilike.%.mov'
      );

    if (orgId) {
      query = query.eq('organization_id', orgId);
    } else {
      query = query.eq('user_id', user.id).is('organization_id', null);
    }

    const { data, error } = await query;
    if (error) {
      return { ok: false, albums: [], error: error.message };
    }

    const counts = new Map<string, number>();

    for (const row of data || []) {
      let albumName = row.album?.trim();
      if (!albumName) {
        const parts = (row.relative_path || '').split('/');
        if (parts.length > 1) {
          albumName = parts[parts.length - 2];
        }
      }
      if (!albumName || albumName === '.' || albumName === '/') {
        albumName = 'Geral';
      }
      counts.set(albumName, (counts.get(albumName) || 0) + 1);
    }

    // Se a contagem no banco for vazia, tenta descobrir pastas de álbuns pelo Edge Server
    if (counts.size === 0) {
      try {
        const serverUrl = getEdgeStorageServerUrl();
        const fallbackTicket = signEdgeTenantTicket({
          userId: user.id,
          role: orgId ? 'member' : 'admin',
          scopeType: orgId ? 'org' : 'user',
          organizationId: orgId || undefined,
          purpose: 'vault',
          readOnly: true,
          allowDownload: true,
          ttlMs: MEDIA_READONLY_TICKET_TTL_MS,
        });

        const edgeRes = await fetch(`${serverUrl}/api/tenant/list?folder=`, {
          headers: { 'x-tenant-ticket': fallbackTicket.ticket },
          next: { revalidate: 0 },
        }).catch(() => null);

        if (edgeRes && edgeRes.ok) {
          const edgeData = await edgeRes.json().catch(() => null);
          const rawFolders = Array.isArray(edgeData?.folders) ? edgeData.folders : [];
          for (const f of rawFolders) {
            if (f.name && !f.name.startsWith('.')) {
              counts.set(f.name, f.itemCount || 1);
            }
          }
        }
      } catch {}
    }

    const albums = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { ok: true, albums };
  } catch (err) {
    return {
      ok: false,
      albums: [],
      error: err instanceof Error ? err.message : 'Erro ao buscar álbuns.',
    };
  }
}

export async function getPhotoExifDetailAction(fileId: string): Promise<{
  ok: boolean;
  exifData?: Record<string, any> | null;
  error?: string;
}> {
  if (!isUuid(fileId)) return { ok: false, error: 'ID inválido.' };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const { data, error } = await supabase
    .from('user_files_index')
    .select('exif_data')
    .eq('id', fileId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  return { ok: true, exifData: (data?.exif_data as Record<string, any>) || null };
}

export async function checkBackupHashesAction(hashes: string[], organizationId?: string | null): Promise<{
  ok: boolean;
  knownHashes: string[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || hashes.length === 0) return { ok: false, knownHashes: [] };

  const clean = hashes.filter((h) => /^[a-f0-9]{64}$/i.test(h)).slice(0, 200);
  if (clean.length === 0) return { ok: true, knownHashes: [] };

  let origQuery = supabase.from('user_files_index').select('content_hash').in('content_hash', clean);
  let proxyQuery = supabase.from('user_files_index').select('compressed_proxy_hash').in('compressed_proxy_hash', clean);

  if (organizationId) {
    origQuery = origQuery.eq('organization_id', organizationId);
    proxyQuery = proxyQuery.eq('organization_id', organizationId);
  } else {
    origQuery = origQuery.eq('user_id', user.id).is('organization_id', null);
    proxyQuery = proxyQuery.eq('user_id', user.id).is('organization_id', null);
  }

  const [origRes, proxyRes] = await Promise.all([origQuery, proxyQuery]);

  const set = new Set<string>();
  for (const r of origRes.data || []) if (r.content_hash) set.add(r.content_hash);
  for (const r of proxyRes.data || []) if (r.compressed_proxy_hash) set.add(r.compressed_proxy_hash);
  return { ok: true, knownHashes: Array.from(set) };
}

export async function recordBackupProxyMetadataAction(input: {
  relativePath: string;
  contentHash: string;
  originalSizeBytes: number;
  compressedProxyHash?: string | null;
  isLocalCompressedProxy?: boolean;
  deviceSource?: string | null;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const relRes = sanitizeRelativeTenantPath(input.relativePath, { allowEmpty: false });
  if (!relRes.ok) return { ok: false, error: relRes.error };

  const { error } = await supabase
    .from('user_files_index')
    .update({
      content_hash: input.contentHash,
      original_size_bytes: input.originalSizeBytes,
      compressed_proxy_hash: input.compressedProxyHash || null,
      is_local_compressed_proxy: Boolean(input.isLocalCompressedProxy),
      device_source: input.deviceSource || null,
    })
    .eq('user_id', user.id)
    .eq('relative_path', relRes.data);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Persiste um atalho de pasta (Org <-> Pessoal ou Pessoal <-> Pessoal) em user_files_index (Supabase)
 */
export async function syncShortcutInSupabaseAction(input: {
  organizationId?: string | null;
  parentFolder: string;
  shortcutName: string;
  targetRelPath: string;
  targetOrgId?: string | null;
  targetOrgSlug?: string | null;
  ownerName?: string;
}): Promise<{ ok: boolean; relativePath?: string; ownerUserId?: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };
  if (input.organizationId && !isUuid(input.organizationId)) {
    return { ok: false, error: 'ID de organização inválido.' };
  }
  if (input.targetOrgId && !isUuid(input.targetOrgId)) {
    return { ok: false, error: 'ID da organização alvo inválido.' };
  }

  // Validação de permissão cross-scope no backend (Ponto 8)
  if (input.organizationId) {
    try {
      await issueOrganizationVaultSession(supabase, user.id, input.organizationId);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Sem permissão no cofre desta organização.' };
    }
  }
  if (input.targetOrgId) {
    try {
      await issueOrganizationVaultSession(supabase, user.id, input.targetOrgId);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Sem permissão para vincular pasta desta organização.' };
    }
  }

  const cleanParent = String(input.parentFolder || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const cleanName = String(input.shortcutName || '').replace(/[/\\]/g, '_').trim();
  const rawRelPath = cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
  const relRes = sanitizeRelativeTenantPath(rawRelPath, { allowEmpty: false });
  if (!relRes.ok) return { ok: false, error: relRes.error };

  const cleanTargetRel = String(input.targetRelPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const shortcutType = input.targetOrgId || input.targetOrgSlug ? 'org_folder' : 'personal_folder';

  const { error } = await supabase.from('user_files_index').upsert(
    {
      user_id: user.id,
      organization_id: input.organizationId || null,
      relative_path: relRes.data,
      filename: cleanName,
      mime_type: 'inode/directory+shortcut',
      size_bytes: 0,
      is_directory: true,
      has_pin: false,
      visibility: 'private',
      show_in_portfolio: false,
      album: 'Atalhos',
      category: 'Atalho',
      exif_data: {
        isShortcut: true,
        shortcutType,
        shortcutTarget: cleanTargetRel,
        shortcutOwner: input.ownerName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Membro',
        ownerUserId: user.id,
        targetOrgId: input.targetOrgId || null,
        targetOrgSlug: input.targetOrgSlug || null,
      },
    },
    { onConflict: 'vault_scope_key,relative_path' }
  );

  if (error) return { ok: false, error: error.message };
  revalidatePath('/servidor');
  return { ok: true, relativePath: relRes.data, ownerUserId: user.id };
}

/**
 * Fallback Cross-Scope (Ponto 9): Busca registros em user_files_index pertencentes ao destino de um atalho
 * quando o Edge Server está offline e o usuário abre um atalho de outro membro ou de uma organização.
 */
export async function getShortcutTargetFallbackEntriesAction(input: {
  containerOrgId?: string | null;
  targetOwnerId?: string | null;
  targetOrgId?: string | null;
  targetRelPath: string;
}): Promise<{ ok: boolean; entries: import('@/types').UserFileIndexRow[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, entries: [], error: 'Não autenticado.' };

  if (input.containerOrgId) {
    if (!isUuid(input.containerOrgId)) return { ok: false, entries: [], error: 'Org container inválida.' };
    try {
      await issueOrganizationVaultSession(supabase, user.id, input.containerOrgId);
    } catch {
      return { ok: false, entries: [], error: 'Sem acesso ao cofre desta organização.' };
    }
  }
  if (input.targetOrgId) {
    if (!isUuid(input.targetOrgId)) return { ok: false, entries: [], error: 'Org alvo inválida.' };
    try {
      await issueOrganizationVaultSession(supabase, user.id, input.targetOrgId);
    } catch {
      return { ok: false, entries: [], error: 'Sem acesso à organização alvo do atalho.' };
    }
  }

  const cleanRel = String(input.targetRelPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  let query = supabase.from('user_files_index').select('*').limit(300);

  if (input.targetOrgId) {
    query = query.eq('organization_id', input.targetOrgId);
    if (cleanRel) {
      query = query.ilike('relative_path', `${cleanRel}/%`);
    }
  } else {
    const ownerId = input.targetOwnerId && isUuid(input.targetOwnerId) ? input.targetOwnerId : user.id;
    query = query.eq('user_id', ownerId).is('organization_id', null);
    if (cleanRel) {
      if (cleanRel.toLowerCase().startsWith('portfolio')) {
        query = query.or(`relative_path.ilike.${cleanRel}/%,show_in_portfolio.eq.true`);
      } else {
        query = query.ilike('relative_path', `${cleanRel}/%`);
      }
    }
  }

  const { data, error } = await query;
  if (error) return { ok: false, entries: [], error: error.message };
  return { ok: true, entries: (data || []) as import('@/types').UserFileIndexRow[] };
}

/**
 * Remove o registro de atalho em user_files_index (Supabase)
 */
export async function removeShortcutFromSupabaseAction(input: {
  organizationId?: string | null;
  shortcutPath: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };

  const relRes = sanitizeRelativeTenantPath(input.shortcutPath, { allowEmpty: false });
  if (!relRes.ok) return { ok: false, error: relRes.error };

  let delQuery = supabase.from('user_files_index').delete().eq('relative_path', relRes.data);
  if (input.organizationId) {
    if (!isUuid(input.organizationId)) return { ok: false, error: 'ID de organização inválido.' };
    delQuery = delQuery.eq('organization_id', input.organizationId);
  } else {
    delQuery = delQuery.eq('user_id', user.id).is('organization_id', null);
  }

  const { error } = await delQuery;
  if (error) return { ok: false, error: error.message };
  revalidatePath('/servidor');
  return { ok: true };
}

/**
 * Cria um atalho no cofre de uma organização apontando para uma pasta pessoal do usuário
 */
export async function createOrgFolderShortcutAction(input: {
  organizationId: string;
  parentFolder: string;
  shortcutName: string;
  personalFolderRelPath: string;
}): Promise<{ ok: boolean; shortcut?: any; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID de organização inválido.' };

  const userProfile = await supabase.from('user_profiles').select('username').eq('id', user.id).maybeSingle();
  const ownerName = user.user_metadata?.full_name || userProfile.data?.username || user.email?.split('@')[0] || 'Membro';

  // Persiste no Supabase primeiro (garantia híbrida)
  await syncShortcutInSupabaseAction({
    organizationId: input.organizationId,
    parentFolder: input.parentFolder,
    shortcutName: input.shortcutName,
    targetRelPath: input.personalFolderRelPath,
    ownerName,
  });

  try {
    const session = await issueOrganizationVaultSession(supabase, user.id, input.organizationId);

    const res = await createTenantFolderShortcutDirect({
      serverUrl: session.serverUrl,
      ticket: session.vaultTicket.ticket,
      parentFolder: input.parentFolder,
      shortcutName: input.shortcutName,
      personalFolderRelPath: input.personalFolderRelPath,
      ownerName,
    });

    revalidatePath('/servidor');
    return { ok: true, shortcut: res.shortcut };
  } catch (err: unknown) {
    // Se edge server estiver offline, o registro no Supabase já garante funcionalidade no fallback
    revalidatePath('/servidor');
    return { ok: true, error: err instanceof Error ? err.message : undefined };
  }
}

/**
 * Remove um atalho de pasta pessoal do cofre de uma organização
 */
export async function deleteOrgFolderShortcutAction(input: {
  organizationId: string;
  shortcutPath: string;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Não autenticado.' };
  if (!isUuid(input.organizationId)) return { ok: false, error: 'ID de organização inválido.' };

  await removeShortcutFromSupabaseAction({
    organizationId: input.organizationId,
    shortcutPath: input.shortcutPath,
  });

  try {
    const session = await issueOrganizationVaultSession(supabase, user.id, input.organizationId);
    await deleteTenantFolderShortcutDirect({
      serverUrl: session.serverUrl,
      ticket: session.vaultTicket.ticket,
      shortcutPath: input.shortcutPath,
    });

    revalidatePath('/servidor');
    return { ok: true };
  } catch {
    revalidatePath('/servidor');
    return { ok: true };
  }
}
