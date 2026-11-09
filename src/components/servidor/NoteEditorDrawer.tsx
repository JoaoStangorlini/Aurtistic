// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect } from 'react';
import { readTenantNoteDirect, saveTenantNoteDirect } from '@/lib/edge-client';
import { syncUserFileIndexAction } from '@/app/(dashboard)/servidor/actions';
import type { EdgeMutationResponse } from '@/types';

export interface NoteEditorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  folderPath: string;
  initialRelativePath?: string | null;
  initialFilename?: string;
  ticket: string;
  serverUrl?: string;
  linkedTaskId?: string | null;
  onSaved?: (mutation: EdgeMutationResponse) => void;
}

export function NoteEditorDrawer({
  isOpen,
  onClose,
  folderPath,
  initialRelativePath,
  initialFilename = '',
  ticket,
  serverUrl,
  linkedTaskId,
  onSaved,
}: NoteEditorDrawerProps) {
  const [filename, setFilename] = useState(
    initialRelativePath
      ? initialRelativePath.split('/').pop() || 'nota.md'
      : initialFilename || 'briefing.md'
  );
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [prevPath, setPrevPath] = useState(initialRelativePath);

  if (isOpen !== prevIsOpen || initialRelativePath !== prevPath) {
    setPrevIsOpen(isOpen);
    setPrevPath(initialRelativePath);
    if (isOpen) {
      setError(null);
      setStatusMessage(null);
      if (initialRelativePath) {
        setFilename(initialRelativePath.split('/').pop() || 'nota.md');
      } else {
        setFilename(initialFilename || 'briefing.md');
        setContent('# Anotações\n\n');
      }
    }
  }

  useEffect(() => {
    let ignore = false;
    if (!isOpen) return;

    if (initialRelativePath) {
      readTenantNoteDirect({
        relativePath: initialRelativePath,
        ticket,
        serverUrl,
      })
        .then((res) => {
          if (!ignore) {
            setContent(res.content || '');
            setLoading(false);
          }
        })
        .catch((err: unknown) => {
          if (!ignore) {
            setError(err instanceof Error ? err.message : 'Erro ao abrir nota.');
            setLoading(false);
          }
        });
    }

    return () => {
      ignore = true;
    };
  }, [isOpen, initialRelativePath, ticket, serverUrl]);

  if (!isOpen) return null;

  const targetFolder = initialRelativePath
    ? initialRelativePath.split('/').slice(0, -1).join('/')
    : folderPath || '';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setStatusMessage(null);

    try {
      const mutation = await saveTenantNoteDirect({
        folderPath: targetFolder,
        filename: filename.trim() || 'nota.md',
        content,
        ticket,
        serverUrl,
      });

      await syncUserFileIndexAction({
        mutation,
        ecosystemLinks: linkedTaskId ? { addTaskIds: [linkedTaskId] } : undefined,
      });

      setStatusMessage('Nota salva e sincronizada!');
      onSaved?.(mutation);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar nota.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl bg-surface border-l border-border-subtle h-full flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-subtle flex items-center justify-between gap-3 bg-app">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="material-symbols-outlined text-[#FFCC00] text-[22px]">
              edit_note
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-fg truncate">
                {initialRelativePath ? `Editando: ${filename}` : 'Nova Nota (.md / .txt)'}
              </h3>
              <p className="text-[11px] text-fg-muted truncate">
                Pasta: /{targetFolder || 'Raiz'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
            aria-label="Fechar editor de notas"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSave} className="flex-1 flex flex-col p-5 gap-4 overflow-hidden">
          <div>
            <label className="block text-xs font-bold text-fg-secondary uppercase tracking-wider mb-1.5">
              Nome do Arquivo
            </label>
            <input
              type="text"
              value={filename}
              disabled={Boolean(initialRelativePath)}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="ex: roteiro-video.md"
              className="w-full bg-app border border-border-subtle focus:border-[#9D4EDD] rounded-lg px-3.5 py-2 text-sm text-fg outline-none disabled:opacity-60"
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-[#F14343]/10 border border-[#F14343]/40 text-xs text-[#ffb4ab]">
              {error}
            </div>
          )}

          {statusMessage && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
              {statusMessage}
            </div>
          )}

          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-fg-secondary uppercase tracking-wider">
                Conteúdo Markdown / Texto
              </label>
              <span className="text-[11px] text-fg-muted">
                {new Blob([content]).size} bytes
              </span>
            </div>

            {loading ? (
              <div className="flex-1 bg-app border border-border-subtle rounded-xl flex items-center justify-center text-sm text-fg-secondary">
                Carregando nota do servidor...
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Escreva suas ideias, checklist ou documentação aqui..."
                className="flex-1 w-full bg-app border border-border-subtle focus:border-[#9D4EDD] rounded-xl p-4 text-sm text-[#E5E2E1] font-mono leading-relaxed resize-none outline-none"
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-border-subtle">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-border-subtle text-xs font-bold text-fg-secondary hover:text-fg hover:bg-surface-hover transition-colors"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving || loading}
              className="px-5 py-2 rounded-lg bg-[#FFCC00] hover:bg-[#e6b800] text-[#121212] text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              {saving ? 'Salvando...' : 'Salvar Nota'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

