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

export async function uploadTenantFileDirect(input: {
  file: File;
  folderPath: string;
  ticket: string;
  serverUrl?: string;
  onProgress?: (percent: number) => void;
}): Promise<EdgeMutationResponse> {
  const base = resolveClientEdgeServerUrl(input.serverUrl);
  const formData = new FormData();
  formData.append('folderPath', input.folderPath);
  formData.append('file', input.file);

  if (input.onProgress && typeof window !== 'undefined' && typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${base}/api/tenant/upload`);
      xhr.setRequestHeader('x-tenant-ticket', input.ticket);

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && input.onProgress) {
          const pct = Math.min(100, Math.round((evt.loaded / evt.total) * 100));
          input.onProgress(pct);
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

