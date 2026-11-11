// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { UploadItem } from '@/lib/file-upload-helpers';
import {
  extractFilesFromDataTransfer,
  extractFilesFromFileList,
  extractFilesFromZip,
} from '@/lib/file-upload-helpers';
import { VaultActionDialog } from './VaultActionDialog';
import { useVaultUpload, type QueuedUploadItem } from '@/contexts/VaultUploadContext';

export type { QueuedUploadItem };

export interface VaultUploadManagerModalProps {
  isOpen?: boolean;
  onClose?: () => void;
  initialItems?: UploadItem[];
  currentFolder?: string;
  ticket?: string;
  serverUrl?: string;
  selectedOrgId?: string | null;
  onUploadFinished?: (results: {
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
  selectedOrgId,
  onUploadFinished,
}: VaultUploadManagerModalProps) {
  const uploadCtx = useVaultUpload();

  const isModalOpen = isOpen !== undefined ? isOpen : uploadCtx.isModalOpen;
  const handleClose = onClose || uploadCtx.closeModal;
  const isMinimized = uploadCtx.isMinimized;
  const setIsMinimized = uploadCtx.setIsMinimized;
  const queue = uploadCtx.queue;
  const isUploading = uploadCtx.isUploading;
  const totalFiles = uploadCtx.totalFiles;
  const completedFiles = uploadCtx.completedFiles;
  const errorFiles = uploadCtx.errorFiles;
  const idleFiles = uploadCtx.idleFiles;
  const activeItem = uploadCtx.activeItem;
  const totalBytes = uploadCtx.totalBytes;
  const uploadedBytes = uploadCtx.uploadedBytes;
  const overallPercent = uploadCtx.overallPercent;
  const enqueueItems = uploadCtx.enqueueItems;
  const handleStartUpload = uploadCtx.startUpload;
  const handleRetryFailed = uploadCtx.retryFailed;
  const handleRemoveItem = uploadCtx.removeItem;
  const handleClearIdle = uploadCtx.clearFinished;
  const cancelAll = uploadCtx.cancelAll;

  const effectiveTargetFolder =
    uploadCtx.overrideFolder !== null
      ? uploadCtx.overrideFolder
      : currentFolder !== undefined
        ? currentFolder
        : uploadCtx.currentFolder || '';

  const [isDragOver, setIsDragOver] = useState(false);
  const [isExtractingZip, setIsExtractingZip] = useState(false);
  const [zipStatusText, setZipStatusText] = useState<string | null>(null);
  const [isConfirmingCancel, setIsConfirmingCancel] = useState(false);
  const [errorAlertMessage, setErrorAlertMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Sincroniza ticket caso passado via prop
  useEffect(() => {
    if (ticket) {
      uploadCtx.updateTicket(ticket);
    }
  }, [ticket, uploadCtx]);

  const prevInitialItemsRef = useRef<UploadItem[] | undefined>(undefined);
  useEffect(() => {
    if (isModalOpen && initialItems && initialItems.length > 0 && initialItems !== prevInitialItemsRef.current) {
      prevInitialItemsRef.current = initialItems;
      enqueueItems(initialItems, currentFolder, selectedOrgId);
    }
  }, [isModalOpen, initialItems, enqueueItems, currentFolder, selectedOrgId]);

  const lastReportedTimeRef = useRef(0);
  useEffect(() => {
    if (
      uploadCtx.lastCompletedUploadTime > 0 &&
      uploadCtx.lastCompletedUploadTime !== lastReportedTimeRef.current
    ) {
      lastReportedTimeRef.current = uploadCtx.lastCompletedUploadTime;
      if (uploadCtx.lastUploadResults) {
        onUploadFinished?.(uploadCtx.lastUploadResults);
      }
    }
  }, [uploadCtx.lastCompletedUploadTime, uploadCtx.lastUploadResults, onUploadFinished]);

  const distinctFolders = useMemo(() => {
    const foldersSet = new Set<string>();
    for (const it of queue) {
      if (it.targetFolder) foldersSet.add(it.targetFolder);
    }
    return foldersSet.size;
  }, [queue]);

  const handleSetTargetFolder = (newFolder: string) => {
    uploadCtx.setOverrideFolder(newFolder);
  };

  const handleCancelUpload = () => {
    if (isUploading) {
      setIsConfirmingCancel(true);
    } else {
      handleClose();
    }
  };

  const handleZipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsExtractingZip(true);
    setZipStatusText(`Descompactando ${file.name}...`);
    try {
      const items = await extractFilesFromZip(file);
      enqueueItems(items, effectiveTargetFolder, selectedOrgId);
    } catch (err: unknown) {
      setErrorAlertMessage(err instanceof Error ? err.message : 'Erro ao descompactar .zip');
    } finally {
      setIsExtractingZip(false);
      setZipStatusText(null);
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };



  if (!isModalOpen || isMinimized) return null;

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
                  onClick={handleClose}
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">check</span>
                  <span>Concluir</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
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
          cancelAll();
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
