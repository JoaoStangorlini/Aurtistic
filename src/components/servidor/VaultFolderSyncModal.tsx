// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  computeFolderSyncDiff,
  type LocalSyncFile,
  type RemoteFolderManifest,
} from '@/lib/vault/folder-sync-diff';
import {
  applyTenantFolderSyncDirect,
  getTenantFolderManifestDirect,
  uploadTenantFileDirect,
} from '@/lib/edge-client';
import { syncUserFileIndexAction } from '@/app/(dashboard)/servidor/actions';

export interface AffectedShortcutInfo {
  id: string;
  relativePath: string;
  filename: string;
  shortcutTarget: string;
  organizationId: string | null;
  shortcutOwner?: string;
}

export interface VaultFolderSyncModalProps {
  isOpen: boolean;
  folderRelPath: string;
  folderName: string;
  localRootName: string;
  localFiles: LocalSyncFile[];
  remoteManifest: RemoteFolderManifest;
  affectedShortcuts: AffectedShortcutInfo[];
  ticket: string;
  ensureFreshTicket: () => Promise<string>;
  serverUrl?: string;
  organizationId?: string | null;
  quotaRemainingBytes: number;
  onClose: () => void;
  onCompleted: () => void;
  onQueueSyncUploads?: (
    uploadItems: Array<{ file: File; relativePath: string }>,
    removePaths: string[]
  ) => void;
}

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${bytes} B`;
  if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (abs < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function computeBrowserSha256(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const hashBuf = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function LocalThumb({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    const objUrl = URL.createObjectURL(file);
    setUrl(objUrl);
    return () => {
      URL.revokeObjectURL(objUrl);
    };
  }, [file, isImage]);

  if (!isImage || !url) {
    return (
      <div className="w-8 h-8 rounded-md bg-surface-hover flex items-center justify-center shrink-0">
        <span className="material-symbols-outlined text-[16px] text-fg-muted">description</span>
      </div>
    );
  }
  return <img src={url} alt={file.name} className="w-8 h-8 rounded-md object-cover shrink-0 border border-border-subtle" />;
}

export function VaultFolderSyncModal({
  isOpen,
  folderRelPath,
  folderName,
  localRootName,
  localFiles,
  remoteManifest: initialManifest,
  affectedShortcuts,
  ticket,
  ensureFreshTicket,
  serverUrl,
  organizationId = null,
  quotaRemainingBytes,
  onClose,
  onCompleted,
  onQueueSyncUploads,
}: VaultFolderSyncModalProps) {
  const [deepHashMode, setDeepHashMode] = useState(false);
  const [deepHashLoading, setDeepHashLoading] = useState(false);
  const [deepModifiedPaths, setDeepModifiedPaths] = useState<Set<string>>(new Set());
  const [remoteManifest, setRemoteManifest] = useState<RemoteFolderManifest>(initialManifest);

  const baseDiff = useMemo(
    () =>
      computeFolderSyncDiff({
        localFiles,
        localRootName,
        targetFolderName: folderName,
        remoteManifest,
      }),
    [localFiles, localRootName, folderName, remoteManifest]
  );

  const effectiveModified = useMemo(() => {
    if (!deepHashMode || deepModifiedPaths.size === 0) return baseDiff.modified;
    const extra = baseDiff.tieCandidates.filter((t) => deepModifiedPaths.has(t.local.relPath));
    return [...baseDiff.modified, ...extra];
  }, [baseDiff, deepHashMode, deepModifiedPaths]);

  const [selectedAdded, setSelectedAdded] = useState<Set<string>>(
    () => new Set(baseDiff.added.map((f) => f.relPath))
  );
  const [selectedModified, setSelectedModified] = useState<Set<string>>(
    () => new Set(baseDiff.modified.map((m) => m.local.relPath))
  );
  const [selectedRemoved, setSelectedRemoved] = useState<Set<string>>(() =>
    baseDiff.highRemovalWarning ? new Set() : new Set(baseDiff.removed.map((r) => r.relPath))
  );

  useEffect(() => {
    setSelectedAdded(new Set(baseDiff.added.map((f) => f.relPath)));
    setSelectedModified(new Set(effectiveModified.map((m) => m.local.relPath)));
    setSelectedRemoved(
      baseDiff.highRemovalWarning ? new Set() : new Set(baseDiff.removed.map((r) => r.relPath))
    );
  }, [baseDiff, effectiveModified]);

  const [applying, setApplying] = useState(false);
  const [progressText, setProgressText] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleToggleDeepHash = async (checked: boolean) => {
    setDeepHashMode(checked);
    if (!checked || baseDiff.tieCandidates.length === 0) {
      setDeepModifiedPaths(new Set());
      return;
    }
    setDeepHashLoading(true);
    setErrorMsg(null);
    try {
      const freshTicket = await ensureFreshTicket();
      const manifestWithHash = await getTenantFolderManifestDirect({
        folder: folderRelPath,
        ticket: freshTicket || ticket,
        serverUrl,
        includeHash: true,
      });
      setRemoteManifest(manifestWithHash);
      const remoteHashMap = new Map(
        manifestWithHash.files.map((f) => [f.relPath.normalize('NFC'), f.sha256 || null])
      );
      const changed = new Set<string>();
      for (let i = 0; i < baseDiff.tieCandidates.length; i++) {
        const { local } = baseDiff.tieCandidates[i];
        const rHash = remoteHashMap.get(local.relPath);
        if (rHash) {
          const lHash = await computeBrowserSha256(local.file);
          if (lHash !== rHash) changed.add(local.relPath);
        }
      }
      setDeepModifiedPaths(changed);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Falha na verificação profunda SHA-256.');
    } finally {
      setDeepHashLoading(false);
    }
  };

  if (!isOpen) return null;

  const addedSelectedList = baseDiff.added.filter((f) => selectedAdded.has(f.relPath));
  const modifiedSelectedList = effectiveModified.filter((m) => selectedModified.has(m.local.relPath));
  const removedSelectedList = baseDiff.removed.filter((r) => selectedRemoved.has(r.relPath));

  const peakUploadBytes =
    addedSelectedList.reduce((a, f) => a + f.size, 0) +
    modifiedSelectedList.reduce((a, m) => a + m.local.size, 0);
  const exceedsQuotaPeak = quotaRemainingBytes > 0 && peakUploadBytes > quotaRemainingBytes;

  const handleApply = async () => {
    if (onQueueSyncUploads) {
      const uploadItems = [
        ...addedSelectedList.map((f) => ({ file: f.file, relativePath: f.relPath })),
        ...modifiedSelectedList.map((m) => ({ file: m.local.file, relativePath: m.local.relPath })),
      ];
      const removePaths = removedSelectedList.map((r) => r.relPath);
      onQueueSyncUploads(uploadItems, removePaths);
      onClose();
      return;
    }
    setApplying(true);
    setErrorMsg(null);
    try {
      let activeTkt = await ensureFreshTicket();
      const uploads: Array<{ file: File; relPath: string; overwrite: boolean }> = [
        ...addedSelectedList.map((f) => ({ file: f.file, relPath: f.relPath, overwrite: false })),
        ...modifiedSelectedList.map((m) => ({ file: m.local.file, relPath: m.local.relPath, overwrite: true })),
      ];

      for (let i = 0; i < uploads.length; i++) {
        const u = uploads[i];
        setProgressText(`Enviando ${i + 1}/${uploads.length}: ${u.relPath}`);
        const innerDir = u.relPath.includes('/') ? u.relPath.slice(0, u.relPath.lastIndexOf('/')) : '';
        const targetFolder = innerDir ? `${folderRelPath}/${innerDir}` : folderRelPath;
        const mutation = await uploadTenantFileDirect({
          file: u.file,
          folderPath: targetFolder,
          ticket: activeTkt,
          serverUrl,
          overwrite: u.overwrite,
        });
        await syncUserFileIndexAction({
          mutation,
          organizationId,
        });
      }

      if (removedSelectedList.length > 0) {
        setProgressText(`Movendo ${removedSelectedList.length} arquivo(s) removido(s) para a Lixeira...`);
        activeTkt = await ensureFreshTicket();
        const removePaths = removedSelectedList.map((r) => r.relPath);
        await applyTenantFolderSyncDirect({
          folder: folderRelPath,
          removePaths,
          ticket: activeTkt,
          serverUrl,
        });
        for (const r of removedSelectedList) {
          const fullRel = `${folderRelPath}/${r.relPath}`;
          await syncUserFileIndexAction({
            mutation: {
              success: true,
              action: 'delete',
              item: {
                name: r.relPath.split('/').pop() || r.relPath,
                relativePath: fullRel,
                isDirectory: false,
                sizeBytes: r.sizeBytes,
                mimeType: 'application/octet-stream',
                kind: 'other',
                modifiedAt: new Date().toISOString(),
              },
            },
            organizationId,
          });
        }
      }

      setProgressText(null);
      onCompleted();
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro ao aplicar sincronização.');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-2xl bg-surface border border-border-subtle shadow-2xl overflow-hidden text-fg">
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-emerald-400">sync</span>
              Atualizar Pasta: {folderName}
            </h3>
            <p className="text-[11px] text-fg-muted mt-0.5">
              Pasta local: <span className="font-mono text-fg">{localRootName || folderName}</span>
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={applying} className="text-fg-muted hover:text-fg cursor-pointer">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {baseDiff.rootNameMismatch && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-300">
              <strong>Atenção:</strong> o nome da pasta local (<code>{localRootName}</code>) é diferente de{' '}
              <code>{folderName}</code>.
              {baseDiff.highRemovalWarning && (
                <span> Mais de 70% dos arquivos remotos seriam removidos; a seção &quot;Saem&quot; foi desmarcada por segurança.</span>
              )}
            </div>
          )}

          {baseDiff.lockedSubfolders.length > 0 && (
            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-200">
              Subpastas protegidas por PIN ignoradas: {baseDiff.lockedSubfolders.join(', ')}
            </div>
          )}

          {affectedShortcuts.length > 0 && (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px]">shortcut</span>
                Atalhos vinculados a esta pasta ({affectedShortcuts.length}):
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-0.5">
                {affectedShortcuts.map((sc) => (
                  <li key={sc.id}>
                    <span className="font-mono">{sc.relativePath}</span> ({sc.organizationId ? 'Organização' : 'Pessoal'} • {sc.shortcutOwner || 'Membro'})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-fg-secondary">
            <input
              type="checkbox"
              checked={deepHashMode}
              disabled={deepHashLoading || applying}
              onChange={(e) => void handleToggleDeepHash(e.target.checked)}
              className="rounded border-border-subtle"
            />
            <span>Verificação profunda (SHA-256) para arquivos com mesmo nome e tamanho</span>
            {deepHashLoading && <span className="text-amber-400 animate-pulse">Calculando...</span>}
          </label>

          {/* Entram */}
          {baseDiff.added.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-bold text-emerald-400">Entram ({selectedAdded.size}/{baseDiff.added.length})</div>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {baseDiff.added.slice(0, 80).map((f) => (
                  <label key={f.relPath} className="flex items-center gap-2.5 p-1.5 rounded-lg bg-app/50 border border-border-subtle/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedAdded.has(f.relPath)}
                      onChange={(e) => {
                        const next = new Set(selectedAdded);
                        if (e.target.checked) next.add(f.relPath);
                        else next.delete(f.relPath);
                        setSelectedAdded(next);
                      }}
                    />
                    <LocalThumb file={f.file} />
                    <span className="font-mono truncate flex-1">{f.relPath}</span>
                    <span className="text-fg-muted shrink-0">{formatBytes(f.size)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Substituídos */}
          {effectiveModified.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-bold text-amber-400">Substituídos ({selectedModified.size}/{effectiveModified.length})</div>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {effectiveModified.slice(0, 80).map((m) => (
                  <label key={m.local.relPath} className="flex items-center gap-2.5 p-1.5 rounded-lg bg-app/50 border border-border-subtle/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedModified.has(m.local.relPath)}
                      onChange={(e) => {
                        const next = new Set(selectedModified);
                        if (e.target.checked) next.add(m.local.relPath);
                        else next.delete(m.local.relPath);
                        setSelectedModified(next);
                      }}
                    />
                    <LocalThumb file={m.local.file} />
                    <span className="font-mono truncate flex-1">{m.local.relPath}</span>
                    <span className="text-fg-muted shrink-0">{formatBytes(m.local.size)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Saem */}
          {baseDiff.removed.length > 0 && (
            <div className="space-y-1.5">
              <div className="font-bold text-rose-400">Saem — Lixeira ({selectedRemoved.size}/{baseDiff.removed.length})</div>
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {baseDiff.removed.slice(0, 80).map((r) => (
                  <label key={r.relPath} className="flex items-center gap-2.5 p-1.5 rounded-lg bg-app/50 border border-border-subtle/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedRemoved.has(r.relPath)}
                      onChange={(e) => {
                        const next = new Set(selectedRemoved);
                        if (e.target.checked) next.add(r.relPath);
                        else next.delete(r.relPath);
                        setSelectedRemoved(next);
                      }}
                    />
                    <span className="font-mono truncate flex-1">{r.relPath}</span>
                    <span className="text-fg-muted shrink-0">{formatBytes(r.sizeBytes)}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="text-[11px] text-fg-muted pt-1">
            Inalterados: {baseDiff.unchangedCount} • Pastas novas: {baseDiff.newFolders.length} • Pico de upload: {formatBytes(peakUploadBytes)}
          </div>

          {exceedsQuotaPeak && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300">
              Pico de upload ({formatBytes(peakUploadBytes)}) excede a cota disponível ({formatBytes(quotaRemainingBytes)}).
            </div>
          )}

          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-border-subtle flex items-center justify-between gap-3">
          <span className="text-[11px] text-fg-muted truncate">{progressText || ''}</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={applying}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-app border border-border-subtle hover:bg-surface-hover cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={applying || exceedsQuotaPeak || (addedSelectedList.length + modifiedSelectedList.length + removedSelectedList.length === 0)}
              className="px-4 py-2 rounded-xl text-xs font-black bg-[#FFCC00] text-[#121212] hover:brightness-105 disabled:opacity-50 cursor-pointer"
            >
              {applying ? 'Aplicando...' : 'Aplicar mudanças'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
