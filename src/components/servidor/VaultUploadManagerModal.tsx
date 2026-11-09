// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import type { UploadItem } from '@/lib/file-upload-helpers';
import {
  extractFilesFromDataTransfer,
  extractFilesFromFileList,
  extractFilesFromZip,
  resolveItemTargetFolder,
} from '@/lib/file-upload-helpers';
import { uploadTenantFileDirect } from '@/lib/edge-client';
import { syncUserFileIndexAction, refreshTenantTicketAction } from '@/app/(dashboard)/servidor/actions';
import { VaultActionDialog } from './VaultActionDialog';

export interface QueuedUploadItem {
  id: string;
  file: File;
  relativePath: string;
  targetFolder: string;
  status: 'idle' | 'uploading' | 'success' | 'error';
  error?: string;
  progressPercent?: number;
}

export interface VaultUploadManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItems?: UploadItem[];
  currentFolder: string;
  ticket: string;
  serverUrl?: string;
  selectedOrgId?: string | null;
  onUploadFinished: (results: {
    successCount: number;
    errorCount: number;
    newUsedBytes?: number;
  }) => void;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getFileIcon(name: string): { icon: string; color: string } {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'jpg':
    case 'jpeg':
    case 'png':
    case 'webp':
    case 'gif':
    case 'svg':
    case 'avif':
      return { icon: 'image', color: 'text-amber-500' };
    case 'mp3':
    case 'wav':
    case 'ogg':
      return { icon: 'audiotrack', color: 'text-purple-500' };
    case 'mp4':
    case 'webm':
    case 'mov':
      return { icon: 'movie', color: 'text-red-500' };
    case 'pdf':
      return { icon: 'picture_as_pdf', color: 'text-rose-500' };
    case 'md':
    case 'txt':
      return { icon: 'edit_note', color: 'text-emerald-500' };
    case 'zip':
    case 'tar':
    case 'gz':
      return { icon: 'folder_zip', color: 'text-yellow-500' };
    default:
      return { icon: 'draft', color: 'text-fg-muted' };
  }
}

export function VaultUploadManagerModal({
  isOpen,
  onClose,
  initialItems,
  currentFolder,
  ticket,
  serverUrl,
  selectedOrgId,
  onUploadFinished,
}: VaultUploadManagerModalProps) {
  const [queue, setQueue] = useState<QueuedUploadItem[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipStatusText, setZipStatusText] = useState<string | null>(null);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [errorAlertMessage, setErrorAlertMessage] = useState<string | null>(null);
  const [overrideFolder, setOverrideFolder] = useState<string | null>(null);
  const effectiveTargetFolder = overrideFolder !== null ? overrideFolder : (currentFolder || '');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const cancelRequestedRef = useRef(false);
  const dragCounterRef = useRef(0);
  const currentTicketRef = useRef(ticket);
  const lastProgressUpdateRef = useRef(0);

  useEffect(() => {
    currentTicketRef.current = ticket;
  }, [ticket]);

  // Adiciona novos itens à fila
  const enqueueItems = useCallback(
    (newItems: UploadItem[]) => {
      if (!newItems || newItems.length === 0) return;
      const baseFolder = overrideFolder !== null ? overrideFolder : (currentFolder || '');
      const mapped: QueuedUploadItem[] = newItems.map((it, idx) => {
        const { targetFolder } = resolveItemTargetFolder(baseFolder, it.relativePath);
        return {
          id: `${it.relativePath}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}-${idx}`,
          file: it.file,
          relativePath: it.relativePath,
          targetFolder,
          status: 'idle',
        };
      });

      setQueue((prev) => {
        // Evita duplicatas idênticas de caminho relativo ainda em estado idle
        const existingPaths = new Set(prev.map((i) => i.relativePath));
        const filtered = mapped.filter((m) => !existingPaths.has(m.relativePath));
        return [...prev, ...filtered];
      });
    },
    [currentFolder, overrideFolder]
  );

  const handleSetTargetFolder = (newFolder: string) => {
    const clean = newFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    setOverrideFolder(clean);
    setQueue((prev) =>
      prev.map((item) => {
        if (item.status !== 'idle') return item;
        const { targetFolder } = resolveItemTargetFolder(clean, item.relativePath);
        return { ...item, targetFolder };
      })
    );
  };

  const prevInitialItemsRef = useRef<UploadItem[] | undefined>(undefined);

  // Quando o modal abre ou recebe novos itens iniciais
  useEffect(() => {
    if (isOpen && initialItems && initialItems.length > 0 && initialItems !== prevInitialItemsRef.current) {
      prevInitialItemsRef.current = initialItems;
      const timer = setTimeout(() => {
        enqueueItems(initialItems);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialItems, enqueueItems]);

  useEffect(() => {
    if (!isOpen && !isUploading) {
      const timer = setTimeout(() => {
        setQueue([]);
        setIsMinimized(false);
        setOverrideFolder(null);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isUploading]);

  // Métricas agregadas
  const totalFiles = queue.length;
  const completedFiles = queue.filter((i) => i.status === 'success').length;
  const errorFiles = queue.filter((i) => i.status === 'error').length;
  const idleFiles = queue.filter((i) => i.status === 'idle').length;
  const activeItem = queue.find((i) => i.status === 'uploading');

  const totalBytes = useMemo(() => queue.reduce((acc, i) => acc + i.file.size, 0), [queue]);
  const uploadedBytes = useMemo(() => {
    return queue.reduce((acc, i) => {
      if (i.status === 'success') return acc + i.file.size;
      if (i.status === 'uploading' && i.progressPercent) {
        return acc + Math.round((i.file.size * i.progressPercent) / 100);
      }
      return acc;
    }, 0);
  }, [queue]);

  const distinctFolders = useMemo(() => {
    const foldersSet = new Set<string>();
    for (const it of queue) {
      if (it.targetFolder) foldersSet.add(it.targetFolder);
    }
    return foldersSet.size;
  }, [queue]);

  const overallPercent = totalBytes > 0 ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100)) : 0;

  const handleRetryFailed = () => {
    if (isUploading) return;
    setQueue((prev) =>
      prev.map((it) => (it.status === 'error' ? { ...it, status: 'idle', error: undefined } : it))
    );
  };

  // Executa o envio em lote sequencial com barra de progresso em tempo real e auto-renovação de ticket
  const handleStartUpload = async () => {
    if (isUploading || queue.length === 0) return;
    setIsUploading(true);
    cancelRequestedRef.current = false;

    // 1. Obtém ticket novo e garantido antes de iniciar uploads em lote
    try {
      const refreshed = await refreshTenantTicketAction({
        purpose: 'vault',
        readOnly: false,
      });
      if (refreshed.ok && refreshed.ticket?.ticket) {
        currentTicketRef.current = refreshed.ticket.ticket;
      }
    } catch (e) {
      console.warn('[VaultUpload] Falha ao renovar ticket antes do lote:', e);
    }

    let successCount = 0;
    let errorCount = 0;
    let lastUsedBytes: number | undefined;

    // Itera pelos itens pendentes ou que deram erro
    for (let i = 0; i < queue.length; i++) {
      if (cancelRequestedRef.current) break;
      const currentItem = queue[i];
      if (currentItem.status === 'success') continue;

      setQueue((prev) =>
        prev.map((it, idx) =>
          idx === i ? { ...it, status: 'uploading', progressPercent: 0, error: undefined } : it
        )
      );

      let uploadSuccess = false;
      let attempt = 0;
      let lastErr: unknown;

      while (!uploadSuccess && attempt < 2 && !cancelRequestedRef.current) {
        attempt++;
        try {
          const mutation = await uploadTenantFileDirect({
            file: currentItem.file,
            folderPath: currentItem.targetFolder,
            ticket: currentTicketRef.current,
            serverUrl,
            onProgress: (pct) => {
              const now = Date.now();
              if (now - lastProgressUpdateRef.current > 150 || pct === 100) {
                lastProgressUpdateRef.current = now;
                setQueue((prev) =>
                  prev.map((it, idx) => (idx === i ? { ...it, progressPercent: pct } : it))
                );
              }
            },
          });

          uploadSuccess = true;

          // Sincroniza metadados no Supabase de forma desacoplada para não invalidar upload em disco
          try {
            const normTarget = (currentItem.targetFolder || '').toLowerCase();
            const isPortfolioFolder =
              normTarget === 'portfolio' ||
              normTarget.startsWith('portfolio/') ||
              normTarget === 'portifolio' ||
              normTarget.startsWith('portifolio/');
            const isCurriculumFolder =
              normTarget === 'curriculo' ||
              normTarget.startsWith('curriculo/');

            await syncUserFileIndexAction({
              mutation,
              ecosystemLinks: {
                ...(isPortfolioFolder ? { showInPortfolio: true, visibility: 'public' } : {}),
                ...(isCurriculumFolder ? { showInCurriculum: true, visibility: 'public' } : {}),
              },
              organizationId: selectedOrgId || undefined,
            });
          } catch (syncErr) {
            console.warn('[VaultUpload] Aviso de sincronização no Supabase:', syncErr);
          }

          if (typeof mutation.total_used_bytes === 'number') {
            lastUsedBytes = mutation.total_used_bytes;
          }

          successCount++;
          setQueue((prev) =>
            prev.map((it, idx) =>
              idx === i ? { ...it, status: 'success', progressPercent: 100, error: undefined } : it
            )
          );
        } catch (err: unknown) {
          lastErr = err;
          const errMsg = err instanceof Error ? err.message : String(err);
          const isAuthError =
            errMsg.includes('401') ||
            errMsg.toLowerCase().includes('ticket') ||
            errMsg.toLowerCase().includes('expirado') ||
            errMsg.toLowerCase().includes('permissão');

          if (isAuthError && attempt < 2) {
            try {
              const refreshed = await refreshTenantTicketAction({
                purpose: 'vault',
                readOnly: false,
              });
              if (refreshed.ok && refreshed.ticket?.ticket) {
                currentTicketRef.current = refreshed.ticket.ticket;
                continue; // Tenta o upload do mesmo arquivo com o novo ticket
              }
            } catch {
              // Se falhar a renovação, sai do loop
            }
          }
          break;
        }
      }

      if (!uploadSuccess && !cancelRequestedRef.current) {
        errorCount++;
        const msg = lastErr instanceof Error ? lastErr.message : 'Falha no upload';
        setQueue((prev) =>
          prev.map((it, idx) => (idx === i ? { ...it, status: 'error', error: msg } : it))
        );
      }
    }

    setIsUploading(false);
    onUploadFinished({ successCount, errorCount, newUsedBytes: lastUsedBytes });
  };

  const handleCancelUpload = () => {
    if (isUploading) {
      setIsConfirmingCancel(true);
    } else {
      onClose();
    }
  };

  const handleRemoveItem = (id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  };

  const handleClearIdle = () => {
    setQueue((prev) => prev.filter((i) => i.status === 'uploading'));
  };

  const handleZipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtractingZip(true);
    setZipStatusText(`Descompactando ${file.name}...`);
    try {
      const items = await extractFilesFromZip(file);
      enqueueItems(items);
    } catch (err: unknown) {
      setErrorAlertMessage(err instanceof Error ? err.message : 'Erro ao descompactar .zip');
    } finally {
      setIsExtractingZip(false);
      setZipStatusText(null);
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };

  if (!isOpen) return null;

  // MODO 1: DOCK MINIMIZADO (Widget flutuante no canto inferior direito)
  if (isMinimized) {
    return (
      <aside
        role="region"
        aria-label="Upload em Segundo Plano"
        onClick={() => setIsMinimized(false)}
        className="fixed bottom-5 right-5 z-[100] w-80 sm:w-96 bg-surface/95 backdrop-blur-md border border-border-subtle shadow-2xl rounded-2xl p-4 space-y-3 cursor-pointer select-none transition-all hover:border-[var(--accent-primary)]/60 animate-in slide-in-from-bottom-5 duration-200"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isUploading ? (
              <span className="material-symbols-outlined text-[20px] text-[var(--accent-primary)] animate-spin">
                sync
              </span>
            ) : errorFiles > 0 ? (
              <span className="material-symbols-outlined text-[20px] text-rose-500">
                error
              </span>
            ) : (
              <span className="material-symbols-outlined text-[20px] text-emerald-500">
                check_circle
              </span>
            )}
            <div className="min-w-0">
              <p className="text-xs font-bold text-fg truncate">
                {isUploading
                  ? `Enviando (${completedFiles}/${totalFiles})`
                  : errorFiles > 0
                    ? `Finalizado com ${errorFiles} erro(s)`
                    : `Upload concluído (${completedFiles} arquivos)`}
              </p>
              <p className="text-[10px] text-fg-muted font-mono truncate">
                {activeItem ? activeItem.relativePath : `Destino: /${currentFolder || 'raiz'}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsMinimized(false);
              }}
              className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover"
              title="Expandir Gerenciador de Uploads"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_full</span>
            </button>
            {!isUploading && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover"
                title="Fechar"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Barra de Progresso Compacta */}
        <div className="space-y-1">
          <div className="w-full h-1.5 bg-app rounded-full overflow-hidden border border-border-subtle/50">
            <div
              className={`h-full transition-all duration-300 ${
                errorFiles > 0 && !isUploading
                  ? 'bg-amber-500'
                  : completedFiles === totalFiles && totalFiles > 0
                    ? 'bg-emerald-500'
                    : 'bg-[var(--accent-primary)]'
              }`}
              style={{ width: `${overallPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[10px] text-fg-muted font-mono">
            <span>{overallPercent}%</span>
            <span>
              {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
            </span>
          </div>
        </div>
      </aside>
    );
  }

  // MODO 2: MODAL COMPLETO (Popup Centralizado com Confirmação e Acompanhamento)
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl bg-surface border border-border-subtle rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounterRef.current++;
          setIsDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = 'copy';
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounterRef.current--;
          if (dragCounterRef.current <= 0) {
            setIsDragOver(false);
          }
        }}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          dragCounterRef.current = 0;
          setIsDragOver(false);
          if (e.dataTransfer) {
            const items = await extractFilesFromDataTransfer(e.dataTransfer);
            enqueueItems(items);
          }
        }}
      >
        {/* Cabeçalho do Modal */}
        <div className="h-14 px-5 border-b border-border-subtle flex items-center justify-between bg-elevated/60 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 flex items-center justify-center text-[var(--accent-primary)]">
              <span className="material-symbols-outlined text-[20px]">cloud_upload</span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-fg leading-tight">
                Gerenciador de Uploads
              </h3>
              <p className="text-[11px] text-fg-muted font-mono truncate">
                Destino no Servidor:{' '}
                <span className="text-[var(--accent-secondary)] font-bold">
                  📁 /{effectiveTargetFolder || 'raiz'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsMinimized(true)}
              className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors flex items-center gap-1 text-xs font-semibold"
              title="Minimizar para o canto da tela e continuar navegando"
            >
              <span className="material-symbols-outlined text-[18px]">minimize</span>
              <span className="hidden sm:inline">Minimizar</span>
            </button>
            <button
              type="button"
              onClick={handleCancelUpload}
              className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
              title="Fechar (Esc)"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Barra de Seleção / Confirmação de Pasta de Destino */}
        <div className="bg-surface/90 border-b border-border-subtle px-5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-fg-muted font-medium text-[11px]">Enviar arquivos para:</span>
            <span className="font-mono font-bold text-[var(--accent-secondary)] bg-[var(--accent-secondary)]/10 px-2.5 py-0.5 rounded-md border border-[var(--accent-secondary)]/20 text-xs">
              📁 /{effectiveTargetFolder || 'raiz'}
            </span>
          </div>

          {!isUploading && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-fg-muted mr-1">Atalho de Destino:</span>
              <button
                type="button"
                onClick={() => handleSetTargetFolder('Portfolio')}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1 shadow-sm ${
                  effectiveTargetFolder.toLowerCase() === 'portfolio' || effectiveTargetFolder.toLowerCase() === 'portifolio'
                    ? 'bg-[#FFCC00]/20 border-[#FFCC00] text-[#FFCC00]'
                    : 'bg-surface hover:bg-surface-hover border-border-subtle text-fg hover:border-[#FFCC00]/60'
                }`}
                title="Direcionar envio para a pasta de Portfólio (com publicação automática)"
              >
                <span className="material-symbols-outlined text-[15px] text-[#FFCC00]">photo_library</span>
                <span>📸 Portfólio</span>
              </button>

              <button
                type="button"
                onClick={() => handleSetTargetFolder('')}
                className={`px-2.5 py-1 rounded-lg border text-[11px] font-bold transition-all flex items-center gap-1 shadow-sm ${
                  !effectiveTargetFolder
                    ? 'bg-[var(--accent-primary)]/20 border-[var(--accent-primary)] text-[var(--accent-primary)]'
                    : 'bg-surface hover:bg-surface-hover border-border-subtle text-fg hover:border-fg-muted'
                }`}
                title="Direcionar envio para a raiz do Cofre"
              >
                <span className="material-symbols-outlined text-[15px]">home</span>
                <span>Raiz</span>
              </button>
            </div>
          )}
        </div>

        {/* Inputs Ocultos de Seleção */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              enqueueItems(extractFilesFromFileList(e.target.files));
              e.target.value = '';
            }
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory suportado em navegadores modernos
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              enqueueItems(extractFilesFromFileList(e.target.files));
              e.target.value = '';
            }
          }}
        />
        <input
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          className="hidden"
          onChange={handleZipSelect}
        />

        {/* Conteúdo Central */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Zona de Drop Interativa & Botões de Adição */}
          <div
            className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all ${
              isDragOver
                ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/10 scale-[1.01]'
                : 'border-border-subtle bg-app/50 hover:border-[var(--accent-primary)]/50'
            }`}
          >
            <span
              className={`material-symbols-outlined text-[36px] mb-1.5 block ${
                isDragOver ? 'text-[var(--accent-secondary)] animate-bounce' : 'text-fg-muted'
              }`}
            >
              {isDragOver ? 'file_download' : 'drive_folder_upload'}
            </span>
            <p className="text-xs font-bold text-fg">
              {isDragOver
                ? 'Solte os arquivos ou pastas aqui!'
                : 'Arraste múltiplos arquivos, pastas ou pacotes ZIP para cá'}
            </p>
            <p className="text-[11px] text-fg-muted mb-3 font-mono">
              Suporta múltiplas pastas, subpastas e pacotes ZIP simultaneamente
            </p>

            {/* Botões Rápidos de Adição */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                disabled={isUploading || isExtractingZip}
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px] text-[var(--accent-primary)]">
                  upload_file
                </span>
                <span>Escolher Arquivos</span>
              </button>

              <button
                type="button"
                disabled={isUploading || isExtractingZip}
                onClick={() => folderInputRef.current?.click()}
                className="px-3 py-1.5 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                title="Selecione uma pasta para a fila. Você pode adicionar múltiplas pastas sequencialmente."
              >
                <span className="material-symbols-outlined text-[16px] text-[var(--accent-secondary)]">
                  folder_open
                </span>
                <span>{queue.length > 0 ? '+ Adicionar Outra Pasta' : 'Escolher Pasta(s)'}</span>
              </button>

              <button
                type="button"
                disabled={isUploading || isExtractingZip}
                onClick={() => zipInputRef.current?.click()}
                className="px-3 py-1.5 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[16px] text-[#00E5FF]">
                  folder_zip
                </span>
                <span>Pacote .ZIP</span>
              </button>
            </div>

            {/* Dica de usabilidade para envio de múltiplas pastas */}
            <div className="mt-3.5 text-[11px] text-fg-muted bg-surface/70 border border-border-subtle rounded-xl px-3 py-2 max-w-lg mx-auto flex items-start sm:items-center gap-2 text-left">
              <span className="material-symbols-outlined text-[16px] text-[var(--accent-secondary)] shrink-0 mt-0.5 sm:mt-0">
                info
              </span>
              <p className="leading-snug">
                <span className="text-fg font-semibold">Para enviar várias pastas:</span> Arraste múltiplas pastas juntas do seu explorador para cá, selecione a pasta-mãe que reúne todas elas, ou use o botão <strong>+ Outra Pasta</strong> para enfileirar uma a uma.
              </p>
            </div>

            {isExtractingZip && (
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 text-xs font-bold text-[var(--accent-primary)]">
                <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                <span>{zipStatusText}</span>
              </div>
            )}
          </div>

          {/* Fila de Arquivos Selecionados */}
          {queue.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-fg">
                    Fila de Envio ({queue.length} {queue.length === 1 ? 'arquivo' : 'arquivos'}{distinctFolders > 1 ? ` em ${distinctFolders} pastas` : ''})
                  </span>
                  <span className="text-fg-muted font-mono">
                    • {formatBytes(totalBytes)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {!isUploading && errorFiles > 0 && (
                    <button
                      type="button"
                      onClick={handleRetryFailed}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 text-[11px] font-bold flex items-center gap-1 transition-colors"
                      title="Reiniciar envio apenas dos arquivos que falharam"
                    >
                      <span className="material-symbols-outlined text-[14px]">refresh</span>
                      <span>Reenviar Falhas ({errorFiles})</span>
                    </button>
                  )}
                  {!isUploading && (
                    <>
                      <button
                        type="button"
                        onClick={() => folderInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-hover text-fg border border-border-subtle text-[11px] font-bold flex items-center gap-1 transition-colors hover:border-[var(--accent-secondary)]/50"
                        title="Adicionar mais uma pasta na fila antes de enviar"
                      >
                        <span className="material-symbols-outlined text-[14px] text-[var(--accent-secondary)]">
                          create_new_folder
                        </span>
                        <span>+ Outra Pasta</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-hover text-fg border border-border-subtle text-[11px] font-bold flex items-center gap-1 transition-colors hover:border-[var(--accent-primary)]/50"
                        title="Adicionar mais arquivos avulsos na fila"
                      >
                        <span className="material-symbols-outlined text-[14px] text-[var(--accent-primary)]">
                          add
                        </span>
                        <span>+ Arquivos</span>
                      </button>
                    </>
                  )}
                  {!isUploading && idleFiles > 0 && (
                    <button
                      type="button"
                      onClick={handleClearIdle}
                      className="text-[11px] font-semibold text-fg-muted hover:text-rose-500 transition-colors ml-1"
                    >
                      Limpar Fila
                    </button>
                  )}
                </div>
              </div>

              {/* Lista Scrollável de Itens */}
              <div className="border border-border-subtle rounded-xl overflow-hidden divide-y divide-border-subtle max-h-56 overflow-y-auto bg-app/30">
                {queue.map((item) => {
                  const { icon, color } = getFileIcon(item.file.name);
                  return (
                    <div
                      key={item.id}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-surface/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span className={`material-symbols-outlined text-[18px] shrink-0 ${color}`}>
                          {icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-fg truncate" title={item.file.name}>
                            {item.file.name}
                          </p>
                          <p className="text-[10px] text-fg-muted font-mono truncate">
                            📁 /{item.targetFolder || 'raiz'} • {formatBytes(item.file.size)}
                          </p>
                        </div>
                      </div>

                      {/* Status / Ações do Item */}
                      <div className="flex items-center gap-2 shrink-0">
                        {item.status === 'idle' && (
                          <span className="text-[10px] font-bold text-fg-muted bg-surface px-2 py-0.5 rounded border border-border-subtle">
                            Pendente
                          </span>
                        )}

                        {item.status === 'uploading' && (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--accent-primary)]">
                            <span className="material-symbols-outlined text-[15px] animate-spin">
                              sync
                            </span>
                            <span>{item.progressPercent || 0}%</span>
                          </div>
                        )}

                        {item.status === 'success' && (
                          <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-500">
                            <span className="material-symbols-outlined text-[16px]">check_circle</span>
                            <span>Enviado</span>
                          </div>
                        )}

                        {item.status === 'error' && (
                          <div className="flex flex-col items-end gap-0.5 max-w-[220px] text-right">
                            <div className="flex items-center gap-1 text-[11px] font-bold text-rose-500">
                              <span className="material-symbols-outlined text-[15px]">error</span>
                              <span>Erro</span>
                            </div>
                            {item.error && (
                              <p
                                className="text-[10px] text-rose-400 font-mono truncate max-w-full"
                                title={item.error}
                              >
                                {item.error}
                              </p>
                            )}
                          </div>
                        )}

                        {!isUploading && item.status !== 'success' && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 rounded text-fg-muted hover:text-rose-500 hover:bg-surface-hover"
                            title="Remover da fila"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Rodapé: Barra Global de Progresso & Ações */}
        <div className="p-4 border-t border-border-subtle bg-elevated/40 space-y-3 shrink-0">
          {/* Barra Global de Progresso */}
          {queue.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="font-bold text-fg">
                  {isUploading
                    ? `Enviando: ${completedFiles + 1} de ${totalFiles}...`
                    : completedFiles === totalFiles && totalFiles > 0
                      ? 'Todos os arquivos enviados com sucesso!'
                      : errorFiles > 0 && idleFiles === 0
                        ? `${errorFiles} arquivo(s) com erro no envio`
                        : `${idleFiles} arquivo(s) aguardando confirmação`}
                </span>
                <span className="text-fg-muted">
                  {overallPercent}% ({formatBytes(uploadedBytes)} / {formatBytes(totalBytes)})
                </span>
              </div>
              <div className="w-full h-2 bg-app rounded-full overflow-hidden border border-border-subtle">
                <div
                  className={`h-full transition-all duration-300 ${
                    completedFiles === totalFiles && totalFiles > 0
                      ? 'bg-emerald-500'
                      : errorFiles > 0 && !isUploading
                        ? 'bg-rose-500'
                        : 'bg-[var(--accent-primary)]'
                  }`}
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Botões de Ação do Rodapé (Sem "Minimizar" duplicado) */}
          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-2">
              {!isUploading && errorFiles > 0 && (
                <button
                  type="button"
                  onClick={handleRetryFailed}
                  className="px-3 py-2 rounded-xl text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  <span>Tentar Novamente ({errorFiles} com erro)</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {isUploading ? (
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-rose-500 hover:bg-rose-500/10 border border-rose-500/30 transition-colors"
                >
                  Cancelar Envio
                </button>
              ) : completedFiles === totalFiles && totalFiles > 0 ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  <span>Concluir</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
                  >
                    Fechar
                  </button>
                  <button
                    type="button"
                    disabled={queue.length === 0 || (idleFiles === 0 && errorFiles === 0)}
                    onClick={() => {
                      if (idleFiles === 0 && errorFiles > 0) {
                        handleRetryFailed();
                      }
                      void handleStartUpload();
                    }}
                    className="px-5 py-2 rounded-xl bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] text-xs font-black transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[18px]">rocket_launch</span>
                    <span>
                      {idleFiles > 0
                        ? `Iniciar Envio (${idleFiles}${distinctFolders > 1 ? ` • ${distinctFolders} pastas` : ''})`
                        : `Reenviar (${errorFiles} arquivos)`}
                    </span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Diálogo de Confirmação Interno da Plataforma */}
      <VaultActionDialog
        isOpen={isConfirmingCancel}
        mode="danger"
        icon="stop_circle"
        title="Interromper Envio?"
        description="Deseja interromper o upload dos arquivos restantes? Os arquivos já enviados com sucesso permanecerão seguros no servidor."
        confirmLabel="Sim, Interromper"
        cancelLabel="Continuar Enviando"
        onConfirm={() => {
          setIsConfirmingCancel(false);
          cancelRequestedRef.current = true;
        }}
        onCancel={() => setIsConfirmingCancel(false)}
      />

      {/* Alerta de Erro Interno da Plataforma (Sem window.alert) */}
      <VaultActionDialog
        isOpen={Boolean(errorAlertMessage)}
        mode="alert"
        icon="error"
        title="Aviso de Upload"
        description={errorAlertMessage || ''}
        confirmLabel="Entendido"
        onConfirm={() => setErrorAlertMessage(null)}
        onCancel={() => setErrorAlertMessage(null)}
      />
    </div>
  );
}
