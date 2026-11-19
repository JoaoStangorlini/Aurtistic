// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  listVaultFolderAction,
  type VaultFolderEntry,
  type VaultFileEntry,
} from '@/app/(dashboard)/organizacoes/studio-actions';

import type { StudioVaultRef } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────────

type ScopeMode = 'upload' | 'org' | 'personal';

export interface VaultBrowserSelectedItem {
  name: string;
  relativePath: string;
  streamUrl: string;
  thumbUrl?: string | null;
  vaultRef?: StudioVaultRef;
}

interface StudioVaultBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (item: VaultBrowserSelectedItem) => void;
  onUploadClick: () => void;
  orgSlug?: string;
  organizationId?: string;
  orgDisplayName?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componente: Browser de Pastas
// ─────────────────────────────────────────────────────────────────────────────

function FolderBrowser({
  scopeType,
  orgSlug,
  organizationId,
  orgDisplayName,
  onSelect,
}: {
  scopeType: 'org' | 'user';
  orgSlug?: string;
  organizationId?: string;
  orgDisplayName?: string;
  onSelect: (item: VaultBrowserSelectedItem) => void;
}) {
  const [currentPath, setCurrentPath] = useState('');
  const [folders, setFolders] = useState<VaultFolderEntry[]>([]);
  const [files, setFiles] = useState<VaultFileEntry[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadFolder = useCallback(
    async (path: string) => {
      setLoading(true);
      setError(null);
      setCurrentPath(path);
      try {
        const res = await listVaultFolderAction({
          folder: path,
          scopeType: scopeType,
          orgSlug,
          organizationId,
        });
        if (!res.ok) {
          setError(res.error || 'Erro ao listar pasta.');
          setFolders([]);
          setFiles([]);
          setBreadcrumbs([]);
        } else {
          setFolders(res.folders);
          setFiles(res.files);
          setBreadcrumbs(res.breadcrumbs);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erro inesperado.');
      } finally {
        setLoading(false);
      }
    },
    [scopeType, orgSlug, organizationId]
  );

  // Carrega a raiz ao montar ou ao trocar o scopeType
  useEffect(() => {
    loadFolder('');
    return () => {
      abortRef.current?.abort();
    };
  }, [loadFolder]);

  const imageFiles = files.filter(
    (f) =>
      f.kind === 'image' ||
      /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(f.name)
  );

  return (
    <div className="flex flex-col gap-3 h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 flex-wrap min-h-[24px]">
        {breadcrumbs.map((bc, i) => (
          <React.Fragment key={bc.path}>
            {i > 0 && (
              <span className="material-symbols-outlined text-[13px] text-slate-500">
                chevron_right
              </span>
            )}
            <button
              type="button"
              onClick={() => loadFolder(bc.path)}
              className={`text-[11px] font-bold truncate max-w-[140px] transition-colors cursor-pointer ${
                i === breadcrumbs.length - 1
                  ? 'text-[#FFCC00]'
                  : 'text-slate-400 hover:text-white'
              }`}
              title={bc.name}
            >
              {bc.name || (scopeType === 'org' ? (orgDisplayName || 'Org') : 'Pessoal')}
            </button>
          </React.Fragment>
        ))}
        {loading && (
          <span className="material-symbols-outlined text-[13px] text-slate-400 animate-spin ml-1">
            progress_activity
          </span>
        )}
      </div>

      {error && (
        <div className="text-xs text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => loadFolder(currentPath)}
            className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 font-bold text-[11px] shrink-0 cursor-pointer"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {/* Pastas */}
      {folders.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
            Pastas
          </span>
          <div className="grid grid-cols-2 gap-1.5">
            {folders.map((f) => (
              <button
                key={f.path}
                type="button"
                onClick={() => loadFolder(f.path)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border-subtle bg-surface-hover/50 hover:bg-surface-hover hover:border-[#FFCC00]/50 text-left transition-all cursor-pointer group"
              >
                <span
                  className="material-symbols-outlined text-[18px] shrink-0"
                  style={{ color: f.color || '#FFCC00' }}
                >
                  {f.isShortcut ? 'folder_shared' : (f.icon || 'folder')}
                </span>
                <div className="min-w-0 flex-1">
                  <span className="text-[11px] font-bold text-fg truncate leading-tight block">
                    {f.name}
                  </span>
                  {f.isShortcut && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider text-accent-primary">
                      Atalho{f.shortcutOwner ? ` • ${f.shortcutOwner}` : ''}
                    </span>
                  )}
                </div>
                <span className="material-symbols-outlined text-[12px] text-fg-muted group-hover:text-fg ml-auto shrink-0">
                  chevron_right
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Arquivos de imagem (com proporções reais) */}
      {!loading && (
        <div className="flex flex-col gap-1 flex-1 overflow-hidden">
          <span className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
            Imagens ({imageFiles.length})
          </span>
          {imageFiles.length === 0 && folders.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center h-36 text-xs text-fg-muted gap-2 bg-surface-hover/30 rounded-2xl border border-dashed border-border-subtle p-4">
              <span className="material-symbols-outlined text-[32px] text-fg-muted/60">
                image_not_supported
              </span>
              <span>Nenhuma imagem encontrada nesta pasta.</span>
            </div>
          )}
          {imageFiles.length > 0 && (
            <div className="columns-2 sm:columns-3 gap-2 space-y-2 overflow-y-auto pr-1 max-h-[320px] scrollbar-thin">
              {imageFiles.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() =>
                    onSelect({
                      name: file.name,
                      relativePath: file.path,
                      streamUrl: file.streamUrl,
                      thumbUrl: file.thumbUrl,
                      vaultRef: {
                        scopeType,
                        orgSlug: scopeType === 'org' ? orgSlug : undefined,
                        organizationId: scopeType === 'org' ? organizationId : undefined,
                        relativePath: file.path,
                      },
                    })
                  }
                  className="group relative w-full break-inside-avoid rounded-xl overflow-hidden border border-border-subtle hover:border-[#FFCC00] bg-surface/70 text-left transition-all cursor-pointer shadow-xs block"
                >
                  {file.thumbUrl ? (
                    <img
                      src={file.thumbUrl}
                      alt={file.name}
                      crossOrigin="anonymous"
                      className="w-full h-auto object-contain block max-h-48 bg-black/5 dark:bg-black/30 group-hover:scale-102 transition-transform"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center bg-surface-hover">
                      <span className="material-symbols-outlined text-[24px] text-fg-muted">
                        image
                      </span>
                    </div>
                  )}
                  <div className="p-1.5 bg-surface/90 border-t border-border-subtle flex items-center justify-between gap-1">
                    <p className="text-[10px] font-bold text-fg truncate">{file.name}</p>
                    <span className="material-symbols-outlined text-[13px] text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      check_circle
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Principal
// ─────────────────────────────────────────────────────────────────────────────

export function StudioVaultBrowserModal({
  isOpen,
  onClose,
  onSelect,
  onUploadClick,
  orgSlug,
  organizationId,
  orgDisplayName,
}: StudioVaultBrowserModalProps) {
  const [mode, setMode] = useState<ScopeMode>('org');

  if (!isOpen) return null;

  const tabs: { id: ScopeMode; label: string; icon: string; disabled?: boolean }[] = [
    {
      id: 'org',
      label: 'Cofre da Organização',
      icon: 'folder_shared',
      disabled: !orgSlug,
    },
    { id: 'personal', label: 'Cofre Pessoal', icon: 'person' },
    { id: 'upload', label: 'Upload Local', icon: 'upload_file' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface border border-border-subtle rounded-3xl p-5 w-full max-w-2xl shadow-2xl flex flex-col gap-4 max-h-[88vh] text-fg">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-amber-500 dark:text-[#FFCC00]">
              photo_library
            </span>
            <h3 className="text-sm font-bold text-fg uppercase tracking-wider">
              Selecionar Imagem
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-fg-muted hover:text-fg transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Tabs de Modo */}
        <div className="flex gap-1.5 shrink-0">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              disabled={tab.disabled}
              onClick={() => {
                if (tab.id === 'upload') {
                  onUploadClick();
                  onClose();
                } else {
                  setMode(tab.id);
                }
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                mode === tab.id && tab.id !== 'upload'
                  ? 'bg-[#FFCC00] text-black shadow-md'
                  : tab.id === 'upload'
                  ? 'border border-border-subtle bg-surface-hover/70 text-fg hover:bg-surface-hover'
                  : 'border border-border-subtle bg-surface-hover/40 text-fg-secondary hover:bg-surface-hover hover:text-fg'
              }`}
            >
              <span className="material-symbols-outlined text-[15px]">{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-hidden min-h-[300px]">
          {mode === 'org' && (
            <FolderBrowser
              key={`org-${orgSlug}`}
              scopeType="org"
              orgSlug={orgSlug}
              organizationId={organizationId}
              orgDisplayName={orgDisplayName}
              onSelect={(item) => {
                onSelect(item);
                onClose();
              }}
            />
          )}
          {mode === 'personal' && (
            <FolderBrowser
              key="personal"
              scopeType="user"
              orgDisplayName="Pessoal"
              onSelect={(item) => {
                onSelect(item);
                onClose();
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
