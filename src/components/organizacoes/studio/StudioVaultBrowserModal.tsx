// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  listVaultFolderAction,
  type VaultFolderEntry,
  type VaultFileEntry,
} from '@/app/(dashboard)/organizacoes/studio-actions';

import type { StudioVaultRef } from './types';
import {
  DEFAULT_VAULT_SORT,
  loadVaultSortPreference,
  saveVaultSortPreference,
  sortVaultFolders,
  sortVaultFiles,
  type VaultSortPreference,
} from '@/lib/vault-sorting';
import { VaultSortControl } from '@/components/servidor/VaultSortControl';

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
  const [sortPref, setSortPref] = useState<VaultSortPreference>(DEFAULT_VAULT_SORT);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setSortPref(loadVaultSortPreference());
  }, []);

  const handleSortChange = (next: VaultSortPreference) => {
    setSortPref(next);
    saveVaultSortPreference(next);
  };

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
          if (res.breadcrumbs && res.breadcrumbs.length > 0) {
            setBreadcrumbs(res.breadcrumbs);
          } else {
            const rootLabel = scopeType === 'org' ? (orgDisplayName || 'Cofre da Organização') : 'Cofre Pessoal';
            const clean = path.replace(/^\/+|\/+$/g, '');
            setBreadcrumbs([
              { name: rootLabel, path: '' },
              ...(clean
                ? clean.split('/').map((seg, i, arr) => ({
                  name: seg,
                  path: arr.slice(0, i + 1).join('/'),
                }))
                : []),
            ]);
          }
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

  const sortedFolders = sortVaultFolders(folders, sortPref);
  const imageFiles = sortVaultFiles(
    files.filter(
      (f) =>
        f.kind === 'image' ||
        /\.(jpe?g|png|webp|avif|gif|bmp|tiff?)$/i.test(f.name)
    ),
    sortPref
  );

  return (
    <div
      className="flex flex-col gap-3 flex-1 min-h-0 h-full overflow-hidden"
      style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
    >
      {/* Breadcrumb + Voltar + Ordenação (sempre visíveis no topo) */}
      <div className="flex items-center justify-between gap-2 min-h-[28px] shrink-0">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          {currentPath && (
            <button
              type="button"
              onClick={() => {
                const parent = currentPath.includes('/')
                  ? currentPath.slice(0, currentPath.lastIndexOf('/'))
                  : '';
                loadFolder(parent);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-surface-hover border border-border-subtle text-[11px] font-bold text-fg hover:border-[#FFCC00] cursor-pointer shrink-0 mr-1"
              title="Voltar para a pasta anterior"
            >
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              <span>Voltar</span>
            </button>
          )}
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
                className={`text-[11px] font-bold truncate max-w-[140px] transition-colors cursor-pointer ${i === breadcrumbs.length - 1
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
        <VaultSortControl value={sortPref} onChange={handleSortChange} compact />
      </div>

      {error && (
        <div className="text-xs text-red-700 dark:text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1">{error}</span>
          <div className="flex items-center gap-1.5 shrink-0">
            {currentPath && (
              <button
                type="button"
                onClick={() => {
                  const parent = currentPath.includes('/')
                    ? currentPath.slice(0, currentPath.lastIndexOf('/'))
                    : '';
                  loadFolder(parent);
                }}
                className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-hover border border-border-subtle text-fg font-bold text-[11px] cursor-pointer"
              >
                Voltar
              </button>
            )}
            <button
              type="button"
              onClick={() => loadFolder(currentPath)}
              className="px-2.5 py-1 rounded-lg bg-red-500/15 hover:bg-red-500/25 font-bold text-[11px] cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {/* Pastas */}
      {folders.length > 0 && (
        <div className="flex flex-col gap-1.5 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
            Pastas ({folders.length})
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[160px] overflow-y-auto pr-1 scrollbar-thin">
            {sortedFolders.map((f) => (
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

      {/* Arquivos de imagem */}
      {!loading && (
        <div
          className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden"
          style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
          <div className="flex items-center justify-between shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
              Imagens ({imageFiles.length})
            </span>
          </div>
          {imageFiles.length === 0 && folders.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center flex-1 text-xs text-fg-muted gap-2 bg-surface-hover/30 rounded-2xl border border-dashed border-border-subtle p-6">
              <span className="material-symbols-outlined text-[36px] text-fg-muted/60">
                image_not_supported
              </span>
              <span>Nenhuma imagem encontrada nesta pasta.</span>
            </div>
          )}
          {imageFiles.length > 0 && (
            <div
              className="overflow-y-auto pr-1 flex-1 min-h-0 scrollbar-thin"
              style={{ flex: '1 1 0%', minHeight: 0, overflowY: 'auto' }}
            >
              <div style={{ columnWidth: '175px', columnGap: '12px' }}>
                {imageFiles.map((file, idx) => (
                  <button
                    key={`${file.path}-${idx}`}
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
                    style={{
                      display: 'inline-block',
                      width: '100%',
                      marginBottom: '12px',
                      breakInside: 'avoid',
                    }}
                    className="group relative rounded-2xl overflow-hidden border border-border-subtle hover:border-[#FFCC00] bg-surface/80 text-left transition-all cursor-pointer shadow-sm hover:shadow-md align-top"
                  >
                    {file.thumbUrl ? (
                      <div className="w-full bg-black/25 overflow-hidden">
                        <img
                          src={file.thumbUrl}
                          alt={file.name}
                          crossOrigin="anonymous"
                          style={{ width: '100%', height: 'auto', display: 'block' }}
                          className="group-hover:scale-105 transition-transform duration-200"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div
                        className="w-full flex items-center justify-center bg-surface-hover"
                        style={{ aspectRatio: '4 / 3' }}
                      >
                        <span className="material-symbols-outlined text-[28px] text-fg-muted">
                          image
                        </span>
                      </div>
                    )}
                    <div className="px-2.5 py-2 bg-surface/95 border-t border-border-subtle flex items-center justify-between gap-1.5">
                      <p className="text-[11px] font-bold text-fg truncate">{file.name}</p>
                      <span className="material-symbols-outlined text-[15px] text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        add_circle
                      </span>
                    </div>
                  </button>
                ))}
              </div>
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

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined') return null;

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

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Selecionar imagem do Cofre"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-surface border border-border-subtle rounded-3xl p-4 sm:p-6 w-full max-w-5xl shadow-2xl flex flex-col gap-4 text-fg overflow-hidden"
        style={{ height: '86vh', maxHeight: '86dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-subtle pb-3 shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[22px] text-amber-500 dark:text-[#FFCC00]">
              photo_library
            </span>
            <div>
              <h3 className="text-sm font-black text-fg uppercase tracking-wider leading-tight">
                Selecionar Imagem do Cofre
              </h3>
              <p className="text-[11px] text-fg-muted">
                Navegue pelas pastas e clique em uma foto para inserir no palco
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal do cofre"
            className="p-1.5 rounded-xl bg-surface-hover/60 text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Tabs de Modo */}
        <div className="flex gap-2 shrink-0">
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
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${mode === tab.id && tab.id !== 'upload'
                ? 'bg-[#FFCC00] text-black shadow-md'
                : tab.id === 'upload'
                  ? 'border border-border-subtle bg-surface-hover/70 text-fg hover:bg-surface-hover'
                  : 'border border-border-subtle bg-surface-hover/40 text-fg-secondary hover:bg-surface-hover hover:text-fg'
                }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              <span className="truncate">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div
          className="flex-1 min-h-0 overflow-hidden"
          style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
        >
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
    </div>,
    document.body
  );
}
