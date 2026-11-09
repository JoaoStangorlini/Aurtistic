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
  ItemVisibility,
  ShareMode,
  SignedEdgeTicket,
  StorageGlobalSettings,
  TicketPurpose,
} from '@/types';
import {
  issueUserStorageSession,
  issueOrganizationVaultSession,
  computeEffectiveQuotaBytes,
  getEdgeStorageServerUrl,
  signEdgeTenantTicket,
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
      ...(mutation.item.exifData ? { exif_data: mutation.item.exifData } : (existing?.exif_data ? { exif_data: existing.exif_data } : {})),
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
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  if (typeof input.totalUsedBytes === 'number' && input.totalUsedBytes >= 0) {
    if (input.organizationId) {
      await supabase.rpc('recalc_org_vault_used_bytes', {
        p_org_id: input.organizationId,
      });
    } else {
      await supabase.rpc('sync_user_storage_used_bytes', {
        p_used_bytes: Math.floor(input.totalUsedBytes),
      });
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

  const ticket = signEdgeTenantTicket({
    userId: user.id,
    role: profile.storage_role,
    purpose,
    quotaLimitBytes: effectiveQuotaBytes,
    usedBytes: profile.used_bytes,
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
  if (input.pin && input.pin.trim() !== '') {
    const validPin = validateNumericPin(input.pin);
    if (!validPin.ok) return { ok: false, error: validPin.error };
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
    const { error } = await supabase
      .from('user_storage_profiles')
      .update({
        temp_quota_bytes: boostBytes,
        temp_quota_expires_at: expiresAt,
        temp_quota_reason: `Evento: ${input.eventName}`,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id);

    if (error) return { ok: false, error: error.message };
  }

  revalidatePath('/servidor');
  return { ok: true, expiresAt, boostBytes };
}

