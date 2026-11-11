// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { EdgeVaultEntry, Task, UserFileIndexRow } from '@/types';
import { buildTenantStreamUrl, formatStorageBytes } from '@/lib/edge-urls';
import { readTenantNoteDirect, saveTenantNoteDirect } from '@/lib/edge-client';
import { syncUserFileIndexAction } from '@/app/(dashboard)/servidor/actions';

export interface VaultIdeWorkbenchProps {
  activeEntry: EdgeVaultEntry | null;
  ticket: string;
  serverUrl?: string;
  indexedRow?: UserFileIndexRow;
  availableTasks?: Task[];
  currentFolder: string;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onUpload: () => void;
  onUploadZip: () => void;
  onCloseActiveTab?: () => void;
  onNoteSaved?: () => void;
  onFileDrop?: (e: React.DragEvent) => void;
  subfolders?: EdgeVaultEntry[];
  onSelectSubfolder?: (folder: EdgeVaultEntry) => void;
}

export function VaultIdeWorkbench({
  activeEntry,
  ticket,
  serverUrl,
  currentFolder,
  onCreateNote,
  onCreateFolder,
  onUpload,
  onUploadZip,
  onCloseActiveTab,
  onNoteSaved,
  onFileDrop,
  subfolders,
  onSelectSubfolder,
}: VaultIdeWorkbenchProps) {
  // Estado para Notas Markdown
  const [noteContent, setNoteContent] = useState('');
  const [initialNoteContent, setInitialNoteContent] = useState('');
  const [isNoteLoading, setIsNoteLoading] = useState(false);
  const [isNoteSaving, setIsNoteSaving] = useState(false);
  const [noteStatusMessage, setNoteStatusMessage] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'edit' | 'split' | 'preview'>('split');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Estado para Visualizador de Imagens (Zoom e Pan)
  const [imageZoom, setImageZoom] = useState(1);
  const [prevEntryPath, setPrevEntryPath] = useState(activeEntry?.relativePath);
  if (activeEntry?.relativePath !== prevEntryPath) {
    setPrevEntryPath(activeEntry?.relativePath);
    setImageZoom(1);
  }

  // Arrastar e soltar na bancada
  const [isDragOver, setIsDragOver] = useState(false);

  // Carrega conteúdo de nota quando activeEntry muda
  useEffect(() => {
    if (!activeEntry) return;

    const isText =
      activeEntry.kind === 'note' ||
      activeEntry.name.endsWith('.md') ||
      activeEntry.name.endsWith('.txt');

    if (!isText) return;

    let ignore = false;
    queueMicrotask(() => {
      setIsNoteLoading(true);
      setNoteError(null);
      setNoteStatusMessage(null);
    });

    readTenantNoteDirect({
      relativePath: activeEntry.relativePath,
      ticket,
      serverUrl,
    })
      .then((res) => {
        if (!ignore) {
          const text = res.content || '';
          setNoteContent(text);
          setInitialNoteContent(text);
          setIsNoteLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          setNoteError(err instanceof Error ? err.message : 'Falha ao carregar conteúdo da nota.');
          setIsNoteLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [activeEntry, ticket, serverUrl]);


  // Salvar Nota
  const handleSaveNote = useCallback(async () => {
    if (!activeEntry) return;
    setIsNoteSaving(true);
    setNoteError(null);
    setNoteStatusMessage(null);

    const folderPath = activeEntry.relativePath.includes('/')
      ? activeEntry.relativePath.substring(0, activeEntry.relativePath.lastIndexOf('/'))
      : '';

    try {
      const mutation = await saveTenantNoteDirect({
        folderPath,
        filename: activeEntry.name,
        content: noteContent,
        ticket,
        serverUrl,
      });

      await syncUserFileIndexAction({
        mutation,
      });

      setInitialNoteContent(noteContent);
      setNoteStatusMessage('Nota salva com sucesso!');
      onNoteSaved?.();
      setTimeout(() => setNoteStatusMessage(null), 3000);
    } catch (err: unknown) {
      setNoteError(err instanceof Error ? err.message : 'Erro ao salvar a nota no cofre.');
    } finally {
      setIsNoteSaving(false);
    }
  }, [activeEntry, noteContent, ticket, serverUrl, onNoteSaved]);

  // Atalho de Teclado (Ctrl+S / Cmd+S)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        const isText =
          activeEntry &&
          (activeEntry.kind === 'note' ||
            activeEntry.name.endsWith('.md') ||
            activeEntry.name.endsWith('.txt'));

        if (isText) {
          e.preventDefault();
          void handleSaveNote();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeEntry, handleSaveNote]);

  // Auxiliares de formatação Markdown
  const insertMarkdownSyntax = (before: string, after = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = noteContent.substring(start, end);
    const replacement = `${before}${selected}${after}`;

    const newContent =
      noteContent.substring(0, start) + replacement + noteContent.substring(end);
    setNoteContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + before.length,
        end + before.length
      );
    }, 0);
  };

  // Suporte a Tab no Textarea
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newContent =
        noteContent.substring(0, start) + '  ' + noteContent.substring(end);
      setNoteContent(newContent);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const isNoteDirty = noteContent !== initialNoteContent;

  // Renderizador simples de Markdown para Preview
  const renderSimpleMarkdown = (text: string) => {
    const lines = text.split('\n');
    return (
      <div className="space-y-2 text-fg text-xs leading-relaxed font-sans">
        {lines.map((line, idx) => {
          if (line.startsWith('# ')) {
            return (
              <h1 key={idx} className="text-xl font-bold text-[var(--accent-primary)] border-b border-border-subtle pb-1.5 mt-4 mb-2">
                {line.slice(2)}
              </h1>
            );
          }
          if (line.startsWith('## ')) {
            return (
              <h2 key={idx} className="text-base font-bold text-fg border-b border-border-subtle/50 pb-1 mt-3 mb-1.5">
                {line.slice(3)}
              </h2>
            );
          }
          if (line.startsWith('### ')) {
            return (
              <h3 key={idx} className="text-sm font-semibold text-[var(--accent-secondary)] mt-2 mb-1">
                {line.slice(4)}
              </h3>
            );
          }
          if (line.startsWith('> ')) {
            return (
              <blockquote key={idx} className="border-l-2 border-[var(--accent-primary)] pl-3 text-fg-muted italic my-1">
                {line.slice(2)}
              </blockquote>
            );
          }
          if (line.startsWith('- [ ] ') || line.startsWith('- [x] ') || line.startsWith('- [X] ')) {
            const isChecked = line.startsWith('- [x] ') || line.startsWith('- [X] ');
            return (
              <div key={idx} className="flex items-center gap-2 py-0.5">
                <input
                  type="checkbox"
                  checked={isChecked}
                  readOnly
                  aria-label="Item de verificação"
                  className="rounded border-border-subtle bg-surface text-[var(--accent-primary)]"
                />
                <span className={isChecked ? 'line-through text-fg-muted' : 'text-fg'}>
                  {line.slice(6)}
                </span>
              </div>
            );
          }
          if (line.startsWith('- ') || line.startsWith('* ')) {
            return (
              <li key={idx} className="ml-4 list-disc text-fg-secondary">
                {line.slice(2)}
              </li>
            );
          }
          if (line.trim() === '') {
            return <div key={idx} className="h-2" />;
          }
          return <p key={idx}>{line}</p>;
        })}
      </div>
    );
  };

  // Ícones e cores por tipo
  const getFileBadge = (entry: EdgeVaultEntry) => {
    switch (entry.kind) {
      case 'image':
        return { icon: 'image', color: 'text-amber-400', label: 'Imagem' };
      case 'audio':
        return { icon: 'audiotrack', color: 'text-purple-400', label: 'Áudio' };
      case 'video':
        return { icon: 'movie', color: 'text-red-400', label: 'Vídeo' };
      case 'note':
        return { icon: 'edit_note', color: 'text-[var(--accent-secondary,#FFCC00)]', label: 'Nota Markdown' };
      case 'pdf':
        return { icon: 'picture_as_pdf', color: 'text-rose-500', label: 'Documento PDF' };
      case 'archive':
        return { icon: 'folder_zip', color: 'text-yellow-500', label: 'Arquivo ZIP' };
      default:
        return { icon: 'draft', color: 'text-fg-muted', label: 'Arquivo' };
    }
  };

  // Se nenhum arquivo estiver aberto, exibe o Empty State do IDE (VS Code Style)
  if (!activeEntry) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragOver(false);
          onFileDrop?.(e);
        }}
        className={`flex-1 flex flex-col items-center justify-center p-8 select-none transition-colors relative ${
          isDragOver ? 'bg-[var(--accent-primary)]/10 ring-2 ring-inset ring-[var(--accent-primary)]' : 'bg-surface/30'
        }`}
      >
        <div className="max-w-md w-full flex flex-col items-center text-center space-y-6">
          {/* Marca d'água elegante */}
          <div className="w-16 h-16 rounded-2xl bg-surface border border-border-subtle flex items-center justify-center shadow-lg text-[var(--accent-primary)]">
            <span className="material-symbols-outlined text-[32px]">account_tree</span>
          </div>

          <div>
            <h2 className="text-base font-bold text-fg">Ambiente de Edição & Cofre IDE</h2>
            <p className="text-xs text-fg-muted mt-1 leading-relaxed">
              Navegue pelas pastas na árvore à esquerda para inspecionar, ou abra um arquivo para editar diretamente aqui.
            </p>
          </div>

          {/* Ações Rápidas */}
          <div className="grid grid-cols-2 gap-2.5 w-full">
            <button
              type="button"
              onClick={onCreateNote}
              className="p-3 rounded-xl bg-surface hover:bg-surface-hover border border-border-subtle hover:border-[var(--accent-secondary)] transition-all flex items-center gap-2.5 text-left group"
            >
              <span className="material-symbols-outlined text-[20px] text-[var(--accent-secondary)] group-hover:scale-110 transition-transform">
                edit_note
              </span>
              <div>
                <div className="text-xs font-semibold text-fg">Nova Nota</div>
                <div className="text-[10px] text-fg-muted">Criar arquivo .md</div>
              </div>
            </button>

            <button
              type="button"
              onClick={onCreateFolder}
              className="p-3 rounded-xl bg-surface hover:bg-surface-hover border border-border-subtle hover:border-[var(--accent-primary)] transition-all flex items-center gap-2.5 text-left group"
            >
              <span className="material-symbols-outlined text-[20px] text-[var(--accent-primary)] group-hover:scale-110 transition-transform">
                create_new_folder
              </span>
              <div>
                <div className="text-xs font-semibold text-fg">Nova Pasta</div>
                <div className="text-[10px] text-fg-muted">Organizar cofre</div>
              </div>
            </button>

            <button
              type="button"
              onClick={onUpload}
              className="p-3 rounded-xl bg-surface hover:bg-surface-hover border border-border-subtle hover:border-emerald-500 transition-all flex items-center gap-2.5 text-left group"
            >
              <span className="material-symbols-outlined text-[20px] text-emerald-400 group-hover:scale-110 transition-transform">
                upload_file
              </span>
              <div>
                <div className="text-xs font-semibold text-fg">Subir Arquivos</div>
                <div className="text-[10px] text-fg-muted">Fotos, vídeos ou docs</div>
              </div>
            </button>

            <button
              type="button"
              onClick={onUploadZip}
              className="p-3 rounded-xl bg-surface hover:bg-surface-hover border border-border-subtle hover:border-amber-500 transition-all flex items-center gap-2.5 text-left group"
            >
              <span className="material-symbols-outlined text-[20px] text-amber-400 group-hover:scale-110 transition-transform">
                folder_zip
              </span>
              <div>
                <div className="text-xs font-semibold text-fg">Pacote .ZIP</div>
                <div className="text-[10px] text-fg-muted">Descompactar no servidor</div>
              </div>
            </button>
          </div>

          {/* Chips compactos das subpastas da pasta aberta no modo IDE */}
          {subfolders && subfolders.length > 0 && (
            <div className="w-full space-y-2 text-left bg-surface/50 border border-border-subtle p-3 rounded-2xl">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg-muted uppercase tracking-wider">
                <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">folder</span>
                <span>Subpastas neste diretório ({subfolders.length})</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {subfolders.map((sub) => (
                  <button
                    key={sub.relativePath}
                    type="button"
                    onClick={() => onSelectSubfolder?.(sub)}
                    className="px-3 py-1.5 rounded-xl bg-surface hover:bg-surface-hover border border-border-subtle hover:border-[var(--accent-primary)] text-xs text-fg flex items-center gap-2 transition-all shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[16px] text-[#FFCC00]">folder</span>
                    <span className="font-semibold">{sub.name}</span>
                    {sub.hasPin && (
                      <span className="material-symbols-outlined text-[13px] text-purple-400">lock</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Zona de Drop Direta */}
          <div className="w-full border-2 border-dashed border-border-subtle rounded-2xl p-6 text-center text-fg-muted hover:border-[var(--accent-primary)] transition-colors">
            <span className="material-symbols-outlined text-[24px] text-fg-muted mb-1 block">
              cloud_upload
            </span>
            <span className="text-xs font-medium block">
              Arraste arquivos diretamente para esta área
            </span>
            <span className="text-[10px] text-fg-muted/70 block mt-0.5">
              Destino atual: /{currentFolder || 'raiz'}
            </span>
          </div>

          {/* Dicas de Atalho */}
          <div className="flex items-center gap-4 text-[10px] text-fg-muted font-mono">
            <span><kbd className="px-1.5 py-0.5 rounded bg-surface border border-border-subtle">Alt+P</kbd> Painel Lateral</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-surface border border-border-subtle">Ctrl+S</kbd> Salvar Nota</span>
            <span><kbd className="px-1.5 py-0.5 rounded bg-surface border border-border-subtle">Esc</kbd> Fechar</span>
          </div>
        </div>
      </div>
    );
  }

  const badge = getFileBadge(activeEntry);
  const streamUrl = buildTenantStreamUrl(activeEntry.relativePath, ticket, { serverUrl });
  const isText =
    activeEntry.kind === 'note' ||
    activeEntry.name.endsWith('.md') ||
    activeEntry.name.endsWith('.txt');

  return (
    <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-app">
      {/* Barra de Título / Cabeçalho do Arquivo Ativo */}
      <div className="h-10 px-4 bg-surface border-b border-border-subtle flex items-center justify-between gap-3 text-xs shrink-0 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`material-symbols-outlined text-[18px] shrink-0 ${badge.color}`}>
            {badge.icon}
          </span>
          <span className="font-semibold text-fg truncate">{activeEntry.name}</span>
          <span className="text-[10px] text-fg-muted font-mono truncate hidden sm:inline">
            /{activeEntry.relativePath}
          </span>
          {isNoteDirty && (
            <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" title="Alterações não salvas" />
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Metadados Básicos */}
          <span className="text-[11px] font-mono text-fg-muted hidden md:inline">
            {formatStorageBytes(activeEntry.sizeBytes)}
          </span>

          {/* Ações Específicas de Texto / Nota */}
          {isText && (
            <>
              {/* Seletor de Modo de Exibição */}
              <div className="flex items-center rounded-lg bg-elevated border border-border-subtle p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setViewMode('edit')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    viewMode === 'edit'
                      ? 'bg-surface text-[var(--accent-primary)] font-bold'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                  title="Apenas Editor de Código"
                >
                  Editor
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    viewMode === 'split'
                      ? 'bg-surface text-[var(--accent-primary)] font-bold'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                  title="Editor e Visualizador Lado a Lado"
                >
                  Dividido
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('preview')}
                  className={`px-2 py-0.5 rounded transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-surface text-[var(--accent-primary)] font-bold'
                      : 'text-fg-muted hover:text-fg'
                  }`}
                  title="Apenas Pré-visualização"
                >
                  Preview
                </button>
              </div>

              {/* Botão de Salvar Nota */}
              <button
                type="button"
                onClick={() => void handleSaveNote()}
                disabled={isNoteSaving || !isNoteDirty}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isNoteDirty
                    ? 'bg-[var(--accent-primary)] text-white hover:brightness-110 shadow-sm'
                    : 'bg-surface text-fg-muted border border-border-subtle opacity-70 cursor-not-allowed'
                }`}
                title="Salvar Alterações (Ctrl+S)"
              >
                {isNoteSaving ? (
                  <span className="w-3 h-3 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <span className="material-symbols-outlined text-[15px]">save</span>
                )}
                <span>Salvar</span>
              </button>
            </>
          )}

          {/* Download Direto */}
          <a
            href={buildTenantStreamUrl(activeEntry.relativePath, ticket, { serverUrl, download: true })}
            className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
            title="Download do Arquivo"
          >
            <span className="material-symbols-outlined text-[16px]">download</span>
          </a>

          {/* Fechar Aba */}
          {onCloseActiveTab && (
            <button
              type="button"
              onClick={onCloseActiveTab}
              className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
              title="Fechar Arquivo"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          )}
        </div>
      </div>

      {/* Mensagens de Sucesso ou Erro da Nota */}
      {noteStatusMessage && (
        <div className="px-4 py-1.5 bg-emerald-500/10 border-b border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[15px]">check_circle</span>
          <span>{noteStatusMessage}</span>
        </div>
      )}
      {noteError && (
        <div className="px-4 py-1.5 bg-rose-500/10 border-b border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-[15px]">error</span>
          <span>{noteError}</span>
        </div>
      )}

      {/* Área Central de Conteúdo */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* CASO 1: NOTA MARKDOWN OU TEXTO */}
        {isText ? (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Barra de Ferramentas Markdown */}
            {viewMode !== 'preview' && (
              <div className="h-9 px-3 bg-surface/80 border-b border-border-subtle flex items-center gap-1 overflow-x-auto hide-scrollbar text-xs shrink-0">
                <button
                  type="button"
                  onClick={() => insertMarkdownSyntax('# ')}
                  className="px-2 py-1 rounded hover:bg-surface-hover text-fg font-bold text-[11px]"
                  title="Título H1"
                >
                  H1
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdownSyntax('## ')}
                  className="px-2 py-1 rounded hover:bg-surface-hover text-fg font-bold text-[11px]"
                  title="Título H2"
                >
                  H2
                </button>
                <div className="w-[1px] h-4 bg-border-subtle mx-1" />
                <button
                  type="button"
                  onClick={() => insertMarkdownSyntax('**', '**')}
                  className="p-1 rounded hover:bg-surface-hover text-fg"
                  title="Negrito (**)"
                >
                  <span className="material-symbols-outlined text-[15px]">format_bold</span>
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdownSyntax('*', '*')}
                  className="p-1 rounded hover:bg-surface-hover text-fg"
                  title="Itálico (*)"
                >
                  <span className="material-symbols-outlined text-[15px]">format_italic</span>
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdownSyntax('`', '`')}
                  className="p-1 rounded hover:bg-surface-hover text-fg font-mono text-[11px]"
                  title="Código inline (`)"
                >
                  `code`
                </button>
                <div className="w-[1px] h-4 bg-border-subtle mx-1" />
                <button
                  type="button"
                  onClick={() => insertMarkdownSyntax('> ')}
                  className="p-1 rounded hover:bg-surface-hover text-fg"
                  title="Citação (>)"
                >
                  <span className="material-symbols-outlined text-[15px]">format_quote</span>
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdownSyntax('- ')}
                  className="p-1 rounded hover:bg-surface-hover text-fg"
                  title="Lista com marcadores"
                >
                  <span className="material-symbols-outlined text-[15px]">format_list_bulleted</span>
                </button>
                <button
                  type="button"
                  onClick={() => insertMarkdownSyntax('- [ ] ')}
                  className="p-1 rounded hover:bg-surface-hover text-fg"
                  title="Caixa de seleção / Tarefa"
                >
                  <span className="material-symbols-outlined text-[15px]">check_box</span>
                </button>
              </div>
            )}

            {/* Painéis Editor e Preview */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Editor de Texto (Textarea Monospace) */}
              {(viewMode === 'edit' || viewMode === 'split') && (
                <div className="flex-1 flex flex-col min-w-0 h-full border-r border-border-subtle/50 relative">
                  {isNoteLoading ? (
                    <div className="flex-1 flex items-center justify-center text-fg-muted gap-2 text-xs">
                      <span className="w-3 h-3 rounded-full border-2 border-[var(--accent-primary)] border-t-transparent animate-spin" />
                      <span>Carregando nota...</span>
                    </div>
                  ) : (
                    <textarea
                      ref={textareaRef}
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder="Escreva suas anotações em Markdown aqui..."
                      aria-label="Editor de notas Markdown"
                      className="flex-1 w-full p-4 bg-app text-fg font-mono text-xs leading-relaxed resize-none focus:outline-none border-none hide-scrollbar selection:bg-[var(--accent-primary)]/30"
                      spellCheck={false}
                    />
                  )}
                </div>
              )}

              {/* Pré-visualização Renderizada */}
              {(viewMode === 'preview' || viewMode === 'split') && (
                <div className="flex-1 overflow-y-auto p-5 bg-surface/40 min-w-0">
                  <div className="max-w-3xl mx-auto">
                    {noteContent.trim() ? (
                      renderSimpleMarkdown(noteContent)
                    ) : (
                      <div className="text-xs text-fg-muted italic">
                        Nada para pré-visualizar ainda.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Rodapé de Status do Editor */}
            <div className="h-6 px-3 bg-surface border-t border-border-subtle flex items-center justify-between text-[10px] text-fg-muted font-mono select-none">
              <div className="flex items-center gap-3">
                <span>{noteContent.split('\n').length} linhas</span>
                <span>{noteContent.trim() ? noteContent.trim().split(/\s+/).length : 0} palavras</span>
                <span>{noteContent.length} caracteres</span>
              </div>
              <div className="flex items-center gap-2">
                <span>Markdown (UTF-8)</span>
                {isNoteDirty ? (
                  <span className="text-[var(--accent-primary)] font-semibold">● Não salvo</span>
                ) : (
                  <span className="text-emerald-400">✓ Sincronizado</span>
                )}
              </div>
            </div>
          </div>
        ) : activeEntry.kind === 'image' ? (
          /* CASO 2: VISUALIZADOR DE IMAGENS */
          <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c10] relative select-none">
            {/* Controles de Zoom */}
            <div className="absolute top-3 right-3 z-10 flex items-center gap-1 bg-surface/90 backdrop-blur-sm border border-border-subtle rounded-xl p-1 shadow-lg">
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.max(0.2, z - 0.25))}
                className="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-hover"
                title="Reduzir Zoom (-)"
              >
                <span className="material-symbols-outlined text-[16px]">remove</span>
              </button>
              <span className="px-1.5 text-[11px] font-mono text-fg font-semibold min-w-[42px] text-center">
                {Math.round(imageZoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setImageZoom((z) => Math.min(4, z + 0.25))}
                className="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-hover"
                title="Aumentar Zoom (+)"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
              </button>
              <button
                type="button"
                onClick={() => setImageZoom(1)}
                className="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-hover ml-0.5"
                title="Restaurar 100%"
              >
                <span className="material-symbols-outlined text-[16px]">restart_alt</span>
              </button>
            </div>

            {/* Imagem Centralizada */}
            <div className="flex-1 flex items-center justify-center overflow-auto p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={streamUrl}
                alt={activeEntry.name}
                style={{ transform: `scale(${imageZoom})`, transformOrigin: 'center center' }}
                className="max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-transform duration-100 ease-out"
              />
            </div>
          </div>
        ) : activeEntry.kind === 'audio' ? (
          /* CASO 3: REPRODUTOR DE ÁUDIO */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-surface/30">
            <div className="w-full max-w-md bg-surface border border-border-subtle rounded-2xl p-6 shadow-xl flex flex-col items-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <span className="material-symbols-outlined text-[32px]">audiotrack</span>
              </div>
              <div className="text-center">
                <h3 className="text-sm font-bold text-fg truncate max-w-xs">{activeEntry.name}</h3>
                <p className="text-xs text-fg-muted font-mono mt-0.5">{formatStorageBytes(activeEntry.sizeBytes)}</p>
              </div>
              <audio controls className="w-full mt-2" src={streamUrl}>
                Seu navegador não suporta reprodução de áudio.
              </audio>
            </div>
          </div>
        ) : activeEntry.kind === 'video' ? (
          /* CASO 4: REPRODUTOR DE VÍDEO */
          <div className="flex-1 flex items-center justify-center bg-black p-4">
            <video controls className="max-h-full max-w-full rounded-xl shadow-2xl" src={streamUrl}>
              Seu navegador não suporta reprodução de vídeo.
            </video>
          </div>
        ) : activeEntry.kind === 'pdf' ? (
          /* CASO 5: VISUALIZADOR DE PDF */
          <div className="flex-1 h-full bg-surface">
            <iframe
              src={streamUrl}
              title={activeEntry.name}
              className="w-full h-full border-none"
            />
          </div>
        ) : (
          /* CASO 6: ARQUIVO GENÉRICO */
          <div className="flex-1 flex flex-col items-center justify-center p-8 bg-surface/30">
            <div className="max-w-sm w-full bg-surface border border-border-subtle rounded-2xl p-6 text-center shadow-lg space-y-3">
              <span className="material-symbols-outlined text-[48px] text-fg-muted">
                description
              </span>
              <div>
                <h3 className="text-sm font-bold text-fg truncate">{activeEntry.name}</h3>
                <p className="text-xs text-fg-muted font-mono mt-0.5">
                  {formatStorageBytes(activeEntry.sizeBytes)}
                </p>
              </div>
              <div className="pt-2">
                <a
                  href={buildTenantStreamUrl(activeEntry.relativePath, ticket, { serverUrl, download: true })}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-primary)] text-white text-xs font-semibold hover:brightness-110 transition-all shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Baixar Arquivo</span>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
