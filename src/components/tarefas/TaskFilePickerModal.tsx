// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { EdgeVaultEntry } from '@/types';
import { fetchTenantDirectory, uploadTenantFileDirect } from '@/lib/edge-client';
import {
  syncUserFileIndexAction,
  updateFileEcosystemLinksAction,
} from '@/app/(dashboard)/servidor/actions';
import { formatStorageBytes } from '@/lib/edge-urls';
import {
  type UploadItem,
  extractFilesFromDataTransfer,
  extractFilesFromFileList,
  extractFilesFromZip,
  resolveItemTargetFolder,
} from '@/lib/file-upload-helpers';

export interface TaskFilePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: string;
  taskTitle?: string;
  currentlyLinkedPaths?: string[];
  ticket: string;
  serverUrl?: string;
  onLinkedUpdated: () => void;
  initialFolder?: string;
  initialTab?: 'browse' | 'upload';
}

export function TaskFilePickerModal({
  isOpen,
  onClose,
  taskId,
  taskTitle,
  currentlyLinkedPaths = [],
  ticket,
  serverUrl,
  onLinkedUpdated,
  initialFolder = '',
  initialTab = 'browse',
}: TaskFilePickerModalProps) {
  const [activeTab, setActiveTab] = useState<'browse' | 'upload'>(initialTab);

  // Estado Aba 1: Explorar Servidor (Inicia na raiz limpa do cofre ou pasta inicial)
  const [currentFolder, setCurrentFolder] = useState(initialFolder);
  const [folderEntries, setFolderEntries] = useState<EdgeVaultEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [loadingFolder, setLoadingFolder] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [linkingBusy, setLinkingBusy] = useState(false);

  // Estado Aba 2: Upload Direto (Inicia na pasta selecionada)
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [uploadTargetFolder, setUploadTargetFolder] = useState(initialFolder);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounter = useRef(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);

  const handleZipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const items = await extractFilesFromZip(file);
      if (items.length > 0) {
        setUploadItems((prev) => [...prev, ...items]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao descompactar .zip.');
    } finally {
      if (zipInputRef.current) zipInputRef.current.value = '';
    }
  };

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadFolder = async (folderPath: string) => {
    if (!ticket) return;
    setLoadingFolder(true);
    setError(null);
    try {
      const res = await fetchTenantDirectory(folderPath, ticket, {
        serverUrl,
      });
      setFolderEntries([...(res.folders || []), ...(res.files || [])]);
      setCurrentFolder(res.currentFolder || folderPath);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao listar pasta.');
    } finally {
      setLoadingFolder(false);
    }
  };

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setError(null);
      setFeedback(null);
      setSelectedPaths(new Set());
      setUploadItems([]);
      setUploadProgress(0);
      setActiveTab(initialTab);
      setCurrentFolder(initialFolder);
      setUploadTargetFolder(initialFolder);
      setIsDraggingOver(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    dragCounter.current = 0;
    if (!isOpen || !ticket) return;

    fetchTenantDirectory(currentFolder, ticket, { serverUrl })
      .then((res) => {
        if (!ignore) {
          setFolderEntries([...(res.folders || []), ...(res.files || [])]);
          setCurrentFolder(res.currentFolder || currentFolder);
          setLoadingFolder(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Falha ao listar pasta.');
          setLoadingFolder(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [isOpen, currentFolder, ticket, serverUrl]);

  if (!isOpen) return null;

  const toggleSelectPath = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const handleLinkSelected = async () => {
    if (selectedPaths.size === 0) return;
    setLinkingBusy(true);
    setError(null);
    try {
      for (const relPath of Array.from(selectedPaths)) {
        const entry = folderEntries.find((e) => e.relativePath === relPath);
        if (!entry) continue;

        await updateFileEcosystemLinksAction({
          relativePath: entry.relativePath,
          filename: entry.name,
          mimeType: entry.mimeType,
          sizeBytes: entry.sizeBytes,
          patch: {
            addTaskIds: [taskId],
          },
        });
      }

      setFeedback(`${selectedPaths.size} arquivo(s) vinculado(s) à tarefa com sucesso!`);
      setSelectedPaths(new Set());
      onLinkedUpdated();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao vincular arquivos.');
    } finally {
      setLinkingBusy(false);
    }
  };

  const handleUnlinkPath = async (relPath: string) => {
    setLinkingBusy(true);
    setError(null);
    try {
      const entry = folderEntries.find((e) => e.relativePath === relPath);
      await updateFileEcosystemLinksAction({
        relativePath: relPath,
        filename: entry?.name || relPath.split('/').pop() || 'arquivo',
        mimeType: entry?.mimeType,
        sizeBytes: entry?.sizeBytes,
        patch: {
          removeTaskIds: [taskId],
        },
      });
      setFeedback('Vínculo com a tarefa removido com sucesso!');
      onLinkedUpdated();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao desvincular arquivo.');
    } finally {
      setLinkingBusy(false);
    }
  };

  const handleUploadAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploadItems.length === 0) {
      setError('Selecione ao menos um arquivo ou pasta para upload.');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadStatus('Iniciando upload direto para o nó de armazenamento...');

    try {
      let completed = 0;
      for (const item of uploadItems) {
        const { targetFolder } = resolveItemTargetFolder(uploadTargetFolder, item.relativePath);
        setUploadStatus(`Enviando ${completed + 1}/${uploadItems.length}: ${item.relativePath}...`);
        const mutation = await uploadTenantFileDirect({
          file: item.file,
          folderPath: targetFolder,
          ticket,
          serverUrl,
          onProgress: (percent) => {
            const stepPercent = Math.round(
              (completed / uploadItems.length) * 100 + percent / uploadItems.length
            );
            setUploadProgress(stepPercent);
          },
        });

        const isPortfolio = targetFolder === 'Portfolio' || targetFolder.startsWith('Portfolio/');
        const isCurriculum = targetFolder === 'Curriculo' || targetFolder.startsWith('Curriculo/');

        // Sincronização atômica imediata vinculando aos ecossistemas correspondentes
        await syncUserFileIndexAction({
          mutation,
          ecosystemLinks: {
            ...(isPortfolio ? { showInPortfolio: true, visibility: 'public' } : {}),
            ...(isCurriculum ? { showInCurriculum: true, visibility: 'public' } : {}),
            ...(taskId ? { addTaskIds: [taskId] } : {}),
          },
        });

        completed++;
      }

      setUploadProgress(100);
      setUploadStatus('Upload concluído com sucesso!');
      onLinkedUpdated();
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro durante o upload.');
      setUploadStatus(null);
    } finally {
      setUploading(false);
    }
  };

  const filteredEntries = folderEntries.filter((ent) => {
    if (!searchFilter.trim()) return true;
    return ent.name.toLowerCase().includes(searchFilter.trim().toLowerCase());
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-file-picker-title"
      className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 md:p-6"
    >
      <div className="bg-surface border border-border-subtle rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Cabeçalho */}
        <div className="p-4 md:p-5 border-b border-border-subtle flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-app border border-border-subtle flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[#FFCC00]">attach_file</span>
            </div>
            <div>
              <h3 id="task-file-picker-title" className="text-base font-bold text-fg">
                Anexar Arquivos do Servidor
              </h3>
              <p className="text-xs text-fg-muted truncate max-w-xs md:max-w-md">
                Tarefa: <strong className="text-fg">{taskTitle || 'Tarefa Selecionada'}</strong>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Abas */}
        <div className="flex border-b border-border-subtle px-4">
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={`py-3 px-4 text-xs font-bold transition-colors flex items-center gap-2 border-b-2 ${
              activeTab === 'browse'
                ? 'border-[#FFCC00] text-[#FFCC00]'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">folder_open</span>
            Explorar Servidor
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`py-3 px-4 text-xs font-bold transition-colors flex items-center gap-2 border-b-2 ${
              activeTab === 'upload'
                ? 'border-[#9D4EDD] text-[#9D4EDD]'
                : 'border-transparent text-fg-muted hover:text-fg'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
            Fazer Upload Direto
          </button>
        </div>

        {/* Feedback / Erros */}
        {feedback && (
          <div className="mx-4 mt-3 p-3 bg-[#9D4EDD]/20 border border-[#9D4EDD]/40 text-[#d8b4fe] rounded-xl text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">check_circle</span>
            {feedback}
          </div>
        )}
        {error && (
          <div className="mx-4 mt-3 p-3 bg-[#db4437]/20 border border-[#db4437]/40 text-[#ff8a80] rounded-xl text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">error</span>
            {error}
          </div>
        )}

        {/* Conteúdo Aba 1: Explorar Servidor */}
        {activeTab === 'browse' && (
          <div className="flex-1 flex flex-col min-h-0 p-4">
            {/* Barra de Navegação e Busca */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-3">
              <div className="flex items-center gap-1.5 text-xs text-fg-muted overflow-x-auto py-1">
                <button
                  type="button"
                  onClick={() => loadFolder('')}
                  className="hover:text-fg transition-colors flex items-center gap-1 shrink-0"
                >
                  <span className="material-symbols-outlined text-[16px]">home</span>
                  Raiz
                </button>
                {currentFolder
                  .split('/')
                  .filter(Boolean)
                  .map((seg, idx, arr) => {
                    const subPath = arr.slice(0, idx + 1).join('/');
                    const isLast = idx === arr.length - 1;
                    return (
                      <React.Fragment key={subPath}>
                        <span>/</span>
                        <button
                          type="button"
                          onClick={() => loadFolder(subPath)}
                          className={`shrink-0 ${
                            isLast ? 'text-[#FFCC00] font-bold' : 'hover:text-fg'
                          }`}
                        >
                          {seg}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>

              <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted text-[16px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Filtrar arquivos..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full sm:w-48 bg-app border border-border-subtle rounded-lg pl-8 pr-3 py-1.5 text-xs text-fg placeholder-[#6E6E6E] focus:outline-none focus:border-[#FFCC00]"
                />
              </div>
            </div>

            {/* Listagem de Itens */}
            <div className="flex-1 overflow-y-auto min-h-[220px] max-h-[350px] border border-border-subtle rounded-xl bg-app p-2 divide-y divide-[#252525]">
              {loadingFolder ? (
                <div className="flex flex-col items-center justify-center p-8 text-fg-muted gap-2">
                  <span className="material-symbols-outlined animate-spin text-[24px] text-[#FFCC00]">
                    progress_activity
                  </span>
                  <span className="text-xs">Carregando pasta...</span>
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-fg-muted">
                  Nenhum arquivo ou subpasta nesta localização.
                </div>
              ) : (
                filteredEntries.map((ent) => {
                  const isLinked = currentlyLinkedPaths.includes(ent.relativePath);
                  const isSelected = selectedPaths.has(ent.relativePath);

                  if (ent.isDirectory) {
                    return (
                      <div
                        key={ent.relativePath}
                        onClick={() => loadFolder(ent.relativePath)}
                        className="flex items-center justify-between p-2.5 hover:bg-surface rounded-lg cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <span className="material-symbols-outlined text-[#FFCC00] text-[20px]">
                            folder
                          </span>
                          <span className="text-xs font-bold text-fg truncate">{ent.name}</span>
                        </div>
                        <span className="material-symbols-outlined text-fg-muted text-[16px]">
                          chevron_right
                        </span>
                      </div>
                    );
                  }

                  const isAudio = ent.mimeType.startsWith('audio/');
                  const isImage = ent.mimeType.startsWith('image/');
                  const isDoc =
                    ent.name.endsWith('.md') ||
                    ent.name.endsWith('.txt') ||
                    ent.mimeType.includes('pdf');

                  const iconName = isAudio ? 'audiotrack' : isImage ? 'image' : isDoc ? 'description' : 'draft';
                  const iconColor = isAudio ? 'text-[#9D4EDD]' : isImage ? 'text-[#00C49F]' : 'text-[#FFCC00]';

                  return (
                    <div
                      key={ent.relativePath}
                      onClick={() => !isLinked && toggleSelectPath(ent.relativePath)}
                      className={`flex items-center justify-between p-2.5 rounded-lg transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-[#9D4EDD]/20 border border-[#9D4EDD]/40'
                          : isLinked
                            ? 'opacity-60 bg-surface cursor-not-allowed'
                            : 'hover:bg-surface'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 truncate flex-1 pr-2">
                        <span className={`material-symbols-outlined text-[20px] ${iconColor}`}>
                          {iconName}
                        </span>
                        <div className="truncate flex-1">
                          <p className="text-xs font-medium text-fg truncate">{ent.name}</p>
                          <p className="text-[10px] text-fg-muted">
                            {formatStorageBytes(ent.sizeBytes)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isLinked ? (
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded bg-[#9D4EDD]/20 text-[10px] font-bold text-[#9D4EDD]">
                              Vinculado
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleUnlinkPath(ent.relativePath);
                              }}
                              disabled={linkingBusy}
                              className="px-2 py-0.5 bg-[#db4437]/20 hover:bg-[#db4437]/40 text-[#ff8a80] rounded text-[10px] font-bold transition-colors flex items-center gap-1"
                              title="Desvincular desta tarefa"
                            >
                              <span className="material-symbols-outlined text-[12px]">link_off</span>
                              Desvincular
                            </button>
                          </div>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPath(ent.relativePath)}
                            className="accent-[#9D4EDD] w-4 h-4 rounded cursor-pointer"
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Barra de Ação Inferior */}
            <div className="mt-4 flex items-center justify-between gap-3 pt-3 border-t border-border-subtle">
              <span className="text-xs text-fg-muted">
                {selectedPaths.size} selecionado(s)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-surface-hover hover:bg-[#3D3D3D] text-fg rounded-lg text-xs font-bold transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleLinkSelected}
                  disabled={selectedPaths.size === 0 || linkingBusy}
                  className="px-4 py-2 bg-[#FFCC00] hover:bg-[#e6b800] disabled:opacity-50 text-[#121212] rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-md"
                >
                  {linkingBusy ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-[16px]">
                        progress_activity
                      </span>
                      Vinculando...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">link</span>
                      Vincular Selecionados
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Conteúdo Aba 2: Upload Direto (Arquivos ou Pastas Inteiras com Drag & Drop) */}
        {activeTab === 'upload' && (
          <form onSubmit={handleUploadAndLink} className="p-5 flex flex-col gap-4">
            <div>
              <label className="block text-xs uppercase font-bold text-fg-muted tracking-wider mb-2">
                Pasta de Destino no Servidor
              </label>
              <select
                value={uploadTargetFolder}
                onChange={(e) => setUploadTargetFolder(e.target.value)}
                className="w-full bg-app border border-border-subtle rounded-xl px-3.5 py-2.5 text-xs text-fg focus:outline-none focus:border-[#9D4EDD]"
              >
                <option value="">Raiz do Cofre (Padrão)</option>
                <option value="Arquivos">Arquivos (Geral)</option>
                <option value="Projetos">Projetos</option>
                <option value="Portfolio">Portfolio (Acervo Fotográfico)</option>
                <option value="Curriculo">Curriculo</option>
              </select>
            </div>

            <div>
              <label className="block text-xs uppercase font-bold text-fg-muted tracking-wider mb-2">
                Enviar Arquivos ou Pastas
              </label>

              {/* Inputs Ocultos: Selecionar Arquivos e Selecionar Pastas */}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    const items = extractFilesFromFileList(e.target.files);
                    setUploadItems((prev) => [...prev, ...items]);
                  }
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory suportado em todos os navegadores modernos
                webkitdirectory=""
                directory=""
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files) {
                    const items = extractFilesFromFileList(e.target.files);
                    setUploadItems((prev) => [...prev, ...items]);
                  }
                }}
              />
              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip,application/x-zip-compressed"
                className="hidden"
                onChange={(e) => void handleZipSelect(e)}
              />

              {/* Zona de Drop Interativa com Suporte a Pastas e Drag & Drop */}
              <div
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragCounter.current++;
                  setIsDraggingOver(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingOver(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragCounter.current--;
                  if (dragCounter.current <= 0) {
                    setIsDraggingOver(false);
                  }
                }}
                onDrop={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  dragCounter.current = 0;
                  setIsDraggingOver(false);
                  if (e.dataTransfer) {
                    const items = await extractFilesFromDataTransfer(e.dataTransfer);
                    if (items.length > 0) {
                      setUploadItems((prev) => [...prev, ...items]);
                    }
                  }
                }}
                className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                  isDraggingOver
                    ? 'border-[#9D4EDD] bg-[#9D4EDD]/15 scale-[1.01] shadow-lg shadow-[#9D4EDD]/20'
                    : 'border-border-subtle bg-app hover:border-[#9D4EDD]'
                }`}
              >
                <span
                  className={`material-symbols-outlined text-[40px] mb-2 block ${
                    isDraggingOver ? 'text-[#FFCC00] animate-bounce' : 'text-[#9D4EDD]'
                  }`}
                >
                  {isDraggingOver ? 'drive_folder_upload' : 'cloud_upload'}
                </span>
                <p className="text-sm font-bold text-fg mb-1">
                  {isDraggingOver
                    ? 'Solte arquivos ou pastas aqui!'
                    : 'Arraste arquivos ou pastas inteiras aqui'}
                </p>
                <p className="text-xs text-fg-muted mb-4">
                  Preserva automaticamente a hierarquia de pastas e subpastas no servidor
                </p>

                {/* Botões de Escolha Rápida */}
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-2 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#9D4EDD]">attach_file</span>
                    <span>Selecionar Arquivos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="px-3.5 py-2 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">folder_open</span>
                    <span>Selecionar Pasta(s)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => zipInputRef.current?.click()}
                    className="px-3.5 py-2 bg-surface hover:bg-surface-hover text-fg border border-border-subtle rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#00E5FF]">folder_zip</span>
                    <span>Arquivo .ZIP</span>
                  </button>
                </div>
              </div>
            </div>

            {uploadItems.length > 0 && (
              <div className="bg-app border border-border-subtle rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-border-subtle mb-1 text-[11px]">
                  <span className="font-bold text-fg">
                    {uploadItems.length} item(ns) preparado(s) ({formatStorageBytes(uploadItems.reduce((acc, it) => acc + it.file.size, 0))})
                  </span>
                  <button
                    type="button"
                    onClick={() => setUploadItems([])}
                    className="text-[#F14343] hover:underline font-bold text-[10px]"
                  >
                    Limpar tudo
                  </button>
                </div>
                {uploadItems.map((item, idx) => {
                  const hasSubfolder = item.relativePath.includes('/');
                  return (
                    <div
                      key={idx}
                      className="flex justify-between items-center text-xs text-fg py-1 hover:bg-surface-hover/30 px-1.5 rounded"
                    >
                      <div className="flex items-center gap-1.5 min-w-0 pr-2">
                        <span className="material-symbols-outlined text-[14px] text-fg-muted shrink-0">
                          {hasSubfolder ? 'folder' : 'description'}
                        </span>
                        <span className="truncate font-mono text-[11px]">
                          {item.relativePath}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] text-fg-muted font-mono">
                          {formatStorageBytes(item.file.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setUploadItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-fg-muted hover:text-[#F14343] transition-colors"
                          title="Remover este arquivo"
                        >
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {uploading && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-fg-muted">
                  <span className="truncate pr-2">{uploadStatus}</span>
                  <span className="font-mono text-fg shrink-0">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-app h-2 rounded-full overflow-hidden border border-border-subtle">
                  <div
                    className="bg-[#9D4EDD] h-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border-subtle">
              <button
                type="button"
                onClick={onClose}
                disabled={uploading}
                className="px-4 py-2 bg-surface-hover hover:bg-[#3D3D3D] text-fg rounded-lg text-xs font-bold transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={uploadItems.length === 0 || uploading}
                className="px-5 py-2 bg-[#9D4EDD] hover:bg-[#8338ec] disabled:opacity-50 text-fg rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-md"
              >
                {uploading ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-[16px]">
                      progress_activity
                    </span>
                    Enviando...
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[16px]">send</span>
                    {taskId ? 'Subir e Vincular à Tarefa' : 'Subir Arquivos e Pastas'}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
