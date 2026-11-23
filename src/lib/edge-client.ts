// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/lib/edge-client.ts

import type {
  EdgeMutationResponse,
  EdgeTelemetrySnapshot,
  EdgeTrashItem,
  EdgeVaultEntry,
  UserFileIndexRow,
} from '@/types';
import { resolveClientEdgeServerUrl } from './edge-urls';

export interface TenantDirectoryListingResponse {
  currentFolder: string;
  breadcrumbs: Array<{ name: string; path: string }>;
  folders: EdgeVaultEntry[];
  files: EdgeVaultEntry[];
  isLocked: boolean;
  pinHint?: string;
  total_used_bytes?: number;
  hdConnected?: boolean;
  storageDir?: string;
}

/**
 * Lista uma pasta no servidor Fire Stick usando o Ticket HMAC do tenant
 * e detecta eventuais itens órfãos para reconciliação silenciosa (Auto-Heal).
 */
export async function fetchTenantDirectory(
  folderPath: string,
  ticket: string,
  options?: { serverUrl?: string; signal?: AbortSignal }
): Promise<TenantDirectoryListingResponse> {
  const base = resolveClientEdgeServerUrl(options?.serverUrl);
  const cleanFolder = String(folderPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams();
  if (cleanFolder) params.set('folder', cleanFolder);

  // Timeout defensivo de 8s para evitar bloqueio por Cloudflare 524
  let effectiveSignal = options?.signal;
  if (!effectiveSignal && typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    try {
      effectiveSignal = AbortSignal.timeout(8000);
    } catch {}
  }

  const res = await fetch(`${base}/api/tenant/list?${params.toString()}`, {
    method: 'GET',
    headers: {
      'x-tenant-ticket': ticket,
    },
    cache: 'no-store',
    signal: effectiveSignal,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(errBody?.error || `Erro ao listar diretório (${res.status}).`);
  }

  const raw = (await res.json()) as TenantDirectoryListingResponse;

  // Normalização defensiva 100% à prova de inconsistências de legado
  const folders = (raw.folders || []).map((f: EdgeVaultEntry & { path?: string }) => ({
    ...f,
    relativePath: f.relativePath || f.path || f.name,
    kind: (f.kind || 'folder') as EdgeVaultEntry['kind'],
    isDirectory: true,
  }));

  const files = (raw.files || []).map((f: EdgeVaultEntry & { path?: string }) => ({
    ...f,
    relativePath: f.relativePath || f.path || f.name,
    kind: (f.kind || 'other') as EdgeVaultEntry['kind'],
    isDirectory: false,
  }));

  return {
    ...raw,
    folders,
    files,
  };
}

/**
 * Identifica arquivos presentes no disco físico que ainda não constam no mapa de user_files_index
 * para disparar o Auto-Heal silencioso via reconcileFolderIndexAction.
 */
export function computeUnindexedDiskEntries(
  diskListing: TenantDirectoryListingResponse,
  indexedMap: Map<string, UserFileIndexRow>
): EdgeVaultEntry[] {
  const missing: EdgeVaultEntry[] = [];
  for (const f of diskListing.files || []) {
    if (!indexedMap.has(f.relativePath)) {
      missing.push(f);
    }
  }
  return missing;
}

export async function getTenantFolderManifestDirect(input: {
  folder: string;
  ticket: string;
  serverUrl?: string;
  includeHash?: boolean;
}): Promise<{
  folder: string;
  files: Array<{ relPath: string; sizeBytes: number; mtimeMs?: number; sha256?: string | null }>;
  lockedSubfolders?: string[];
}> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const qs = new URLSearchParams({ folder: input.folder });
  if (input.includeHash) qs.set('includeHash', '1');
  const res = await fetch(`${base}/api/tenant/manifest?${qs.toString()}`, {
    headers: { 'x-tenant-ticket': input.ticket },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404) {
    // Fallback automático quando o Edge Server ainda não foi reiniciado com /api/tenant/manifest
    const files: Array<{ relPath: string; sizeBytes: number; mtimeMs?: number; sha256?: string | null }> = [];
    const lockedSubfolders: string[] = [];
    const walkList = async (currentPath: string, prefix: string) => {
      const listQs = new URLSearchParams({ folder: currentPath });
      const lr = await fetch(`${base}/api/tenant/list?${listQs.toString()}`, {
        headers: { 'x-tenant-ticket': input.ticket },
        cache: 'no-store',
      });
      if (!lr.ok) return;
      const ld = await lr.json().catch(() => ({}));
      if (ld?.isLocked) {
        if (prefix) lockedSubfolders.push(prefix);
        return;
      }
      for (const f of ld?.files || []) {
        const inner = prefix ? `${prefix}/${f.name}` : f.name;
        files.push({
          relPath: inner,
          sizeBytes: Number(f.sizeBytes) || 0,
          mtimeMs: f.modifiedAt ? new Date(f.modifiedAt).getTime() : undefined,
          sha256: null,
        });
      }
      for (const sub of ld?.folders || []) {
        if (sub.isShortcut) continue;
        const nextPrefix = prefix ? `${prefix}/${sub.name}` : sub.name;
        if (sub.hasPin && !sub.isUnlocked) {
          lockedSubfolders.push(nextPrefix);
          continue;
        }
        await walkList(sub.relativePath, nextPrefix);
      }
    };
    await walkList(input.folder, '');
    return { folder: input.folder, files, lockedSubfolders };
  }
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Falha ao ler manifesto (${res.status}).`);
  }
  return data;
}

export async function applyTenantFolderSyncDirect(input: {
  folder: string;
  removePaths: string[];
  ticket: string;
  serverUrl?: string;
}): Promise<{ success: boolean; movedToTrash: string[]; total_used_bytes: number }> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/folder-sync/apply`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-ticket': input.ticket,
    },
    body: JSON.stringify({ folder: input.folder, removePaths: input.removePaths }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Falha ao aplicar sincronização (${res.status}).`);
  }
  return data;
}

export interface WebdavTokenSummary {
  tokenId: string;
  userId: string;
  scopeType: 'user' | 'org';
  organizationId: string | null;
  orgSlug: string | null;
  readOnly: boolean;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
}

export interface CreatedWebdavTokenResponse {
  success: boolean;
  tokenId: string;
  secret: string;
  tokenMeta: WebdavTokenSummary;
  webdavPath: string;
}

export async function listWebdavTokensDirect(input: {
  ticket: string;
  serverUrl?: string;
}): Promise<WebdavTokenSummary[]> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/webdav-tokens`, {
    headers: { 'x-tenant-ticket': input.ticket },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Falha ao listar credenciais WebDAV (${res.status}).`);
  }
  return Array.isArray(data.tokens) ? data.tokens : [];
}

export async function createWebdavTokenDirect(input: {
  ticket: string;
  serverUrl?: string;
  label: string;
  readOnly?: boolean;
  ttlDays?: 30 | 90 | null;
}): Promise<CreatedWebdavTokenResponse> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/webdav-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-ticket': input.ticket,
    },
    body: JSON.stringify({
      label: input.label,
      readOnly: Boolean(input.readOnly),
      ttlDays: input.ttlDays === undefined ? 90 : input.ttlDays,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Falha ao gerar credencial WebDAV (${res.status}).`);
  }
  return data as CreatedWebdavTokenResponse;
}

export async function revokeWebdavTokenDirect(input: {
  ticket: string;
  serverUrl?: string;
  tokenId: string;
}): Promise<void> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/webdav-tokens/${encodeURIComponent(input.tokenId)}`, {
    method: 'DELETE',
    headers: { 'x-tenant-ticket': input.ticket },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Falha ao revogar credencial (${res.status}).`);
  }
}

export async function uploadTenantFileDirect(input: {
  file: File;
  folderPath: string;
  ticket: string;
  serverUrl?: string;
  overwrite?: boolean;
  signal?: AbortSignal;
  onProgress?: (percent: number, loadedBytes?: number, totalBytes?: number) => void;
}): Promise<EdgeMutationResponse> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const formData = new FormData();
  formData.append('folderPath', input.folderPath);
  if (input.overwrite) {
    formData.append('overwrite', '1');
  }
  formData.append('file', input.file);

  if (input.onProgress && typeof window !== 'undefined' && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/api/tenant/upload`);
      xhr.setRequestHeader('x-tenant-ticket', input.ticket);

      if (input.signal) {
        if (input.signal.aborted) {
          xhr.abort();
          return reject(new Error('Upload cancelado.'));
        }
        input.signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('Upload cancelado pelo usuário.'));
        });
      }

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && input.onProgress) {
          const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
          input.onProgress(pct, evt.loaded, evt.total);
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && data?.success) {
            resolve(data as EdgeMutationResponse);
          } else {
            reject(new Error(data?.error || `Falha no upload (${xhr.status}).`));
          }
        } catch {
          reject(new Error(`Resposta inválida do servidor (${xhr.status}).`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('Erro de conexão durante o upload direto.'));
      };

      xhr.send(formData);
    });
  }

  const res = await fetch(`${base}/api/tenant/upload`, {
    method: 'POST',
    headers: {
      'x-tenant-ticket': input.ticket,
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Falha no upload (${res.status}).`);
  }
  return data as EdgeMutationResponse;
}

export async function saveTenantNoteDirect(input: {
  folderPath: string;
  filename: string;
  content: string;
  ticket: string;
  serverUrl?: string;
}): Promise<EdgeMutationResponse> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/note`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-ticket': input.ticket,
    },
    body: JSON.stringify({
      folderPath: input.folderPath,
      filename: input.filename,
      content: input.content,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Erro ao salvar nota (${res.status}).`);
  }
  return data as EdgeMutationResponse;
}

export async function readTenantNoteDirect(input: {
  relativePath: string;
  ticket: string;
  serverUrl?: string;
  signal?: AbortSignal;
}): Promise<{ content: string; relativePath: string; modifiedAt?: string }> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const params = new URLSearchParams({ path: input.relativePath });
  const res = await fetch(`${base}/api/tenant/note?${params.toString()}`, {
    method: 'GET',
    headers: {
      'x-tenant-ticket': input.ticket,
    },
    cache: 'no-store',
    signal: input.signal,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Erro ao ler nota (${res.status}).`);
  }
  return data;
}

export async function createTenantFolderDirect(input: {
  parentFolder: string;
  name: string;
  ticket: string;
  serverUrl?: string;
}): Promise<EdgeMutationResponse> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/folder`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-ticket': input.ticket,
    },
    body: JSON.stringify({
      parentFolder: input.parentFolder,
      name: input.name,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Erro ao criar pasta (${res.status}).`);
  }
  return data as EdgeMutationResponse;
}

export async function createTenantFolderShortcutDirect(input: {
  parentFolder: string;
  shortcutName: string;
  personalFolderRelPath: string;
  targetOrgSlug?: string;
  targetOrgId?: string;
  ownerName?: string;
  ticket: string;
  serverUrl?: string;
}): Promise<{ success: boolean; shortcut: EdgeVaultEntry }> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/shortcut`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-ticket': input.ticket,
    },
    body: JSON.stringify({
      parentFolder: input.parentFolder,
      name: input.shortcutName,
      personalFolderRelPath: input.personalFolderRelPath,
      targetOrgSlug: input.targetOrgSlug,
      targetOrgId: input.targetOrgId,
      ownerName: input.ownerName,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Erro ao criar atalho (${res.status}).`);
  }
  return data;
}

export async function deleteTenantFolderShortcutDirect(input: {
  shortcutPath: string;
  ticket: string;
  serverUrl?: string;
}): Promise<{ success: boolean; removed: boolean }> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/shortcut`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-ticket': input.ticket,
    },
    body: JSON.stringify({
      shortcutPath: input.shortcutPath,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Erro ao remover atalho (${res.status}).`);
  }
  return data;
}

export async function renameOrMoveTenantEntryDirect(input: {
  oldPath: string;
  newPath: string;
  ticket: string;
  serverUrl?: string;
}): Promise<EdgeMutationResponse> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/rename`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-ticket': input.ticket,
    },
    body: JSON.stringify({
      oldPath: input.oldPath,
      newPath: input.newPath,
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Erro ao renomear/mover (${res.status}).`);
  }
  return data as EdgeMutationResponse;
}

export async function deleteTenantEntryDirect(input: {
  relativePath: string;
  permanent?: boolean;
  ticket: string;
  serverUrl?: string;
}): Promise<EdgeMutationResponse> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const params = new URLSearchParams({ path: input.relativePath });
  if (input.permanent) params.set('permanent', '1');

  const res = await fetch(`${base}/api/tenant/entry?${params.toString()}`, {
    method: 'DELETE',
    headers: {
      'x-tenant-ticket': input.ticket,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Erro ao excluir (${res.status}).`);
  }
  return data as EdgeMutationResponse;
}

export async function fetchTenantTrashDirect(input: {
  ticket: string;
  serverUrl?: string;
}): Promise<{ items: EdgeTrashItem[]; total_used_bytes?: number }> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/trash`, {
    method: 'GET',
    headers: { 'x-tenant-ticket': input.ticket },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Erro ao consultar lixeira (${res.status}).`);
  }
  return data;
}

export async function restoreTenantTrashItemDirect(input: {
  trashId: string;
  ticket: string;
  serverUrl?: string;
}): Promise<EdgeMutationResponse> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/trash/restore`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-ticket': input.ticket,
    },
    body: JSON.stringify({ trashId: input.trashId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Erro ao restaurar item (${res.status}).`);
  }
  return data as EdgeMutationResponse;
}

export async function emptyTenantTrashDirect(input: {
  trashId?: string;
  ticket: string;
  serverUrl?: string;
}): Promise<{ success: boolean; freed_bytes: number; total_used_bytes: number }> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const params = new URLSearchParams();
  if (input.trashId) params.set('trashId', input.trashId);
  const res = await fetch(`${base}/api/tenant/trash?${params.toString()}`, {
    method: 'DELETE',
    headers: { 'x-tenant-ticket': input.ticket },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `Erro ao esvaziar lixeira (${res.status}).`);
  }
  return data;
}

export async function fetchEdgeTelemetryDirect(input: {
  ticket: string;
  serverUrl?: string;
}): Promise<EdgeTelemetrySnapshot> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const res = await fetch(`${base}/api/tenant/telemetry`, {
    method: 'GET',
    headers: { 'x-tenant-ticket': input.ticket },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Erro ao consultar telemetria (${res.status}).`);
  }
  return data as EdgeTelemetrySnapshot;
}

const DIRECT_UPLOAD_THRESHOLD_BYTES = 16 * 1024 * 1024; // 16 MB

function isLanServerUrl(baseUrl: string): boolean {
  const low = baseUrl.toLowerCase();
  return (
    low.startsWith('http://192.168.') ||
    low.startsWith('http://10.') ||
    low.startsWith('http://172.') ||
    low.includes('.local') ||
    low.startsWith('http://localhost') ||
    low.startsWith('http://127.0.0.1')
  );
}

export function selectAdaptiveChunkSize(baseUrl: string): number {
  if (isLanServerUrl(baseUrl)) {
    return 32 * 1024 * 1024; // 32 MB em LAN direta
  }
  if (typeof navigator !== 'undefined') {
    const conn = (navigator as unknown as { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
    if (conn?.saveData || conn?.effectiveType === '2g' || conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '3g') {
      return 8 * 1024 * 1024; // 8 MB em rede móvel/lenta
    }
  }
  return 16 * 1024 * 1024; // 16 MB padrão via HTTPS Cloudflare Tunnel
}

export async function computeBlobSha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function uploadTenantFileChunked(input: {
  file: File;
  folderPath: string;
  ticket: string;
  ensureFreshTicket?: (force?: boolean) => Promise<string>;
  serverUrl?: string;
  overwrite?: boolean;
  resumeUploadId?: string;
  signal?: AbortSignal;
  onSessionCreated?: (uploadId: string) => void;
  onPhaseChange?: (phase: 'uploading' | 'finalizing' | 'completed') => void;
  onProgress?: (percent: number, loadedBytes?: number, totalBytes?: number) => void;
}): Promise<EdgeMutationResponse> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  let currentTicket = input.ticket;
  const refreshTicketIfAvailable = async () => {
    if (input.ensureFreshTicket) {
      currentTicket = await input.ensureFreshTicket(false);
    }
    return currentTicket;
  };

  let uploadId = input.resumeUploadId || '';
  let chunkSize = selectAdaptiveChunkSize(base);
  let totalChunks = input.file.size === 0 ? 1 : Math.ceil(input.file.size / chunkSize);
  let uploadedSet = new Set<number>();

  if (uploadId) {
    try {
      const stRes = await fetch(`${base}/api/tenant/upload/chunked/${encodeURIComponent(uploadId)}/status`, {
        headers: { 'x-tenant-ticket': await refreshTicketIfAvailable() },
        signal: input.signal,
      });
      if (stRes.ok) {
        const stJson = await stRes.json();
        if (stJson.state === 'completed' && stJson.item) {
          input.onPhaseChange?.('completed');
          input.onProgress?.(100, input.file.size, input.file.size);
          return stJson as EdgeMutationResponse;
        }
        if (typeof stJson.chunkSize === 'number' && stJson.chunkSize > 0) {
          chunkSize = stJson.chunkSize;
          totalChunks = stJson.totalChunks || (input.file.size === 0 ? 1 : Math.ceil(input.file.size / chunkSize));
        }
        if (Array.isArray(stJson.uploadedChunks)) {
          uploadedSet = new Set<number>(stJson.uploadedChunks);
        }
      } else {
        uploadId = '';
      }
    } catch {
      uploadId = '';
    }
  }

  if (!uploadId) {
    const cleanFolder = String(input.folderPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    const relPath = cleanFolder ? `${cleanFolder}/${input.file.name}` : input.file.name;

    const initRes = await fetch(`${base}/api/tenant/upload/chunked/init`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-ticket': await refreshTicketIfAvailable(),
      },
      body: JSON.stringify({
        relPath,
        totalSize: input.file.size,
        chunkSize,
        overwrite: Boolean(input.overwrite),
      }),
      signal: input.signal,
    });
    const initJson = await initRes.json().catch(() => ({}));
    if (!initRes.ok || !initJson?.uploadId) {
      throw new Error(initJson?.error || `Falha ao iniciar upload em partes (${initRes.status}).`);
    }
    uploadId = String(initJson.uploadId);
    chunkSize = Number(initJson.chunkSize) || chunkSize;
    totalChunks = Number(initJson.totalChunks) || totalChunks;
    input.onSessionCreated?.(uploadId);
  }

  input.onPhaseChange?.('uploading');

  let sentBytes = 0;
  for (const idx of uploadedSet) {
    const start = idx * chunkSize;
    const end = Math.min(input.file.size, start + chunkSize);
    sentBytes += Math.max(0, end - start);
  }
  if (input.file.size > 0) {
    input.onProgress?.(Math.min(99, Math.round((sentBytes / input.file.size) * 100)), sentBytes, input.file.size);
  }

  for (let idx = 0; idx < totalChunks; idx++) {
    if (uploadedSet.has(idx)) continue;
    if (input.signal?.aborted) {
      throw new Error('Upload cancelado pelo usuário.');
    }

    const start = idx * chunkSize;
    const end = Math.min(input.file.size, start + chunkSize);
    const slice = input.file.slice(start, end);
    const chunkSha = await computeBlobSha256Hex(slice);

    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (input.signal?.aborted) throw new Error('Upload cancelado pelo usuário.');
      try {
        const putRes = await fetch(`${base}/api/tenant/upload/chunked/${encodeURIComponent(uploadId)}/${idx}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/octet-stream',
            'x-tenant-ticket': await refreshTicketIfAvailable(),
            'x-chunk-sha256': chunkSha,
          },
          body: slice,
          signal: input.signal,
        });
        const putJson = await putRes.json().catch(() => ({}));
        if (!putRes.ok) {
          const err = new Error(putJson?.error || `Falha no chunk ${idx} (${putRes.status}).`);
          if (putRes.status >= 400 && putRes.status < 500 && putRes.status !== 408 && putRes.status !== 429) {
            throw err;
          }
          throw err;
        }
        lastErr = null;
        break;
      } catch (err) {
        if (input.signal?.aborted) throw new Error('Upload cancelado pelo usuário.');
        lastErr = err instanceof Error ? err : new Error(String(err));
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, attempt * 1000));
        }
      }
    }
    if (lastErr) throw lastErr;

    sentBytes += slice.size;
    const pct = input.file.size === 0 ? 100 : Math.min(99, Math.round((sentBytes / input.file.size) * 100));
    input.onProgress?.(pct, sentBytes, input.file.size);
  }

  input.onPhaseChange?.('finalizing');
  input.onProgress?.(100, input.file.size, input.file.size);

  const compRes = await fetch(`${base}/api/tenant/upload/chunked/${encodeURIComponent(uploadId)}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-ticket': await refreshTicketIfAvailable(),
    },
    signal: input.signal,
  });
  const compJson = await compRes.json().catch(() => ({}));

  if (compRes.status === 200 && (compJson.state === 'completed' || compJson.success)) {
    input.onPhaseChange?.('completed');
    return compJson as EdgeMutationResponse;
  }

  if (compRes.status !== 202) {
    throw new Error(compJson?.error || `Falha ao finalizar upload (${compRes.status}).`);
  }

  const pollPath = compJson.pollUrl || `/api/tenant/upload/chunked/${encodeURIComponent(uploadId)}/status`;
  const pollUrl = pollPath.startsWith('http') ? pollPath : `${base}${pollPath}`;

  while (true) {
    if (input.signal?.aborted) {
      throw new Error('Upload cancelado durante a finalização.');
    }
    await new Promise((r) => setTimeout(r, 1200));
    const stRes = await fetch(pollUrl, {
      headers: { 'x-tenant-ticket': await refreshTicketIfAvailable() },
      signal: input.signal,
    });
    const stJson = await stRes.json().catch(() => ({}));
    if (stRes.ok && stJson.state === 'completed') {
      input.onPhaseChange?.('completed');
      return stJson as EdgeMutationResponse;
    }
    if (!stRes.ok || stJson.state === 'failed') {
      throw new Error(stJson?.error || `Falha ao criptografar/finalizar arquivo (${stRes.status}).`);
    }
  }
}

export async function uploadTenantFileSmart(input: {
  file: File;
  folderPath: string;
  ticket: string;
  ensureFreshTicket?: (force?: boolean) => Promise<string>;
  serverUrl?: string;
  overwrite?: boolean;
  resumeUploadId?: string;
  signal?: AbortSignal;
  onSessionCreated?: (uploadId: string) => void;
  onPhaseChange?: (phase: 'uploading' | 'finalizing' | 'completed') => void;
  onProgress?: (percent: number, loadedBytes?: number, totalBytes?: number) => void;
}): Promise<EdgeMutationResponse> {
  if (input.file.size <= DIRECT_UPLOAD_THRESHOLD_BYTES && !input.resumeUploadId) {
    input.onPhaseChange?.('uploading');
    const res = await uploadTenantFileDirect(input);
    input.onPhaseChange?.('completed');
    return res;
  }
  return uploadTenantFileChunked(input);
}

export async function downloadTenantFileResumable(input: {
  relativePath: string;
  ticket: string;
  ensureFreshTicket?: (force?: boolean) => Promise<string>;
  serverUrl?: string;
  signal?: AbortSignal;
  initialBytes?: number;
  initialParts?: Uint8Array[];
  initialEtag?: string | null;
  partSizeBytes?: number;
  writable?: FileSystemWritableFileStream;
  onReset?: () => void;
  onMeta?: (meta: { totalBytes: number; etag: string | null; expectedSha256: string | null }) => void;
  onProgress?: (percent: number, loadedBytes: number, totalBytes: number, chunk?: Uint8Array, etag?: string | null) => void;
}): Promise<{
  blob: Blob;
  totalBytes: number;
  etag: string | null;
  verifiedSha256: string | null;
}> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const cleanRel = String(input.relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  let currentTicket = input.ticket;
  const getFreshTicket = async () => {
    if (input.ensureFreshTicket) {
      currentTicket = await input.ensureFreshTicket(false);
    }
    return currentTicket;
  };

  const buildUrl = (t: string) =>
    `${base}/api/tenant/stream?path=${encodeURIComponent(cleanRel)}&download=1&ticket=${encodeURIComponent(t)}`;

  const headRes = await fetch(buildUrl(await getFreshTicket()), {
    method: 'HEAD',
    signal: input.signal,
  });
  if (!headRes.ok) {
    throw new Error(`Erro ao consultar metadados do arquivo (${headRes.status}).`);
  }

  const totalBytes = Number(headRes.headers.get('content-length') || 0);
  const headEtag = headRes.headers.get('etag');
  const expectedSha256 = headRes.headers.get('x-plaintext-sha256');
  input.onMeta?.({ totalBytes, etag: headEtag, expectedSha256 });

  if (totalBytes === 0) {
    const emptyBlob = new Blob([]);
    if (input.writable) {
      await input.writable.close();
    }
    if (expectedSha256) {
      const actualSha = await computeBlobSha256Hex(emptyBlob);
      if (actualSha !== expectedSha256.toLowerCase()) {
        throw new Error('Falha de integridade SHA-256 no download vazio.');
      }
    }
    input.onProgress?.(100, 0, 0, undefined, headEtag);
    return { blob: emptyBlob, totalBytes: 0, etag: headEtag, verifiedSha256: expectedSha256 };
  }

  const partSize = input.partSizeBytes || 8 * 1024 * 1024; // 8 MB por fatia Range
  let etag = headEtag;
  const etagMatchesInitial = Boolean(input.initialEtag && headEtag && input.initialEtag === headEtag);
  let loadedBytes = etagMatchesInitial ? (input.initialBytes || 0) : 0;
  if (!etagMatchesInitial && input.initialBytes) {
    input.onReset?.();
  }
  const parts: Uint8Array[] = loadedBytes > 0 && input.initialParts && !input.writable ? [...input.initialParts] : [];

  while (loadedBytes < totalBytes) {
    if (input.signal?.aborted) {
      throw new Error('Download pausado ou cancelado.');
    }
    const end = Math.min(totalBytes - 1, loadedBytes + partSize - 1);
    const headers: Record<string, string> = {
      Range: `bytes=${loadedBytes}-${end}`,
    };
    if (etag) {
      headers['If-Range'] = etag;
    }

    const res = await fetch(buildUrl(await getFreshTicket()), {
      method: 'GET',
      headers,
      signal: input.signal,
    });

    if (res.status === 200) {
      // Arquivo mudou no servidor (If-Range divergente) ou Range ignorado -> zera parciais e reinicia do byte 0
      parts.length = 0;
      loadedBytes = 0;
      input.onReset?.();
      etag = res.headers.get('etag') || etag;
      const fullBuf = new Uint8Array(await res.arrayBuffer());
      if (input.writable) {
        await input.writable.truncate(0);
        await input.writable.write(fullBuf);
      } else {
        parts.push(fullBuf);
      }
      loadedBytes = fullBuf.byteLength;
      input.onProgress?.(100, loadedBytes, totalBytes, input.writable ? undefined : fullBuf, etag);
      break;
    }

    if (res.status !== 206) {
      throw new Error(`Falha ao baixar parte do arquivo (HTTP ${res.status}).`);
    }

    etag = res.headers.get('etag') || etag;
    const chunk = new Uint8Array(await res.arrayBuffer());
    if (input.writable) {
      await input.writable.write(chunk);
    } else {
      parts.push(chunk);
    }
    loadedBytes += chunk.byteLength;
    const pct = Math.min(100, Math.round((loadedBytes / totalBytes) * 100));
    input.onProgress?.(pct, loadedBytes, totalBytes, input.writable ? undefined : chunk, etag);
  }

  if (input.writable) {
    await input.writable.close();
    return {
      blob: new Blob([]),
      totalBytes,
      etag,
      verifiedSha256: expectedSha256,
    };
  }

  const blob = new Blob(parts as BlobPart[]);
  // Evita OOM no WebView/navegador ao tentar converter arquivos > 128 MB em ArrayBuffer único
  if (expectedSha256 && blob.size <= 128 * 1024 * 1024) {
    const actualSha = await computeBlobSha256Hex(blob);
    if (actualSha !== expectedSha256.toLowerCase()) {
      throw new Error('Checksum SHA-256 do arquivo baixado não confere.');
    }
  }

  return {
    blob,
    totalBytes,
    etag,
    verifiedSha256: expectedSha256,
  };
}


