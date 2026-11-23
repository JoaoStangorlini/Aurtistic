// Este programa é um software livre (Licença AGPLv3)
import path from 'node:path';
import type { IpcMainEvent, IpcMainInvokeEvent } from 'electron';

export const PROD_APP_ORIGIN = 'https://aurtistic.vercel.app';
export const DEV_APP_ORIGINS = new Set(['http://localhost:3000', 'http://127.0.0.1:3000']);

export function isTrustedAppUrl(
  rawUrl: string | undefined | null,
  options?: { isPackaged?: boolean; allowDev?: boolean }
): boolean {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  const isPackaged = Boolean(options?.isPackaged);
  const allowDev = !isPackaged && Boolean(options?.allowDev);
  try {
    const u = new URL(rawUrl);
    if (u.origin === PROD_APP_ORIGIN) return true;
    if (allowDev && DEV_APP_ORIGINS.has(u.origin)) return true;
    return false;
  } catch {
    return false;
  }
}

export function isAllowedAppNavigationUrl(
  rawUrl: string,
  options?: { isPackaged?: boolean; allowDev?: boolean }
): boolean {
  if (isTrustedAppUrl(rawUrl, options)) return true;
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'https:') {
      const host = u.hostname.toLowerCase();
      // Preserva fluxos legítimos de login OAuth / Supabase / HUB SSO
      if (
        host.endsWith('.supabase.co') ||
        host === 'accounts.google.com' ||
        host === 'github.com' ||
        host === 'hub-lab-div.vercel.app' ||
        host === 'hublabdiv.com.br' ||
        host.endsWith('.hublabdiv.com.br') ||
        host === 'aurtistic.com.br' ||
        host === 'www.aurtistic.com.br'
      ) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function assertTrustedIpcSender(
  event: IpcMainInvokeEvent | IpcMainEvent,
  options?: { isPackaged?: boolean; allowDev?: boolean }
): string {
  const frameUrl = event.senderFrame?.url || '';
  if (!isTrustedAppUrl(frameUrl, options)) {
    throw new Error(`IPC bloqueado: origem não confiável (${frameUrl || 'desconhecida'}).`);
  }
  return frameUrl;
}

export function isAllowedLanUrl(rawUrl: string): boolean {
  const clean = String(rawUrl || '').trim();
  if (!clean) return false;
  try {
    const u = new URL(clean);
    if (u.protocol === 'https:') return true;
    if (u.protocol !== 'http:') return false;
    const host = u.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.endsWith('.local') ||
      host.startsWith('192.168.') ||
      host.startsWith('10.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    );
  } catch {
    return false;
  }
}

export function isSafeExternalUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') return isAllowedLanUrl(rawUrl);
    return false;
  } catch {
    return false;
  }
}

export function normalizeRelPath(rawPath: string): string {
  const raw = String(rawPath || '').replace(/\0/g, '').replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\/+|\/+$/g, '').trim();
  if (!raw) return '';
  const segs = raw.split('/');
  for (const s of segs) {
    if (!s || s === '.' || s === '..') {
      throw new Error(`Caminho relativo inválido (path traversal bloqueado): ${rawPath}`);
    }
  }
  return segs.join('/');
}

/**
 * Confinamento estrito de caminhos para IPC: impede leitura/escrita arbitrária
 * no filesystem vinda do renderer sem seleção via dialog nativo ou pasta de espelhamento autorizada.
 */
export class AuthorizedPathsRegistry {
  private readonly authorizedDirs = new Set<string>();
  private readonly authorizedFiles = new Set<string>();

  addAuthorizedDir(dirPath: string): void {
    if (dirPath) this.authorizedDirs.add(path.resolve(dirPath));
  }

  removeAuthorizedDir(dirPath: string): void {
    if (dirPath) this.authorizedDirs.delete(path.resolve(dirPath));
  }

  addAuthorizedFile(filePath: string): void {
    if (filePath) this.authorizedFiles.add(path.resolve(filePath));
  }

  isAuthorizedPath(targetPath: string): boolean {
    if (!targetPath || typeof targetPath !== 'string' || targetPath.includes('\0')) return false;
    const resolved = path.resolve(targetPath);
    if (this.authorizedFiles.has(resolved)) return true;
    for (const dir of this.authorizedDirs) {
      if (resolved === dir || resolved.startsWith(`${dir}${path.sep}`)) {
        return true;
      }
    }
    return false;
  }

  assertAuthorizedPath(targetPath: string, actionLabel = 'acesso'): string {
    if (!this.isAuthorizedPath(targetPath)) {
      throw new Error(`Confinamento IPC bloqueou ${actionLabel} em caminho não autorizado: ${targetPath}`);
    }
    return path.resolve(targetPath);
  }
}
