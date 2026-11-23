// Este programa é um software livre (Licença AGPLv3)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeRelPath } from './security';
import type { DesktopCredentialStore } from './credentials';
import type { DesktopTransferEngine } from './transfer-engine';

export interface SyncFileEntry {
  relPath: string;
  sha256: string | null;
  mtimeMs: number;
  sizeBytes: number;
}

export interface SyncStateRecord {
  sha256: string | null;
  mtimeMs: number;
  sizeBytes: number;
  updatedAt: number;
}

export type SyncStateMap = Record<string, SyncStateRecord>;

export type SyncAction =
  | { type: 'upload'; relPath: string }
  | { type: 'download'; relPath: string }
  | { type: 'trash_remote'; relPath: string }
  | { type: 'trash_local'; relPath: string }
  | { type: 'conflict_preserve_both'; relPath: string; conflictLocalRelPath: string };

export interface MirrorFolderConfig {
  id: string;
  localDir: string;
  remoteFolder: string;
  scopeKey: string;
  remoteServerUrl: string;
  lanServerUrl?: string;
  status: 'idle' | 'syncing' | 'paused_missing_root' | 'pin_locked' | 'error';
  lastSyncAt?: number;
  lastError?: string;
}

const WINDOWS_RESERVED_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
]);

export function shouldIgnoreSyncFilename(name: string): boolean {
  if (!name) return true;
  if (name === '.trash' || name === '.git' || name === '.sync-state.json') return true;
  if (name.endsWith('.part') || name.endsWith('.tmp') || name.endsWith('.enc.tmp')) return true;
  if (name.startsWith('.aurt_')) return true;
  return false;
}

export function hasInvalidWindowsSegment(relPath: string): boolean {
  const segs = normalizeRelPath(relPath).split('/');
  for (const seg of segs) {
    if (/[<>:"/\\|?*\x00-\x1f]/.test(seg)) return true;
    if (seg.endsWith(' ') || seg.endsWith('.')) return true;
    const stem = seg.split('.')[0].toUpperCase();
    if (WINDOWS_RESERVED_NAMES.has(stem)) return true;
  }
  return false;
}

export function buildConflictFilename(relPath: string, deviceTag = 'desktop'): string {
  const clean = normalizeRelPath(relPath);
  const dir = path.posix.dirname(clean);
  const base = path.posix.basename(clean);
  const extIdx = base.lastIndexOf('.');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tagged =
    extIdx > 0
      ? `${base.slice(0, extIdx)} (conflito-${deviceTag}-${stamp})${base.slice(extIdx)}`
      : `${base} (conflito-${deviceTag}-${stamp})`;
  return dir && dir !== '.' ? `${dir}/${tagged}` : tagged;
}

async function withBusyRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'EBUSY' || code === 'EPERM' || code === 'EACCES') {
        await new Promise((r) => setTimeout(r, (i + 1) * 250));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export function planSyncActions(input: {
  localFiles: SyncFileEntry[];
  remoteFiles: SyncFileEntry[];
  previousState: SyncStateMap;
  suppressedRelPaths?: Set<string>;
  deviceTag?: string;
}): SyncAction[] {
  const localMap = new Map<string, SyncFileEntry>();
  for (const f of input.localFiles) {
    const clean = normalizeRelPath(f.relPath);
    if (clean && !shouldIgnoreSyncFilename(path.posix.basename(clean))) {
      localMap.set(clean, { ...f, relPath: clean });
    }
  }

  const remoteMap = new Map<string, SyncFileEntry>();
  const seenRemoteLower = new Set<string>();
  for (const f of input.remoteFiles) {
    const clean = normalizeRelPath(f.relPath);
    if (!clean || shouldIgnoreSyncFilename(path.posix.basename(clean))) continue;
    const low = clean.toLowerCase();
    if (seenRemoteLower.has(low)) continue; // Protege contra colisão case-insensitive no Windows
    seenRemoteLower.add(low);
    remoteMap.set(clean, { ...f, relPath: clean });
  }

  const allPaths = new Set<string>([
    ...localMap.keys(),
    ...remoteMap.keys(),
    ...Object.keys(input.previousState || {}),
  ]);

  const actions: SyncAction[] = [];
  for (const relPath of Array.from(allPaths).sort()) {
    if (input.suppressedRelPaths?.has(relPath)) continue;

    const local = localMap.get(relPath);
    const remote = remoteMap.get(relPath);
    const prev = input.previousState?.[relPath];

    if (local && remote) {
      if (local.sha256 && remote.sha256 && local.sha256 === remote.sha256) {
        continue;
      }
      if (!prev) {
        actions.push({
          type: 'conflict_preserve_both',
          relPath,
          conflictLocalRelPath: buildConflictFilename(relPath, input.deviceTag),
        });
        continue;
      }
      const localChanged = local.sha256 !== prev.sha256 || local.sizeBytes !== prev.sizeBytes;
      const remoteChanged = remote.sha256 !== prev.sha256 || remote.sizeBytes !== prev.sizeBytes;

      if (localChanged && !remoteChanged) {
        actions.push({ type: 'upload', relPath });
      } else if (!localChanged && remoteChanged) {
        actions.push({ type: 'download', relPath });
      } else if (localChanged && remoteChanged) {
        actions.push({
          type: 'conflict_preserve_both',
          relPath,
          conflictLocalRelPath: buildConflictFilename(relPath, input.deviceTag),
        });
      }
      continue;
    }

    if (local && !remote) {
      if (prev) {
        actions.push({ type: 'trash_local', relPath });
      } else {
        actions.push({ type: 'upload', relPath });
      }
      continue;
    }

    if (!local && remote) {
      if (prev) {
        actions.push({ type: 'trash_remote', relPath });
      } else {
        actions.push({ type: 'download', relPath });
      }
    }
  }

  return actions;
}

export async function computeLocalFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const rs = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    rs.on('data', (c) => hash.update(c));
    rs.on('end', () => resolve(hash.digest('hex')));
    rs.on('error', reject);
  });
}

export async function scanLocalMirrorFolder(rootDir: string): Promise<SyncFileEntry[]> {
  const rootStat = await fs.promises.lstat(rootDir).catch(() => null);
  if (!rootStat || rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    const err = new Error(`Pasta local de espelhamento indisponível ou desmontada: ${rootDir}`) as NodeJS.ErrnoException;
    err.code = 'ENOENT';
    throw err;
  }

  const results: SyncFileEntry[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const ent of entries) {
      if (shouldIgnoreSyncFilename(ent.name)) continue;
      const full = path.join(dir, ent.name);
      const st = await fs.promises.lstat(full).catch(() => null);
      if (!st || st.isSymbolicLink()) continue; // Nunca segue symlinks
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      if (st.isDirectory()) {
        await walk(full, rel);
      } else if (st.isFile()) {
        const sha256 = await withBusyRetry(() => computeLocalFileSha256(full));
        results.push({
          relPath: rel,
          sha256,
          mtimeMs: st.mtimeMs,
          sizeBytes: st.size,
        });
      }
    }
  }
  await walk(rootDir, '');
  return results;
}

export class SyncStateStore {
  private readonly statePath: string;
  private readonly suppressed = new Map<string, number>();

  constructor(mirrorStateDir: string) {
    this.statePath = path.join(mirrorStateDir, 'sync-state.json');
  }

  markSuppressed(relPath: string, ttlMs = 10_000): void {
    const clean = normalizeRelPath(relPath);
    if (clean) this.suppressed.set(clean, Date.now() + ttlMs);
  }

  getActiveSuppressedSet(now = Date.now()): Set<string> {
    const set = new Set<string>();
    for (const [k, exp] of this.suppressed.entries()) {
      if (exp > now) set.add(k);
      else this.suppressed.delete(k);
    }
    return set;
  }

  async load(): Promise<SyncStateMap> {
    try {
      const raw = await fs.promises.readFile(this.statePath, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  async save(state: SyncStateMap): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.statePath), { recursive: true });
    const tmp = `${this.statePath}.${process.pid}.${Date.now()}.${crypto.randomBytes(3).toString('hex')}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    await fs.promises.rename(tmp, this.statePath);
  }
}

export class SyncMirrorCoordinator {
  private readonly userDataDir: string;
  private readonly configPath: string;
  private readonly credentials: DesktopCredentialStore;
  private readonly transfers: DesktopTransferEngine;
  private readonly onFolderRegistered?: (dirPath: string) => void;
  private readonly onFolderRemoved?: (dirPath: string) => void;

  private folders: MirrorFolderConfig[] = [];
  private watchers = new Map<string, { close: () => Promise<void> | void }>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private periodicTimer: NodeJS.Timeout | null = null;
  private activeSyncs = new Map<string, Promise<{ ok: boolean; status: MirrorFolderConfig['status']; actionsCount: number; error?: string }>>();

  constructor(opts: {
    userDataDir: string;
    credentials: DesktopCredentialStore;
    transfers: DesktopTransferEngine;
    onFolderRegistered?: (dirPath: string) => void;
    onFolderRemoved?: (dirPath: string) => void;
  }) {
    this.userDataDir = opts.userDataDir;
    this.configPath = path.join(opts.userDataDir, 'mirror-folders.json');
    this.credentials = opts.credentials;
    this.transfers = opts.transfers;
    this.onFolderRegistered = opts.onFolderRegistered;
    this.onFolderRemoved = opts.onFolderRemoved;
  }

  async init(): Promise<void> {
    try {
      const raw = await fs.promises.readFile(this.configPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.folders = parsed;
      }
    } catch {
      this.folders = [];
    }
    for (const f of this.folders) {
      this.onFolderRegistered?.(f.localDir);
      this.startWatcherForFolder(f);
    }
    if (!this.periodicTimer) {
      this.periodicTimer = setInterval(() => {
        for (const f of this.folders) {
          if (f.status !== 'pin_locked') {
            void this.syncFolderOnce(f.id);
          }
        }
      }, 60_000);
      this.periodicTimer.unref?.();
    }
  }

  private async persistConfig(): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.configPath), { recursive: true });
    const tmp = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmp, JSON.stringify(this.folders, null, 2), { mode: 0o600 });
    await fs.promises.rename(tmp, this.configPath);
  }

  listFolders(): MirrorFolderConfig[] {
    return this.folders.map((f) => ({ ...f }));
  }

  async addFolder(input: {
    localDir: string;
    remoteFolder: string;
    scopeKey: string;
    remoteServerUrl: string;
    lanServerUrl?: string;
  }): Promise<MirrorFolderConfig> {
    const cleanRemote = normalizeRelPath(input.remoteFolder);
    const resolvedLocal = path.resolve(input.localDir);
    const cfg: MirrorFolderConfig = {
      id: `mir-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      localDir: resolvedLocal,
      remoteFolder: cleanRemote,
      scopeKey: input.scopeKey || 'personal',
      remoteServerUrl: input.remoteServerUrl,
      lanServerUrl: input.lanServerUrl,
      status: 'idle',
    };
    this.folders.push(cfg);
    await this.persistConfig();
    this.onFolderRegistered?.(resolvedLocal);
    this.startWatcherForFolder(cfg);
    void this.syncFolderOnce(cfg.id);
    return { ...cfg };
  }

  async removeFolder(id: string): Promise<boolean> {
    const idx = this.folders.findIndex((f) => f.id === id);
    if (idx === -1) return false;
    const [removed] = this.folders.splice(idx, 1);
    const w = this.watchers.get(id);
    if (w) {
      await Promise.resolve(w.close()).catch(() => {});
      this.watchers.delete(id);
    }
    this.onFolderRemoved?.(removed.localDir);
    await this.persistConfig();
    return true;
  }

  private startWatcherForFolder(cfg: MirrorFolderConfig): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const chokidar = require('chokidar') as {
        watch: (p: string, opts: unknown) => { on: (e: string, fn: (p: string) => void) => unknown; close: () => Promise<void> };
      };
      const w = chokidar.watch(cfg.localDir, {
        ignoreInitial: true,
        followSymlinks: false,
        ignored: (filePath: string) => shouldIgnoreSyncFilename(path.basename(filePath)),
        awaitWriteFinish: { stabilityThreshold: 800, pollInterval: 150 },
      });
      const trigger = () => {
        const existing = this.debounceTimers.get(cfg.id);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          this.debounceTimers.delete(cfg.id);
          void this.syncFolderOnce(cfg.id);
        }, 1500);
        this.debounceTimers.set(cfg.id, t);
      };
      w.on('add', trigger);
      w.on('change', trigger);
      w.on('unlink', trigger);
      this.watchers.set(cfg.id, w);
    } catch {
      // Caso chokidar não esteja instalado em ambiente mínimo de teste, reconciliação periódica/manual continua ativa
    }
  }

  async syncFolderOnce(id: string): Promise<{ ok: boolean; status: MirrorFolderConfig['status']; actionsCount: number; error?: string }> {
    const existing = this.activeSyncs.get(id);
    if (existing) return existing;

    const task = this._runSyncFolderOnce(id).finally(() => {
      this.activeSyncs.delete(id);
    });
    this.activeSyncs.set(id, task);
    return task;
  }

  private async _runSyncFolderOnce(id: string): Promise<{ ok: boolean; status: MirrorFolderConfig['status']; actionsCount: number; error?: string }> {
    const cfg = this.folders.find((f) => f.id === id);
    if (!cfg) return { ok: false, status: 'error', actionsCount: 0, error: 'Pasta não encontrada.' };

    cfg.status = 'syncing';
    cfg.lastError = undefined;
    try {
      // Verifica se raiz local existe/está montada antes de tocar no servidor (anti-apagamento ENOENT)
      let localFiles: SyncFileEntry[];
      try {
        localFiles = await scanLocalMirrorFolder(cfg.localDir);
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
          cfg.status = 'paused_missing_root';
          cfg.lastError = 'Pasta ou disco local desmontado/indisponível. Sincronização pausada com segurança.';
          await this.persistConfig();
          return { ok: false, status: cfg.status, actionsCount: 0, error: cfg.lastError };
        }
        throw err;
      }

      const authHeader = await this.credentials.getBasicAuthHeader(cfg.scopeKey);
      if (!authHeader) {
        throw new Error(`Credencial ausente para o escopo ${cfg.scopeKey}.`);
      }

      const baseUrl = await this.transfers.resolveActiveBaseUrl(cfg.remoteServerUrl, cfg.lanServerUrl);
      const manifestRes = await fetch(
        `${baseUrl}/api/tenant/manifest?folder=${encodeURIComponent(cfg.remoteFolder)}&includeHash=1`,
        { headers: { Authorization: authHeader } }
      );
      if (manifestRes.status === 401) {
        await this.credentials.clearCredential(cfg.scopeKey).catch(() => {});
        throw new Error('Credencial revogada ou expirada (401).');
      }
      if (manifestRes.status === 423) {
        cfg.status = 'pin_locked';
        cfg.lastError = 'Pasta protegida por PIN: abra no app para sincronizar.';
        await this.persistConfig();
        return { ok: false, status: 'pin_locked', actionsCount: 0, error: cfg.lastError };
      }
      if (!manifestRes.ok) {
        throw new Error(`Falha ao obter manifesto (${manifestRes.status}).`);
      }

      const manifest = (await manifestRes.json()) as {
        files?: Array<{ relPath: string; sizeBytes: number; mtimeMs?: number; sha256?: string | null }>;
      };
      const remoteFiles: SyncFileEntry[] = (manifest.files || []).map((f) => ({
        relPath: f.relPath,
        sizeBytes: f.sizeBytes,
        mtimeMs: f.mtimeMs || 0,
        sha256: f.sha256 || null,
      }));

      const stateStore = new SyncStateStore(path.join(this.userDataDir, 'sync-states', cfg.id));
      const previousState = await stateStore.load();
      const actions = planSyncActions({
        localFiles,
        remoteFiles,
        previousState,
        suppressedRelPaths: stateStore.getActiveSuppressedSet(),
      });

      const toRemoteTrash: string[] = [];
      for (const act of actions) {
        if (act.type === 'upload') {
          const localAbs = path.join(cfg.localDir, ...act.relPath.split('/'));
          const remoteRel = cfg.remoteFolder ? `${cfg.remoteFolder}/${act.relPath}` : act.relPath;
          await this.transfers.enqueueUpload({
            scopeKey: cfg.scopeKey,
            remoteServerUrl: cfg.remoteServerUrl,
            lanServerUrl: cfg.lanServerUrl,
            relativePath: remoteRel,
            localPath: localAbs,
            overwrite: true,
          });
        } else if (act.type === 'download') {
          if (process.platform === 'win32' && hasInvalidWindowsSegment(act.relPath)) continue;
          const localAbs = path.join(cfg.localDir, ...act.relPath.split('/'));
          const remoteRel = cfg.remoteFolder ? `${cfg.remoteFolder}/${act.relPath}` : act.relPath;
          stateStore.markSuppressed(act.relPath, 15_000);
          await this.transfers.enqueueDownload({
            scopeKey: cfg.scopeKey,
            remoteServerUrl: cfg.remoteServerUrl,
            lanServerUrl: cfg.lanServerUrl,
            relativePath: remoteRel,
            localPath: localAbs,
          });
        } else if (act.type === 'conflict_preserve_both') {
          const origAbs = path.join(cfg.localDir, ...act.relPath.split('/'));
          const confAbs = path.join(cfg.localDir, ...act.conflictLocalRelPath.split('/'));
          await withBusyRetry(() => fs.promises.rename(origAbs, confAbs));
          const remoteRel = cfg.remoteFolder ? `${cfg.remoteFolder}/${act.relPath}` : act.relPath;
          stateStore.markSuppressed(act.relPath, 15_000);
          await this.transfers.enqueueDownload({
            scopeKey: cfg.scopeKey,
            remoteServerUrl: cfg.remoteServerUrl,
            lanServerUrl: cfg.lanServerUrl,
            relativePath: remoteRel,
            localPath: origAbs,
          });
        } else if (act.type === 'trash_local') {
          const origAbs = path.join(cfg.localDir, ...act.relPath.split('/'));
          const trashAbs = path.join(cfg.localDir, '.trash', `${Date.now()}_${path.basename(origAbs)}`);
          await fs.promises.mkdir(path.dirname(trashAbs), { recursive: true });
          await withBusyRetry(() => fs.promises.rename(origAbs, trashAbs)).catch(() => {});
        } else if (act.type === 'trash_remote') {
          toRemoteTrash.push(act.relPath);
        }
      }

      if (toRemoteTrash.length > 0) {
        await fetch(`${baseUrl}/api/tenant/folder-sync/apply`, {
          method: 'POST',
          headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({ folder: cfg.remoteFolder, removePaths: toRemoteTrash }),
        }).catch(() => {});
      }

      // Atualiza sync-state apenas para entradas já idênticas entre local e remoto
      const remoteByRel = new Map(remoteFiles.map((f) => [f.relPath, f]));
      const nextState: SyncStateMap = { ...previousState };
      for (const loc of localFiles) {
        const rem = remoteByRel.get(loc.relPath);
        if (rem && loc.sha256 && rem.sha256 === loc.sha256) {
          nextState[loc.relPath] = {
            sha256: loc.sha256,
            mtimeMs: loc.mtimeMs,
            sizeBytes: loc.sizeBytes,
            updatedAt: Date.now(),
          };
        }
      }
      for (const rel of toRemoteTrash) delete nextState[rel];
      await stateStore.save(nextState);

      cfg.status = 'idle';
      cfg.lastSyncAt = Date.now();
      await this.persistConfig();
      return { ok: true, status: 'idle', actionsCount: actions.length };
    } catch (err: unknown) {
      cfg.status = 'error';
      cfg.lastError = err instanceof Error ? err.message : String(err);
      await this.persistConfig().catch(() => {});
      return { ok: false, status: 'error', actionsCount: 0, error: cfg.lastError };
    }
  }

  async stopAll(): Promise<void> {
    if (this.periodicTimer) {
      clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    for (const w of this.watchers.values()) {
      await Promise.resolve(w.close()).catch(() => {});
    }
    this.watchers.clear();
  }
}
