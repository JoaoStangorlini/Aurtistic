// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { EdgeVaultEntry, UserFileIndexRow, Task } from '@/types';

export interface FolderCustomMeta {
  color?: string;
  icon?: string;
  isFavorite?: boolean;
  deviceCategory?: 'camera' | 'mobile' | 'drone' | 'other';
  deviceName?: string;
}

export const VAULT_FOLDER_COLORS: { id: string; hex: string; label: string }[] = [
  { id: 'default', hex: '', label: 'Padrão' },
  { id: 'gold', hex: '#FFCC00', label: 'Dourado' },
  { id: 'purple', hex: '#9D4EDD', label: 'Roxo' },
  { id: 'blue', hex: '#3A86FF', label: 'Azul' },
  { id: 'emerald', hex: '#10B981', label: 'Esmeralda' },
  { id: 'rose', hex: '#F14343', label: 'Coral' },
  { id: 'orange', hex: '#FB5607', label: 'Laranja' },
  { id: 'pink', hex: '#FF006E', label: 'Rosa' },
  { id: 'cyan', hex: '#00E5FF', label: 'Ciano' },
];

export const VAULT_FOLDER_ICONS: { id: string; icon: string; label: string }[] = [
  { id: 'folder', icon: 'folder', label: 'Pasta Padrão' },
  { id: 'photo_library', icon: 'photo_library', label: 'Fotos & Galeria' },
  { id: 'palette', icon: 'palette', label: 'Design & Arte' },
  { id: 'workspaces', icon: 'workspaces', label: 'Projetos' },
  { id: 'code', icon: 'code', label: 'Código & Dev' },
  { id: 'verified', icon: 'verified', label: 'Certificados & Docs' },
  { id: 'headphones', icon: 'headphones', label: 'Músicas & Áudio' },
  { id: 'movie', icon: 'movie', label: 'Vídeos & Filmes' },
  { id: 'star', icon: 'star', label: 'Destaques' },
  { id: 'favorite', icon: 'favorite', label: 'Favoritos' },
  { id: 'bookmark', icon: 'bookmark', label: 'Marcadores' },
  { id: 'school', icon: 'school', label: 'Estudos & USP' },
  { id: 'inventory_2', icon: 'inventory_2', label: 'Acervo & Arquivo' },
  { id: 'lock', icon: 'lock', label: 'Segurança' },
];

export interface VaultContextMenuProps {
  x: number;
  y: number;
  type: 'file' | 'folder' | 'selection' | 'background';
  entry?: EdgeVaultEntry;
  selectedCount?: number;
  indexRow?: UserFileIndexRow;
  folderMeta?: FolderCustomMeta;
  availableTasks?: Task[];
  hasPin?: boolean;
  onClose: () => void;
  onOpenFolder?: (path: string) => void;
  onPreviewFile?: (entry: EdgeVaultEntry) => void;
  onDownload?: (entry: EdgeVaultEntry) => void;
  onDownloadZip?: (folderPath: string) => void;
  onDownloadBatchZip?: () => void;
  onRename?: (entry: EdgeVaultEntry) => void;
  onDelete?: (entry: EdgeVaultEntry) => void;
  onBatchDelete?: () => void;
  onTogglePin?: (entry: EdgeVaultEntry) => void;
  onToggleFavorite?: (entry: EdgeVaultEntry) => void;
  onUpdateFolderColor?: (folderPath: string, colorHex: string) => void;
  onUpdateFolderIcon?: (folderPath: string, iconName: string) => void;
  onTogglePortfolio?: (entry: EdgeVaultEntry) => void;
  onMoveToPortfolio?: (entry: EdgeVaultEntry) => void;
  onBatchMoveToPortfolio?: () => void;
  onToggleCurriculum?: (entry: EdgeVaultEntry) => void;
  onShareWithClient?: (path: string, name?: string) => void;
  onTagFolderDevice?: (
    folderPath: string,
    category: 'camera' | 'mobile' | 'drone' | 'other',
    name: string,
    recursive: boolean
  ) => void;
  onLinkTask?: (entry: EdgeVaultEntry, taskId: string) => void;
  onCreateFolder?: () => void;
  onCreateNote?: () => void;
  onUploadFiles?: () => void;
  onUploadFolder?: () => void;
  onUploadZip?: () => void;
  onRefresh?: () => void;
  onClearSelection?: () => void;
}

export function VaultContextMenu({
  x,
  y,
  type,
  entry,
  selectedCount = 0,
  indexRow,
  folderMeta,
  availableTasks = [],
  hasPin,
  onClose,
  onOpenFolder,
  onPreviewFile,
  onDownload,
  onDownloadZip,
  onDownloadBatchZip,
  onRename,
  onDelete,
  onBatchDelete,
  onTogglePin,
  onToggleFavorite,
  onUpdateFolderColor,
  onUpdateFolderIcon,
  onTogglePortfolio,
  onMoveToPortfolio,
  onBatchMoveToPortfolio,
  onToggleCurriculum,
  onShareWithClient,
  onTagFolderDevice,
  onLinkTask,
  onCreateFolder,
  onCreateNote,
  onUploadFiles,
  onUploadFolder,
  onUploadZip,
  onRefresh,
  onClearSelection,
}: VaultContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'color' | 'icon' | 'tasks' | null>(null);
  const [isDeviceModalOpen, setIsDeviceModalOpen] = useState(false);
  const [deviceCategory, setDeviceCategory] = useState<'camera' | 'mobile' | 'drone' | 'other'>(
    folderMeta?.deviceCategory || 'camera'
  );
  const [deviceName, setDeviceName] = useState(folderMeta?.deviceName || '');
  const [deviceRecursive, setDeviceRecursive] = useState(true);

  // Garante que o menu flutuante permaneça dentro dos limites da tela
  const [adjustedPos, setAdjustedPos] = useState({ left: x, top: y });

  useEffect(() => {
    if (!menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let nextLeft = x;
    let nextTop = y;

    if (x + rect.width > viewportWidth - 10) {
      nextLeft = Math.max(10, viewportWidth - rect.width - 15);
    }
    if (y + rect.height > viewportHeight - 10) {
      nextTop = Math.max(10, viewportHeight - rect.height - 15);
    }

    setAdjustedPos({ left: nextLeft, top: nextTop });
  }, [x, y, activeSubmenu]);

  // Fecha o menu ao clicar fora ou rolar a página
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleScroll = () => {
      onClose();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScroll);
    };
  }, [onClose]);

  const isFavorite = Boolean(entry?.kind === 'folder' ? folderMeta?.isFavorite : indexRow?.is_favorite);
  const inPortfolio = Boolean(indexRow?.show_in_portfolio);
  const inCurriculum = Boolean(indexRow?.show_in_curriculum);

  return (
    <div
      ref={menuRef}
      style={{ left: `${adjustedPos.left}px`, top: `${adjustedPos.top}px` }}
      onClick={(e) => e.stopPropagation()}
      className="fixed z-[150] w-64 bg-surface/95 backdrop-blur-md border border-border-subtle rounded-2xl shadow-2xl p-1.5 text-xs text-fg animate-in fade-in zoom-in-95 duration-100 select-none divide-y divide-border-subtle/50"
    >
      {/* 1. SELEÇÃO MÚLTIPLA */}
      {type === 'selection' && selectedCount > 0 && (
        <div className="py-1">
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-fg-muted flex items-center justify-between">
            <span>{selectedCount} itens selecionados</span>
            <button
              type="button"
              onClick={() => {
                onClearSelection?.();
                onClose();
              }}
              className="text-fg-muted hover:text-fg font-normal"
            >
              Limpar
            </button>
          </div>

          {onBatchMoveToPortfolio && (
            <button
              type="button"
              onClick={() => {
                onBatchMoveToPortfolio();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover hover:text-[#FFCC00] transition-colors text-left font-bold"
            >
              <span className="material-symbols-outlined text-[17px] text-[#FFCC00]">
                photo_library
              </span>
              <span>Mandar Selecionados para o Portfólio</span>
            </button>
          )}

          {onDownloadBatchZip && (
            <button
              type="button"
              onClick={() => {
                onDownloadBatchZip();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover hover:text-[var(--accent-secondary)] transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[17px] text-[var(--accent-secondary)]">
                folder_zip
              </span>
              <span>Baixar Selecionados (.ZIP)</span>
            </button>
          )}

          {onBatchDelete && (
            <button
              type="button"
              onClick={() => {
                onBatchDelete();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#F14343] hover:bg-[#F14343]/10 transition-colors text-left font-bold"
            >
              <span className="material-symbols-outlined text-[17px]">delete</span>
              <span>Mover Selecionados para Lixeira</span>
            </button>
          )}
        </div>
      )}

      {/* 2. PASTA */}
      {type === 'folder' && entry && (
        <>
          <div className="px-3 py-1.5 text-[11px] font-bold text-fg-muted truncate">
            📁 {entry.name}
          </div>

          <div className="py-1 space-y-0.5">
            {onOpenFolder && (
              <button
                type="button"
                onClick={() => {
                  onOpenFolder(entry.relativePath);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-[var(--accent-primary)]">
                  folder_open
                </span>
                <span>Abrir Pasta</span>
              </button>
            )}

            {onRename && (
              <button
                type="button"
                onClick={() => {
                  onRename(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-fg-muted">
                  drive_file_rename_outline
                </span>
                <span>Renomear</span>
              </button>
            )}

            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => {
                  onToggleFavorite(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className={`material-symbols-outlined text-[17px] ${isFavorite ? 'text-[#FFCC00]' : 'text-fg-muted'}`}>
                  {isFavorite ? 'star' : 'star_outline'}
                </span>
                <span>{isFavorite ? 'Remover dos Favoritos' : 'Favoritar Pasta'}</span>
              </button>
            )}

            {/* Submenu de Cores */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveSubmenu(activeSubmenu === 'color' ? null : 'color')}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[17px] text-[#FFCC00]">
                    palette
                  </span>
                  <span>Mudar Cor</span>
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className="w-3.5 h-3.5 rounded-full border border-border-subtle shrink-0"
                    style={{ backgroundColor: folderMeta?.color || 'transparent' }}
                  />
                  <span className="material-symbols-outlined text-[16px] text-fg-muted">
                    chevron_right
                  </span>
                </div>
              </button>

              {activeSubmenu === 'color' && (
                <div className="p-2.5 bg-app border border-border-subtle rounded-xl mt-1 space-y-2">
                  <p className="text-[10px] font-bold text-fg-muted uppercase tracking-wider">
                    Paleta de Cores da Pasta:
                  </p>
                  <div className="grid grid-cols-5 gap-1.5">
                    {VAULT_FOLDER_COLORS.map((c) => {
                      const isCurrent = (folderMeta?.color || '') === c.hex;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            onUpdateFolderColor?.(entry.relativePath, c.hex);
                            onClose();
                          }}
                          className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
                            isCurrent
                              ? 'border-fg scale-110 shadow-sm'
                              : 'border-border-subtle hover:scale-105'
                          }`}
                          style={{ backgroundColor: c.hex || 'var(--color-surface, #232228)' }}
                          title={c.label}
                        >
                          {isCurrent && (
                            <span className="material-symbols-outlined text-[14px] text-fg font-black">
                              check
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Submenu de Ícones */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActiveSubmenu(activeSubmenu === 'icon' ? null : 'icon')}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[17px] text-[#00E5FF]">
                    category
                  </span>
                  <span>Mudar Ícone</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-[#00E5FF]">
                    {folderMeta?.icon || 'folder'}
                  </span>
                  <span className="material-symbols-outlined text-[16px] text-fg-muted">
                    chevron_right
                  </span>
                </div>
              </button>

              {activeSubmenu === 'icon' && (
                <div className="p-2.5 bg-app border border-border-subtle rounded-xl mt-1 space-y-2 max-h-48 overflow-y-auto">
                  <p className="text-[10px] font-bold text-fg-muted uppercase tracking-wider">
                    Escolha um Ícone:
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {VAULT_FOLDER_ICONS.map((ic) => {
                      const isCurrent = (folderMeta?.icon || 'folder') === ic.icon;
                      return (
                        <button
                          key={ic.id}
                          type="button"
                          onClick={() => {
                            onUpdateFolderIcon?.(entry.relativePath, ic.icon);
                            onClose();
                          }}
                          className={`p-2 rounded-lg border flex flex-col items-center justify-center transition-all ${
                            isCurrent
                              ? 'bg-[var(--accent-primary)]/20 border-[var(--accent-primary)] text-[var(--accent-primary)]'
                              : 'bg-surface hover:bg-surface-hover border-border-subtle text-fg-secondary hover:text-fg'
                          }`}
                          title={ic.label}
                        >
                          <span className="material-symbols-outlined text-[20px]">{ic.icon}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {onTagFolderDevice && (
              <button
                type="button"
                onClick={() => setIsDeviceModalOpen(true)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-[var(--accent-primary)]">
                  photo_camera
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs">Dispositivo do Ensaio / Pasta</div>
                  {folderMeta?.deviceName && (
                    <div className="text-[10px] text-fg-muted truncate">
                      {folderMeta.deviceName}
                    </div>
                  )}
                </div>
              </button>
            )}

            {onTogglePin && (
              <button
                type="button"
                onClick={() => {
                  onTogglePin(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-[#9D4EDD]">
                  {hasPin ? 'lock_open' : 'enhanced_encryption'}
                </span>
                <span>{hasPin ? 'Remover Proteção PIN' : 'Proteger com PIN'}</span>
              </button>
            )}

            {onShareWithClient && (
              <button
                type="button"
                onClick={() => {
                  onShareWithClient(entry.relativePath, entry.name);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover hover:text-[#9D4EDD] transition-colors text-left font-semibold"
              >
                <span className="material-symbols-outlined text-[17px] text-[#9D4EDD]">
                  share
                </span>
                <span>Compartilhar com o Cliente</span>
              </button>
            )}

            {onDownloadZip && (
              <button
                type="button"
                onClick={() => {
                  onDownloadZip(entry.relativePath);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover hover:text-[var(--accent-secondary)] transition-colors text-left font-medium"
              >
                <span className="material-symbols-outlined text-[17px] text-[var(--accent-secondary)]">
                  folder_zip
                </span>
                <span>Baixar em ZIP</span>
              </button>
            )}
          </div>

          {onDelete && (
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  onDelete(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#F14343] hover:bg-[#F14343]/10 transition-colors text-left font-bold"
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
                <span>Mover para a Lixeira</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* 3. ARQUIVO */}
      {type === 'file' && entry && (
        <>
          <div className="px-3 py-1.5 text-[11px] font-bold text-fg-muted truncate">
            📄 {entry.name}
          </div>

          <div className="py-1 space-y-0.5">
            {onPreviewFile && (
              <button
                type="button"
                onClick={() => {
                  onPreviewFile(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-[var(--accent-primary)]">
                  visibility
                </span>
                <span>Visualizar (Painel de Inspeção)</span>
              </button>
            )}

            {onDownload && (
              <button
                type="button"
                onClick={() => {
                  onDownload(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-fg-muted">
                  download
                </span>
                <span>Baixar Arquivo</span>
              </button>
            )}

            {onShareWithClient && (
              <button
                type="button"
                onClick={() => {
                  onShareWithClient(entry.relativePath, entry.name);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover hover:text-[#9D4EDD] transition-colors text-left font-medium"
              >
                <span className="material-symbols-outlined text-[17px] text-[#9D4EDD]">
                  share
                </span>
                <span>Compartilhar com o Cliente</span>
              </button>
            )}

            {onRename && (
              <button
                type="button"
                onClick={() => {
                  onRename(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[17px] text-fg-muted">
                  drive_file_rename_outline
                </span>
                <span>Renomear</span>
              </button>
            )}

            {onToggleFavorite && (
              <button
                type="button"
                onClick={() => {
                  onToggleFavorite(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className={`material-symbols-outlined text-[17px] ${isFavorite ? 'text-[#FFCC00]' : 'text-fg-muted'}`}>
                  {isFavorite ? 'star' : 'star_outline'}
                </span>
                <span>{isFavorite ? 'Remover dos Favoritos' : 'Destacar no Resumo (Favorito)'}</span>
              </button>
            )}

            {onMoveToPortfolio && (
              <button
                type="button"
                onClick={() => {
                  onMoveToPortfolio(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover hover:text-[#FFCC00] transition-colors text-left font-semibold"
              >
                <span className="material-symbols-outlined text-[17px] text-[#FFCC00]">
                  photo_library
                </span>
                <span>Mandar para o Portfólio</span>
              </button>
            )}

            {onTogglePortfolio && (
              <button
                type="button"
                onClick={() => {
                  onTogglePortfolio(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className={`material-symbols-outlined text-[17px] ${inPortfolio ? 'text-[#FFCC00]' : 'text-fg-muted'}`}>
                  photo_camera
                </span>
                <span>{inPortfolio ? 'Ocultar do Portfólio' : 'Publicar no Portfólio'}</span>
              </button>
            )}

            {onToggleCurriculum && (
              <button
                type="button"
                onClick={() => {
                  onToggleCurriculum(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
              >
                <span className={`material-symbols-outlined text-[17px] ${inCurriculum ? 'text-[#9D4EDD]' : 'text-fg-muted'}`}>
                  verified
                </span>
                <span>{inCurriculum ? 'Desvincular do Currículo' : 'Vincular ao Currículo'}</span>
              </button>
            )}

            {/* Submenu de Tarefas */}
            {availableTasks.length > 0 && onLinkTask && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setActiveSubmenu(activeSubmenu === 'tasks' ? null : 'tasks')}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[17px] text-[#10B981]">
                      task_alt
                    </span>
                    <span>Vincular à Tarefa</span>
                  </div>
                  <span className="material-symbols-outlined text-[16px] text-fg-muted">
                    chevron_right
                  </span>
                </button>

                {activeSubmenu === 'tasks' && (
                  <div className="p-2 bg-app border border-border-subtle rounded-xl mt-1 max-h-48 overflow-y-auto space-y-1">
                    <p className="text-[10px] font-bold text-fg-muted uppercase tracking-wider px-1">
                      Selecione a Tarefa:
                    </p>
                    {availableTasks.slice(0, 30).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          onLinkTask(entry, t.id);
                          onClose();
                        }}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-surface-hover truncate text-[11px] text-fg transition-colors"
                      >
                        {t.nome}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {onDelete && (
            <div className="py-1">
              <button
                type="button"
                onClick={() => {
                  onDelete(entry);
                  onClose();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[#F14343] hover:bg-[#F14343]/10 transition-colors text-left font-bold"
              >
                <span className="material-symbols-outlined text-[17px]">delete</span>
                <span>Mover para a Lixeira</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* 4. PLANO DE FUNDO / ESPAÇO LIVRE */}
      {type === 'background' && (
        <div className="py-1 space-y-0.5">
          {onCreateFolder && (
            <button
              type="button"
              onClick={() => {
                onCreateFolder();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[17px] text-[#00E5FF]">
                create_new_folder
              </span>
              <span>Criar Nova Pasta</span>
            </button>
          )}

          {onCreateNote && (
            <button
              type="button"
              onClick={() => {
                onCreateNote();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[17px] text-[#9D4EDD]">
                note_add
              </span>
              <span>Nova Nota (.md)</span>
            </button>
          )}

          {onUploadFiles && (
            <button
              type="button"
              onClick={() => {
                onUploadFiles();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[17px] text-[var(--accent-primary)]">
                upload_file
              </span>
              <span>Subir Arquivos</span>
            </button>
          )}

          {onUploadFolder && (
            <button
              type="button"
              onClick={() => {
                onUploadFolder();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[17px] text-[var(--accent-secondary)]">
                drive_folder_upload
              </span>
              <span>Subir Pasta (ou Múltiplas)</span>
            </button>
          )}

          {onUploadZip && (
            <button
              type="button"
              onClick={() => {
                onUploadZip();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[17px] text-[#FFCC00]">
                folder_zip
              </span>
              <span>Subir Pacote .ZIP</span>
            </button>
          )}

          {onRefresh && (
            <button
              type="button"
              onClick={() => {
                onRefresh();
                onClose();
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-fg hover:bg-surface-hover transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[17px] text-fg-muted">
                refresh
              </span>
              <span>Atualizar Pasta</span>
            </button>
          )}
        </div>
      )}

      {/* Modal de Configuração de Dispositivo do Ensaio / Pasta */}
      {isDeviceModalOpen && entry && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <div
            className="w-full max-w-md bg-surface border border-border-subtle rounded-2xl shadow-2xl p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-[var(--accent-primary)]">
                  photo_camera
                </span>
                <h3 className="text-sm font-bold text-fg">
                  Dispositivo do Ensaio / Pasta
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeviceModalOpen(false)}
                className="p-1 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-xs text-fg-secondary">
              Defina o equipamento fotográfico ou celular utilizado nesta pasta (<strong>{entry.name}</strong>).
            </p>

            {/* Categoria */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-fg">Tipo de Dispositivo</label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { id: 'camera', label: 'Câmera', icon: 'photo_camera' },
                  { id: 'mobile', label: 'Celular', icon: 'smartphone' },
                  { id: 'drone', label: 'Drone', icon: 'flight' },
                  { id: 'other', label: 'Outro', icon: 'devices' },
                ].map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => {
                      setDeviceCategory(cat.id as 'camera' | 'mobile' | 'drone' | 'other');
                    }}
                    className={`py-2 px-1.5 rounded-xl border text-xs font-semibold flex flex-col items-center gap-1 transition-all ${
                      deviceCategory === cat.id
                        ? 'bg-[var(--accent-primary)]/15 border-[var(--accent-primary)] text-[var(--accent-primary)]'
                        : 'bg-app border-border-subtle text-fg-muted hover:text-fg'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{cat.icon}</span>
                    <span className="text-[11px]">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Nome do Equipamento */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-fg">Nome do Equipamento</label>
              <input
                type="text"
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder={
                  deviceCategory === 'camera'
                    ? 'Ex: Sony A7 IV, Canon R6...'
                    : deviceCategory === 'mobile'
                      ? 'Ex: iPhone 15 Pro, Samsung S24...'
                      : 'Ex: DJI Mavic 3...'
                }
                className="w-full px-3 py-2 rounded-xl bg-app border border-border-subtle text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
              />
              {/* Sugestões rápidas */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {(deviceCategory === 'camera'
                  ? ['Sony A7 IV', 'Canon EOS R6', 'Nikon Z6 II', 'Fuji X-T4']
                  : deviceCategory === 'mobile'
                    ? ['iPhone 15 Pro', 'iPhone 14', 'Samsung S24 Ultra', 'Google Pixel 8']
                    : ['DJI Mini 3 Pro', 'DJI Mavic 3']
                ).map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setDeviceName(preset)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-surface-hover hover:bg-[var(--accent-primary)]/10 text-fg-muted hover:text-[var(--accent-primary)] border border-border-subtle transition-colors"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Checkbox Recursivo */}
            <label className="flex items-center gap-2 cursor-pointer text-xs text-fg pt-1">
              <input
                type="checkbox"
                checked={deviceRecursive}
                onChange={(e) => setDeviceRecursive(e.target.checked)}
                className="rounded border-border-subtle accent-[var(--accent-primary)]"
              />
              <span>Aplicar a todas as fotos desta pasta e subpastas</span>
            </label>

            {/* Ações */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => setIsDeviceModalOpen(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onTagFolderDevice && entry) {
                    onTagFolderDevice(
                      entry.relativePath,
                      deviceCategory,
                      deviceName.trim() || (deviceCategory === 'camera' ? 'Câmera' : 'Celular'),
                      deviceRecursive
                    );
                  }
                  setIsDeviceModalOpen(false);
                  onClose();
                }}
                className="px-4 py-1.5 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-bold hover:brightness-110 shadow-md transition-all"
              >
                Salvar e Etiquetar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

