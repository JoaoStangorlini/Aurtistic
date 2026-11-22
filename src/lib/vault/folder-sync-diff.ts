// Este programa é um software livre (Licença AGPLv3)

export interface LocalSyncFile {
  file: File;
  /** Caminho relativo dentro da pasta selecionada (sem o nome da pasta raiz) */
  relPath: string;
  size: number;
}

export interface RemoteManifestFile {
  relPath: string;
  sizeBytes: number;
  mtimeMs?: number;
  sha256?: string | null;
}

export interface RemoteFolderManifest {
  folder: string;
  files: RemoteManifestFile[];
  lockedSubfolders?: string[];
}

export interface FolderSyncDiffResult {
  added: LocalSyncFile[];
  modified: Array<{ local: LocalSyncFile; remote: RemoteManifestFile }>;
  removed: RemoteManifestFile[];
  tieCandidates: Array<{ local: LocalSyncFile; remote: RemoteManifestFile }>;
  newFolders: string[];
  unchangedCount: number;
  lockedSubfolders: string[];
  localRootName: string;
  rootNameMismatch: boolean;
  highRemovalWarning: boolean;
  peakAddedBytes: number;
  netDeltaBytes: number;
}

const IGNORED_NAMES = new Set([
  '.ds_store',
  'thumbs.db',
  'desktop.ini',
  '.sync-journal.json',
  'catalog.json',
  'sig_index.json',
]);

export function normalizeSyncRelPath(raw: string): string {
  return String(raw || '')
    .normalize('NFC')
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
}

export function isIgnoredSyncPath(relPath: string): boolean {
  const parts = relPath.split('/').filter(Boolean);
  if (parts.length === 0) return true;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === '.trash' || lower.startsWith('.tmp')) return true;
    if (IGNORED_NAMES.has(lower)) return true;
    if (lower.endsWith('.shortcut.json') || lower.endsWith('.shortcut')) return true;
  }
  return false;
}

export function isInsideLockedSubfolder(relPath: string, lockedSubfolders: string[]): boolean {
  if (!lockedSubfolders || lockedSubfolders.length === 0) return false;
  const norm = normalizeSyncRelPath(relPath);
  return lockedSubfolders.some((locked) => {
    const lNorm = normalizeSyncRelPath(locked);
    return lNorm && (norm === lNorm || norm.startsWith(`${lNorm}/`));
  });
}

export function extractLocalSyncFiles(fileList: FileList | File[]): {
  localRootName: string;
  files: LocalSyncFile[];
} {
  const arr = Array.from(fileList || []);
  let localRootName = '';
  const files: LocalSyncFile[] = [];

  for (const file of arr) {
    const rawRel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const norm = normalizeSyncRelPath(rawRel);
    const parts = norm.split('/').filter(Boolean);
    if (parts.length >= 2) {
      if (!localRootName) localRootName = parts[0];
      const innerRel = parts.slice(1).join('/');
      if (!isIgnoredSyncPath(innerRel)) {
        files.push({ file, relPath: innerRel, size: file.size });
      }
    } else if (parts.length === 1 && !isIgnoredSyncPath(parts[0])) {
      files.push({ file, relPath: parts[0], size: file.size });
    }
  }

  return { localRootName, files };
}

export function computeFolderSyncDiff(input: {
  localFiles: LocalSyncFile[];
  localRootName: string;
  targetFolderName: string;
  remoteManifest: RemoteFolderManifest;
}): FolderSyncDiffResult {
  const lockedSubfolders = (input.remoteManifest.lockedSubfolders || []).map(normalizeSyncRelPath).filter(Boolean);

  const localMap = new Map<string, LocalSyncFile>();
  for (const lf of input.localFiles) {
    const norm = normalizeSyncRelPath(lf.relPath);
    if (!norm || isIgnoredSyncPath(norm) || isInsideLockedSubfolder(norm, lockedSubfolders)) continue;
    localMap.set(norm, { ...lf, relPath: norm });
  }

  const remoteMap = new Map<string, RemoteManifestFile>();
  for (const rf of input.remoteManifest.files || []) {
    const norm = normalizeSyncRelPath(rf.relPath);
    if (!norm || isIgnoredSyncPath(norm) || isInsideLockedSubfolder(norm, lockedSubfolders)) continue;
    remoteMap.set(norm, { ...rf, relPath: norm });
  }

  const added: LocalSyncFile[] = [];
  const modified: Array<{ local: LocalSyncFile; remote: RemoteManifestFile }> = [];
  const removed: RemoteManifestFile[] = [];
  const tieCandidates: Array<{ local: LocalSyncFile; remote: RemoteManifestFile }> = [];
  const newFoldersSet = new Set<string>();
  const existingFoldersSet = new Set<string>();

  for (const rPath of remoteMap.keys()) {
    const parts = rPath.split('/');
    for (let i = 1; i < parts.length; i++) {
      existingFoldersSet.add(parts.slice(0, i).join('/'));
    }
  }

  let unchangedCount = 0;

  for (const [relPath, local] of localMap.entries()) {
    const parts = relPath.split('/');
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join('/');
      if (!existingFoldersSet.has(folder)) newFoldersSet.add(folder);
    }

    const remote = remoteMap.get(relPath);
    if (!remote) {
      added.push(local);
    } else if (remote.sizeBytes !== local.size) {
      modified.push({ local, remote });
    } else {
      tieCandidates.push({ local, remote });
      unchangedCount += 1;
    }
  }

  for (const [relPath, remote] of remoteMap.entries()) {
    if (!localMap.has(relPath)) {
      removed.push(remote);
    }
  }

  const normLocalRoot = normalizeSyncRelPath(input.localRootName).toLowerCase();
  const normTargetRoot = normalizeSyncRelPath(input.targetFolderName).toLowerCase();
  const rootNameMismatch = Boolean(normLocalRoot && normTargetRoot && normLocalRoot !== normTargetRoot);
  const remoteCount = remoteMap.size;
  const highRemovalWarning = rootNameMismatch && remoteCount > 0 && removed.length > remoteCount * 0.7;

  const peakAddedBytes =
    added.reduce((acc, f) => acc + f.size, 0) +
    modified.reduce((acc, m) => acc + m.local.size, 0);
  const removedBytes =
    removed.reduce((acc, f) => acc + (f.sizeBytes || 0), 0) +
    modified.reduce((acc, m) => acc + (m.remote.sizeBytes || 0), 0);

  return {
    added,
    modified,
    removed,
    tieCandidates,
    newFolders: Array.from(newFoldersSet).sort(),
    unchangedCount,
    lockedSubfolders,
    localRootName: input.localRootName,
    rootNameMismatch,
    highRemovalWarning,
    peakAddedBytes,
    netDeltaBytes: peakAddedBytes - removedBytes,
  };
}
