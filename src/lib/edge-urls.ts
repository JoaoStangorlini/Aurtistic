// Este programa é um software livre (Licença AGPLv3)
// ARQUIVO: src/lib/edge-urls.ts (Client-Safe — Sem import de Node.js crypto)

export const DEFAULT_EDGE_STORAGE_URL = 'https://storage.hublabdiv.com.br';

export function resolveClientEdgeServerUrl(explicitServerUrl?: string): string {
  const base =
    explicitServerUrl ||
    process.env.NEXT_PUBLIC_STORAGE_SERVER_URL ||
    DEFAULT_EDGE_STORAGE_URL;
  return base.replace(/\/+$/, '');
}

export function buildTenantStreamUrl(
  relativePath: string,
  ticket: string,
  options?: { serverUrl?: string; download?: boolean }
): string {
  const base = resolveClientEdgeServerUrl(options?.serverUrl);
  const cleanRel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams();
  params.set('path', cleanRel);
  params.set('ticket', ticket);
  if (options?.download) {
    params.set('download', '1');
  }
  return `${base}/api/tenant/stream?${params.toString()}`;
}

export function buildTenantThumbUrl(
  relativePath: string,
  ticket: string,
  options?: { serverUrl?: string; width?: number }
): string {
  const base = resolveClientEdgeServerUrl(options?.serverUrl);
  const cleanRel = String(relativePath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams();
  params.set('path', cleanRel);
  params.set('ticket', ticket);
  if (options?.width && options.width > 0) {
    params.set('w', String(Math.floor(options.width)));
  }
  return `${base}/api/tenant/thumb?${params.toString()}`;
}

export function buildTenantZipUrl(
  folderPath: string,
  ticket: string,
  options?: { serverUrl?: string; paths?: string[] }
): string {
  const base = resolveClientEdgeServerUrl(options?.serverUrl);
  const cleanFolder = String(folderPath || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const params = new URLSearchParams();
  params.set('folder', cleanFolder);
  params.set('ticket', ticket);
  if (options?.paths && options.paths.length > 0) {
    params.set('paths', JSON.stringify(options.paths));
  }
  return `${base}/api/tenant/zip?${params.toString()}`;
}

export function formatStorageBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const val = bytes / Math.pow(1024, idx);
  return `${val >= 10 || idx === 0 ? val.toFixed(idx === 0 ? 0 : 1) : val.toFixed(2)} ${units[idx]}`;
}

