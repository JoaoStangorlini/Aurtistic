// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import type { EdgeVaultEntry, Task, UserFileIndexRow } from '@/types';
import { updateFileEcosystemLinksAction } from '@/app/(dashboard)/servidor/actions';

export interface FileEcosystemMenuProps {
  entry: EdgeVaultEntry;
  indexRow?: UserFileIndexRow;
  availableTasks: Task[];
  onUpdated: () => void;
  onRequestRename: (entry: EdgeVaultEntry) => void;
  onRequestDelete: (entry: EdgeVaultEntry) => void;
}

export function FileEcosystemMenu({
  entry,
  indexRow,
  availableTasks,
  onUpdated,
  onRequestRename,
  onRequestDelete,
}: FileEcosystemMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [curriculumLabel, setCurriculumLabel] = useState(
    indexRow?.curriculum_label || entry.name.replace(/\.[^.]+$/, '')
  );
  const [selectedTaskId, setSelectedTaskId] = useState('');

  const inPortfolio = Boolean(indexRow?.show_in_portfolio);
  const inCurriculum = Boolean(indexRow?.show_in_curriculum);
  const isFavorite = Boolean(indexRow?.is_favorite);
  const linkedTaskIds = indexRow?.linked_task_ids || [];

  const handleTogglePortfolio = async () => {
    setBusy(true);
    try {
      const nextVal = !inPortfolio;
      const folderAlbum = entry.relativePath.startsWith('Portfolio/')
        ? entry.relativePath.split('/')[1] || 'Geral'
        : 'Geral';

      await updateFileEcosystemLinksAction({
        relativePath: entry.relativePath,
        filename: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        patch: {
          showInPortfolio: nextVal,
          album: indexRow?.album || folderAlbum,
          visibility: nextVal ? 'public' : indexRow?.visibility || 'private',
        },
      });
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const handleToggleFavorite = async () => {
    setBusy(true);
    try {
      await updateFileEcosystemLinksAction({
        relativePath: entry.relativePath,
        filename: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        patch: {
          isFavorite: !isFavorite,
        },
      });
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const handleToggleCurriculum = async () => {
    setBusy(true);
    try {
      const nextVal = !inCurriculum;
      await updateFileEcosystemLinksAction({
        relativePath: entry.relativePath,
        filename: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        patch: {
          showInCurriculum: nextVal,
          curriculumLabel: nextVal ? curriculumLabel.trim() || entry.name : null,
          visibility: nextVal ? 'public' : indexRow?.visibility || 'private',
        },
      });
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const handleAddTaskLink = async () => {
    if (!selectedTaskId) return;
    setBusy(true);
    try {
      await updateFileEcosystemLinksAction({
        relativePath: entry.relativePath,
        filename: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        patch: {
          addTaskIds: [selectedTaskId],
        },
      });
      setSelectedTaskId('');
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveTaskLink = async (taskId: string) => {
    setBusy(true);
    try {
      await updateFileEcosystemLinksAction({
        relativePath: entry.relativePath,
        filename: entry.name,
        mimeType: entry.mimeType,
        sizeBytes: entry.sizeBytes,
        patch: {
          removeTaskIds: [taskId],
        },
      });
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="p-1.5 rounded-lg bg-app/80 hover:bg-surface-hover text-fg-secondary border border-border-subtle transition-colors"
        title="Sinergia 4 Pilares (Portfólio, Tarefas, Currículo)"
      >
        <span className="material-symbols-outlined text-[18px]">hub</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
          />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute right-0 mt-1.5 w-72 bg-surface border border-border-subtle rounded-xl shadow-2xl p-3 z-50 space-y-2.5 text-left"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-fg-muted px-1">
              Conectar aos 4 Pilares
            </div>

            {/* 1. Portfólio */}
            <button
              type="button"
              disabled={busy}
              onClick={handleTogglePortfolio}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                inPortfolio
                  ? 'bg-[#FFCC00]/15 text-[#FFCC00] border-[#FFCC00]/40'
                  : 'bg-app text-fg-secondary border-border-subtle hover:border-[#FFCC00]/40'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">photo_camera</span>
                {inPortfolio ? 'Publicado no Portfólio' : 'Publicar no Portfólio'}
              </span>
              <span className="material-symbols-outlined text-[16px]">
                {inPortfolio ? 'check_circle' : 'add_circle'}
              </span>
            </button>

            {/* Favorito (Resumo) */}
            <button
              type="button"
              disabled={busy}
              onClick={handleToggleFavorite}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                isFavorite
                  ? 'bg-[#9D4EDD]/20 text-[#E0AAFF] border-[#9D4EDD]/40'
                  : 'bg-app text-fg-secondary border-border-subtle hover:border-[#9D4EDD]/40'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">star</span>
                {isFavorite ? 'Destaque no Resumo' : 'Destacar no Resumo'}
              </span>
              <span className="material-symbols-outlined text-[16px]">
                {isFavorite ? 'star' : 'star_outline'}
              </span>
            </button>

            {/* 2. Currículo Verificado */}
            <div className="p-2.5 rounded-lg bg-app border border-border-subtle space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-fg flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px] text-[#9D4EDD]">
                    verified
                  </span>
                  Currículo Verificado
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleToggleCurriculum}
                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                    inCurriculum
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-surface-hover text-fg-secondary hover:bg-[#9D4EDD] hover:text-fg'
                  }`}
                >
                  {inCurriculum ? 'Ativo ✓' : 'Vincular'}
                </button>
              </div>
              {!inCurriculum && (
                <input
                  type="text"
                  value={curriculumLabel}
                  onChange={(e) => setCurriculumLabel(e.target.value)}
                  placeholder="Rótulo do certificado..."
                  className="w-full bg-surface border border-border-subtle rounded px-2.5 py-1 text-xs text-fg outline-none"
                />
              )}
            </div>

            {/* 3. Tarefas (Multi-Tarefa linked_task_ids) */}
            <div className="p-2.5 rounded-lg bg-app border border-border-subtle space-y-2">
              <div className="text-xs font-bold text-fg flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">
                  task_alt
                </span>
                Tarefas Vinculadas ({linkedTaskIds.length})
              </div>

              {linkedTaskIds.length > 0 && (
                <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                  {linkedTaskIds.map((tid) => {
                    const taskObj = availableTasks.find((t) => t.id === tid);
                    return (
                      <span
                        key={tid}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-hover text-[11px] text-fg-secondary"
                      >
                        <span className="truncate max-w-[140px]">
                          {taskObj?.nome || tid.slice(0, 8)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveTaskLink(tid)}
                          className="text-[#F14343] hover:text-fg"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-1.5">
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className="flex-1 min-w-0 bg-surface border border-border-subtle rounded px-2 py-1 text-xs text-fg outline-none"
                >
                  <option value="">Anexar à tarefa...</option>
                  {availableTasks.slice(0, 40).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  disabled={!selectedTaskId || busy}
                  onClick={handleAddTaskLink}
                  className="px-2.5 py-1 rounded bg-[#FFCC00] text-[#121212] text-xs font-bold disabled:opacity-40"
                >
                  +
                </button>
              </div>
            </div>

            <div className="h-[1px] bg-surface-hover" />

            {/* Ações de arquivo */}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRequestRename(entry);
                }}
                className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-app hover:bg-surface-hover text-xs text-fg-secondary border border-border-subtle"
              >
                <span className="material-symbols-outlined text-[15px]">drive_file_rename_outline</span>
                Renomear
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onRequestDelete(entry);
                }}
                className="flex-1 flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#F14343]/10 hover:bg-[#F14343]/20 text-xs text-[#F14343] border border-[#F14343]/30"
              >
                <span className="material-symbols-outlined text-[15px]">delete</span>
                Lixeira
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

