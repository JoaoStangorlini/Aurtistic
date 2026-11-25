// Este programa é um software livre (Licença AGPLv3)
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface VaultMountTarget {
  davUri: string;
  mountLink?: string;
  host: string;
}

export function parseVaultMountScript(content: string): VaultMountTarget | null {
  const davMatch = content.match(/^\s*DAV_URI\s*=\s*["']([^"']+)["']/m);
  if (!davMatch) return null;
  const davUri = davMatch[1].trim();
  if (!/^davs?:\/\/.+/i.test(davUri)) return null;

  let host = '';
  try {
    const normalized = davUri.replace(/^davs:/i, 'https:').replace(/^dav:/i, 'http:');
    host = new URL(normalized).hostname;
  } catch {
    return null;
  }
  if (!host) return null;

  const linkMatch = content.match(/^\s*MOUNT_LINK\s*=\s*["']([^"']+)["']/m);
  const mountLink = linkMatch?.[1]?.trim() || undefined;
  return { davUri, mountLink, host };
}

export async function discoverLinuxVaultMountTargets(
  binDir = path.join(os.homedir(), '.local', 'bin')
): Promise<VaultMountTarget[]> {
  let entries: string[];
  try {
    entries = await fs.promises.readdir(binDir);
  } catch {
    return [];
  }

  const targets: VaultMountTarget[] = [];
  for (const name of entries.sort()) {
    if (!name.startsWith('abrir-cofre-') || !name.endsWith('.sh')) continue;
    const fullPath = path.join(binDir, name);
    try {
      const content = await fs.promises.readFile(fullPath, 'utf8');
      const parsed = parseVaultMountScript(content);
      if (parsed) targets.push(parsed);
    } catch {
      // ignora script ilegível
    }
  }
  return targets;
}

async function isGioMounted(davUri: string): Promise<boolean> {
  try {
    await execFileAsync('gio', ['info', davUri], { timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureGvfsSymlink(target: VaultMountTarget): Promise<void> {
  if (!target.mountLink || typeof process.getuid !== 'function') return;
  const gvfsBase = `/run/user/${process.getuid()}/gvfs`;
  let entries: string[];
  try {
    entries = await fs.promises.readdir(gvfsBase);
  } catch {
    return;
  }

  const match = entries.find((e) => e.startsWith('dav') && e.includes(`host=${target.host}`));
  if (!match) return;

  const gvfsPath = path.join(gvfsBase, match);
  try {
    const stat = await fs.promises.lstat(target.mountLink).catch(() => null);
    if (stat && !stat.isSymbolicLink()) return;
    if (stat?.isSymbolicLink()) {
      await fs.promises.unlink(target.mountLink);
    }
    await fs.promises.symlink(gvfsPath, target.mountLink);
  } catch {
    // ignora falha ao atualizar symlink
  }
}

export async function mountLinuxVaultsOnStartup(
  binDir = path.join(os.homedir(), '.local', 'bin')
): Promise<void> {
  if (process.platform !== 'linux') return;
  const targets = await discoverLinuxVaultMountTargets(binDir);
  if (targets.length === 0) return;

  for (const target of targets) {
    try {
      const mounted = await isGioMounted(target.davUri);
      if (!mounted) {
        await execFileAsync('gio', ['mount', target.davUri], { timeout: 15_000 });
      }
      await ensureGvfsSymlink(target);
    } catch {
      // servidor offline ou sem credencial salva: não bloqueia inicialização do app
    }
  }
}
