// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useState } from 'react';
import type { EdgeVaultEntry, Task, UserFileIndexRow } from '@/types';
import { buildTenantStreamUrl, buildTenantThumbUrl } from '@/lib/edge-urls';
import { readTenantNoteDirect } from '@/lib/edge-client';
import { updateFileEcosystemLinksAction } from '@/app/(dashboard)/servidor/actions';

export interface VaultPreviewPanelProps {
  entry: EdgeVaultEntry | null;
  isOpen: boolean;
  onClose: () => void;
  ticket: string;
  serverUrl?: string;
  indexedRow?: UserFileIndexRow;
  availableTasks?: Task[];
  onOpenNoteEditor?: (relativePath: string) => void;
  onOpenEcosystemMenu?: (entry: EdgeVaultEntry) => void;
  onEcosystemUpdated?: () => void;
}

export function VaultPreviewPanel({
  entry,
  isOpen,
  onClose,
  ticket,
  serverUrl,
  indexedRow,
  availableTasks = [],
  onOpenNoteEditor,
  onOpenEcosystemMenu,
  onEcosystemUpdated,
}: VaultPreviewPanelProps) {
  // Estado de leitura assíncrona de notas .md / .txt
  const [noteContent, setNoteContent] = useState<string | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Estado para seletor rápido de tarefas
  const [showTaskSelector, setShowTaskSelector] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Atalhos de teclado (Alt+P, Escape) com proteção contra digitação
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (/^(INPUT|TEXTAREA|SELECT)$/i.test(target.tagName) || target.isContentEditable);

      if (isTyping) return;

      if (e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Carrega conteúdo real para arquivos .md e .txt com AbortController
  useEffect(() => {
    if (!isOpen || !entry) return;

    const isTextFile =
      entry.kind === 'note' ||
      entry.name.endsWith('.md') ||
      entry.name.endsWith('.txt');

    if (!isTextFile) return;

    const controller = new AbortController();
    queueMicrotask(() => {
      setLoadingNote(true);
      setNoteError(null);
    });

    readTenantNoteDirect({
      relativePath: entry.relativePath,
      ticket,
      serverUrl,
      signal: controller.signal,
    })
      .then((res) => {
        setNoteContent(res.content);
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setNoteError(err.message || 'Erro ao carregar texto.');
        }
      })
      .finally(() => {
        setLoadingNote(false);
      });

    return () => controller.abort();
  }, [isOpen, entry, ticket, serverUrl]);

  if (!isOpen) return null;

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  const isImage = entry?.kind === 'image';
  const isAudio = entry?.kind === 'audio';
  const isVideo = entry?.kind === 'video';
  const isNote = entry?.kind === 'note' || entry?.name.endsWith('.md') || entry?.name.endsWith('.txt');
  const isPdf = entry?.kind === 'pdf';

  const streamUrl = entry
    ? buildTenantStreamUrl(entry.relativePath, ticket, { serverUrl })
    : '';
  const thumbUrl = entry && isImage
    ? buildTenantThumbUrl(entry.relativePath, ticket, { serverUrl, width: 720 })
    : '';

  const exif = entry?.exifData || indexedRow?.exif_data || {};

  const inPortfolio = Boolean(indexedRow?.show_in_portfolio);
  const inCurriculum = Boolean(indexedRow?.show_in_curriculum);
  const isFavorite = Boolean(indexedRow?.is_favorite);
  const linkedTaskIds = indexedRow?.linked_task_ids || (indexedRow?.linked_task_id ? [indexedRow.linked_task_id] : []);

  // Handlers dos 4 Pilares
  const handleTogglePortfolio = async () => {
    if (!entry) return;
    setBusyAction('portfolio');
    try {
      const nextVal = !inPortfolio;
      await updateFileEcosystemLinksAction({
        relativePath: entry.relativePath,
        filename: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        patch: {
          showInPortfolio: nextVal,
          visibility: nextVal ? 'public' : 'private',
        },
      });
      onEcosystemUpdated?.();
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleCurriculum = async () => {
    if (!entry) return;
    setBusyAction('curriculum');
    try {
      const nextVal = !inCurriculum;
      await updateFileEcosystemLinksAction({
        relativePath: entry.relativePath,
        filename: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        patch: {
          showInCurriculum: nextVal,
          visibility: nextVal ? 'public' : 'private',
        },
      });
      onEcosystemUpdated?.();
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleResumoFavorite = async () => {
    if (!entry) return;
    setBusyAction('resumo');
    try {
      const nextVal = !isFavorite;
      await updateFileEcosystemLinksAction({
        relativePath: entry.relativePath,
        filename: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        patch: {
          isFavorite: nextVal,
          showInPortfolio: true,
          visibility: 'public',
        },
      });
      onEcosystemUpdated?.();
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleTaskLink = async (taskId: string) => {
    if (!entry) return;
    setBusyAction(taskId);
    try {
      const isLinked = linkedTaskIds.includes(taskId);
      await updateFileEcosystemLinksAction({
        relativePath: entry.relativePath,
        filename: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        patch: isLinked
          ? { removeTaskIds: [taskId] }
          : { addTaskIds: [taskId] },
      });
      onEcosystemUpdated?.();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <aside
      data-tour="vault-preview-pane"
      className="w-full sm:w-80 lg:w-96 bg-surface border-l border-border-subtle flex flex-col shrink-0 h-full overflow-hidden shadow-lg z-20 animate-in slide-in-from-right duration-200"
    >
      {/* Topo do Painel de Visualização */}
      <div className="h-10 px-4 py-2 border-b border-border-subtle flex items-center justify-between bg-elevated/60">
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-symbols-outlined text-[18px] text-[var(--accent-primary)]">
            view_sidebar
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-fg-secondary truncate">
            Painel de Inspeção
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span
            className="text-[10px] font-mono text-fg-muted bg-app px-1.5 py-0.5 rounded border border-border-subtle hidden sm:inline"
            title="Atalho de teclado"
          >
            Alt+P
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
            title="Fechar painel (Esc)"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      </div>

      {!entry ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-fg-muted">
          <span className="material-symbols-outlined text-[48px] opacity-40 mb-2">
            touch_app
          </span>
          <p className="text-xs font-semibold text-fg-secondary">
            Nenhum item selecionado
          </p>
          <p className="text-[11px] mt-1 max-w-[200px]">
            Clique em qualquer arquivo da lista ou árvore para inspecionar metadados, EXIF e pré-visualizar.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Header do Arquivo */}
          <div className="space-y-1">
            <h4
              className="text-sm font-bold text-fg break-all"
              title={entry.name}
            >
              {entry.name}
            </h4>
            <div className="flex items-center gap-2 text-[11px] text-fg-muted font-mono flex-wrap">
              <span>{formatBytes(entry.sizeBytes)}</span>
              <span>•</span>
              <span className="capitalize">{entry.kind}</span>
              {entry.modifiedAt && (
                <>
                  <span>•</span>
                  <span>{new Date(entry.modifiedAt).toLocaleDateString('pt-BR')}</span>
                </>
              )}
            </div>
            <p className="text-[10px] text-fg-muted font-mono truncate" title={entry.relativePath}>
              {entry.relativePath}
            </p>
          </div>

          {/* Área Visual Principal */}
          <div className="rounded-xl overflow-hidden border border-border-subtle bg-app flex items-center justify-center min-h-[160px] max-h-[300px] relative">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbUrl || streamUrl}
                alt={entry.name}
                className="max-h-[300px] w-full object-contain p-2"
                onError={(e) => {
                  const target = e.currentTarget;
                  if (!target.dataset.fallback) {
                    target.dataset.fallback = 'true';
                    target.src = streamUrl;
                  }
                }}
              />
            ) : isAudio ? (
              <div className="p-4 w-full flex flex-col items-center justify-center gap-3">
                <span className="material-symbols-outlined text-[48px] text-[var(--accent-primary)] animate-pulse">
                  graphic_eq
                </span>
                <audio controls src={streamUrl} className="w-full h-8" />
              </div>
            ) : isVideo ? (
              <video
                controls
                src={streamUrl}
                className="max-h-[260px] w-full object-contain bg-black rounded"
              />
            ) : isNote ? (
              <div className="w-full p-3 flex flex-col max-h-[280px]">
                <div className="flex items-center justify-between pb-2 border-b border-border-subtle">
                  <span className="text-[10px] font-bold text-[var(--accent-secondary)] flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">edit_note</span>
                    Texto / Markdown
                  </span>
                  {onOpenNoteEditor && (
                    <button
                      type="button"
                      onClick={() => onOpenNoteEditor(entry.relativePath)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--accent-primary)] text-[var(--accent-primary-fg,#FFFFFF)] hover:opacity-90 flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[12px]">edit</span>
                      Editar
                    </button>
                  )}
                </div>

                {loadingNote ? (
                  <div className="flex items-center justify-center py-8 text-xs text-fg-muted gap-2">
                    <span className="w-2 h-2 rounded-full bg-[var(--accent-secondary)] animate-ping" />
                    <span>Carregando texto...</span>
                  </div>
                ) : noteError ? (
                  <div className="py-4 text-xs text-rose-500 text-center">{noteError}</div>
                ) : (
                  <pre className="mt-2 text-xs font-mono text-fg bg-surface rounded-lg p-2.5 border border-border-subtle whitespace-pre-wrap overflow-y-auto max-h-[200px] leading-relaxed select-text">
                    {noteContent || '(Arquivo de texto vazio)'}
                  </pre>
                )}
              </div>
            ) : isPdf ? (
              <div className="p-4 w-full flex flex-col items-center justify-center text-center gap-2">
                <span className="material-symbols-outlined text-[42px] text-red-500">
                  picture_as_pdf
                </span>
                <a
                  href={streamUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg text-xs font-bold bg-surface hover:bg-surface-hover text-fg border border-border-subtle transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                  Abrir PDF em nova aba
                </a>
              </div>
            ) : (
              <div className="p-6 text-center text-fg-muted space-y-1">
                <span className="material-symbols-outlined text-[36px] opacity-40">
                  draft
                </span>
                <p className="text-xs">Pré-visualização direta não disponível</p>
              </div>
            )}
          </div>

          {/* Ponte dos 4 Pilares (Ações Rápidas de Ecossistema) */}
          <div className="space-y-2 pt-2 border-t border-border-subtle">
            <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
              Integração dos 4 Pilares
            </span>

            <div className="grid grid-cols-2 gap-2">
              {/* Pilar 1: Tarefas */}
              <button
                type="button"
                onClick={() => setShowTaskSelector((prev) => !prev)}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold border flex items-center justify-between gap-1.5 transition-colors ${
                  linkedTaskIds.length > 0
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                    : 'bg-elevated hover:bg-surface-hover text-fg border-border-subtle'
                }`}
                title="Vincular a Tarefas por UUID"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="material-symbols-outlined text-[16px] text-emerald-500">
                    checklist
                  </span>
                  <span className="truncate">Tarefas</span>
                </div>
                {linkedTaskIds.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-500/30">
                    {linkedTaskIds.length}
                  </span>
                )}
              </button>

              {/* Pilar 2: Portfólio */}
              <button
                type="button"
                disabled={busyAction === 'portfolio'}
                onClick={handleTogglePortfolio}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold border flex items-center justify-between gap-1.5 transition-colors ${
                  inPortfolio
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-700 dark:text-amber-300'
                    : 'bg-elevated hover:bg-surface-hover text-fg border-border-subtle'
                }`}
                title="Alternar presença no Portfólio Público"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="material-symbols-outlined text-[16px] text-amber-500">
                    photo_library
                  </span>
                  <span className="truncate">Portfólio</span>
                </div>
                <span className="material-symbols-outlined text-[14px]">
                  {inPortfolio ? 'check_circle' : 'add_circle'}
                </span>
              </button>

              {/* Pilar 3: Currículo */}
              <button
                type="button"
                disabled={busyAction === 'curriculum'}
                onClick={handleToggleCurriculum}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold border flex items-center justify-between gap-1.5 transition-colors ${
                  inCurriculum
                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-700 dark:text-blue-300'
                    : 'bg-elevated hover:bg-surface-hover text-fg border-border-subtle'
                }`}
                title="Alternar presença no Currículo Técnico"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="material-symbols-outlined text-[16px] text-blue-500">
                    badge
                  </span>
                  <span className="truncate">Currículo</span>
                </div>
                <span className="material-symbols-outlined text-[14px]">
                  {inCurriculum ? 'check_circle' : 'add_circle'}
                </span>
              </button>

              {/* Pilar 4: Resumo (Favoritas & Destaque) */}
              <button
                type="button"
                disabled={busyAction === 'resumo'}
                onClick={handleToggleResumoFavorite}
                className={`px-2.5 py-2 rounded-lg text-xs font-semibold border flex items-center justify-between gap-1.5 transition-colors ${
                  isFavorite
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-700 dark:text-purple-300'
                    : 'bg-elevated hover:bg-surface-hover text-fg border-border-subtle'
                }`}
                title="Destacar nas Obras Favoritas do Resumo (/resumo)"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="material-symbols-outlined text-[16px] text-purple-500">
                    star
                  </span>
                  <span className="truncate">Resumo</span>
                </div>
                <span className="material-symbols-outlined text-[14px]">
                  {isFavorite ? 'star' : 'star_border'}
                </span>
              </button>
            </div>

            {/* Seletor Inline de Tarefas */}
            {showTaskSelector && (
              <div className="p-2.5 rounded-xl bg-elevated border border-border-subtle space-y-2 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-fg-muted uppercase">
                    Vincular a Tarefas
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTaskSelector(false)}
                    className="text-[10px] text-fg-muted hover:text-fg"
                  >
                    Fechar
                  </button>
                </div>

                {availableTasks.length === 0 ? (
                  <p className="text-[11px] text-fg-muted italic">
                    Nenhuma tarefa cadastrada.
                  </p>
                ) : (
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {availableTasks.slice(0, 15).map((task) => {
                      const isLinked = linkedTaskIds.includes(task.id);
                      return (
                        <button
                          key={task.id}
                          type="button"
                          disabled={busyAction === task.id}
                          onClick={() => handleToggleTaskLink(task.id)}
                          className={`w-full p-1.5 rounded-lg text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                            isLinked
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-200'
                              : 'bg-surface text-fg-secondary hover:text-fg'
                          }`}
                        >
                          <span className="truncate flex-1">{task.nome}</span>
                          <span className="material-symbols-outlined text-[14px] shrink-0">
                            {isLinked ? 'check_box' : 'check_box_outline_blank'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Ações Secundárias: Menu Completo e Download */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => onOpenEcosystemMenu?.(entry)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-elevated hover:bg-surface-hover text-fg-secondary hover:text-fg border border-border-subtle flex items-center justify-center gap-1.5 transition-colors"
                title="Abrir menu avançado de metadados"
              >
                <span className="material-symbols-outlined text-[15px]">more_horiz</span>
                <span>Mais Opções</span>
              </button>

              <a
                href={streamUrl}
                download={entry.name}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-elevated hover:bg-surface-hover text-fg-secondary hover:text-fg border border-border-subtle flex items-center justify-center gap-1.5 transition-colors"
                title="Baixar arquivo bruto do HD"
              >
                <span className="material-symbols-outlined text-[15px] text-[var(--accent-primary)]">
                  download
                </span>
                <span>Download</span>
              </a>
            </div>
          </div>

          {/* Dados EXIF e Técnicos (Fotografia / Arquivo) */}
          {isImage && Object.keys(exif).length > 0 && (
            <div className="space-y-2 pt-2 border-t border-border-subtle">
              <span className="text-[11px] font-bold uppercase tracking-wider text-fg-muted">
                Metadados & EXIF
              </span>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {exif.camera && (
                  <div className="p-2 rounded-lg bg-elevated border border-border-subtle">
                    <span className="text-[10px] text-fg-muted block">Câmera</span>
                    <span className="font-semibold text-fg truncate block" title={String(exif.camera)}>
                      {String(exif.camera)}
                    </span>
                  </div>
                )}
                {exif.lens && (
                  <div className="p-2 rounded-lg bg-elevated border border-border-subtle">
                    <span className="text-[10px] text-fg-muted block">Lente</span>
                    <span className="font-semibold text-fg truncate block" title={String(exif.lens)}>
                      {String(exif.lens)}
                    </span>
                  </div>
                )}
                {(exif.fNumber || exif.aperture) && (
                  <div className="p-2 rounded-lg bg-elevated border border-border-subtle">
                    <span className="text-[10px] text-fg-muted block">Abertura</span>
                    <span className="font-semibold text-fg">
                      {String(exif.fNumber || exif.aperture)}
                    </span>
                  </div>
                )}
                {exif.focalLength && (
                  <div className="p-2 rounded-lg bg-elevated border border-border-subtle">
                    <span className="text-[10px] text-fg-muted block">Dist. Focal</span>
                    <span className="font-semibold text-fg">
                      {String(exif.focalLength)}
                    </span>
                  </div>
                )}
                {exif.iso && (
                  <div className="p-2 rounded-lg bg-elevated border border-border-subtle">
                    <span className="text-[10px] text-fg-muted block">ISO</span>
                    <span className="font-semibold text-fg">
                      ISO {String(exif.iso)}
                    </span>
                  </div>
                )}
                {exif.exposureTime && (
                  <div className="p-2 rounded-lg bg-elevated border border-border-subtle">
                    <span className="text-[10px] text-fg-muted block">Exposição</span>
                    <span className="font-semibold text-fg">
                      {String(exif.exposureTime)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
