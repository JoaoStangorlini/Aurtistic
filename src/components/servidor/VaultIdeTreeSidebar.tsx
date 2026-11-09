// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { EdgeVaultEntry } from '@/types';
import { fetchTenantDirectory } from '@/lib/edge-client';

export interface VaultIdeTreeSidebarProps {
  currentFolder: string;
  folders: EdgeVaultEntry[];
  files: EdgeVaultEntry[];
  unlockedPins?: string[];
  ticket?: string;
  serverUrl?: string;
  onSelectFolder: (folderPath: string, folder?: EdgeVaultEntry) => void;
  onSelectFile: (file: EdgeVaultEntry) => void;
  selectedFilePath?: string | null;
  selectedFolderPath?: string;
  onCreateNote: () => void;
  onCreateFolder: () => void;
  onUpload: () => void;
  onContextMenu?: (e: React.MouseEvent, type: 'file' | 'folder', entry: EdgeVaultEntry) => void;
}

interface DirectoryNodeData {
  loading: boolean;
  loaded: boolean;
  error?: string | null;
  folders: EdgeVaultEntry[];
  files: EdgeVaultEntry[];
}

const getFileIcon = (kind: EdgeVaultEntry['kind']) => {
  switch (kind) {
    case 'image':
      return 'image';
    case 'audio':
      return 'audiotrack';
    case 'video':
      return 'movie';
    case 'note':
      return 'edit_note';
    case 'pdf':
      return 'picture_as_pdf';
    case 'archive':
      return 'folder_zip';
    default:
      return 'draft';
  }
};

const getIconColor = (kind: EdgeVaultEntry['kind']) => {
  switch (kind) {
    case 'image':
      return 'text-amber-400';
    case 'audio':
      return 'text-purple-400';
    case 'video':
      return 'text-red-400';
    case 'note':
      return 'text-[var(--accent-secondary,#FFCC00)]';
    case 'pdf':
      return 'text-rose-500';
    case 'archive':
      return 'text-yellow-500';
    default:
      return 'text-fg-muted';
  }
};

// Componente Nó de Arquivo Folha
function TreeFileNode({
  file,
  depth,
  isSelected,
  onSelectFile,
  onContextMenu,
}: {
  file: EdgeVaultEntry;
  depth: number;
  isSelected: boolean;
  onSelectFile: (file: EdgeVaultEntry) => void;
  onContextMenu?: (e: React.MouseEvent, type: 'file' | 'folder', entry: EdgeVaultEntry) => void;
}) {
  const icon = getFileIcon(file.kind);
  const iconColor = getIconColor(file.kind);

  return (
    <button
      type="button"
      data-vault-path={file.relativePath}
      onClick={() => onSelectFile(file)}
      onContextMenu={(e) => {
        if (onContextMenu) {
          e.preventDefault();
          e.stopPropagation();
          onContextMenu(e, 'file', file);
        }
      }}
      style={{ paddingLeft: `${depth * 14 + 20}px` }}
      className={`w-full flex items-center gap-1.5 py-1 pr-2 text-left transition-colors cursor-pointer select-none group text-xs ${
        isSelected
          ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] font-semibold border-l-2 border-[var(--accent-primary)]'
          : 'text-fg-secondary hover:bg-surface-hover hover:text-fg'
      }`}
      title={file.name}
    >
      <span className={`material-symbols-outlined text-[15px] shrink-0 ${iconColor}`}>
        {icon}
      </span>
      <span className="truncate flex-1">{file.name}</span>
    </button>
  );
}

// Componente Recursivo Nó de Pasta (Suporta profundidade arbitrária da raiz até a última subpasta)
function TreeFolderNode({
  folder,
  depth,
  treeData,
  expandedFolders,
  selectedFolderPath,
  selectedFilePath,
  unlockedPins,
  onToggleExpand,
  onSelectFolder,
  onSelectFile,
  onContextMenu,
}: {
  folder: EdgeVaultEntry;
  depth: number;
  treeData: Record<string, DirectoryNodeData>;
  expandedFolders: Set<string>;
  selectedFolderPath?: string;
  selectedFilePath?: string | null;
  unlockedPins?: string[];
  onToggleExpand: (folder: EdgeVaultEntry, e: React.MouseEvent) => void;
  onSelectFolder: (folder: EdgeVaultEntry) => void;
  onSelectFile: (file: EdgeVaultEntry) => void;
  onContextMenu?: (e: React.MouseEvent, type: 'file' | 'folder', entry: EdgeVaultEntry) => void;
}) {
  const folderPath = folder.relativePath || (folder as unknown as { path?: string })?.path || folder.name;
  const isExpanded = expandedFolders.has(folderPath);
  const isSelected = selectedFolderPath === folderPath;
  const isLocked = folder.hasPin && (!unlockedPins || !unlockedPins.includes(folderPath));
  const nodeData = treeData[folderPath];

  return (
    <div key={folderPath}>
      {/* Linha da Pasta */}
      <div
        data-vault-path={folderPath}
        onClick={() => onSelectFolder(folder)}
        onContextMenu={(e) => {
          if (onContextMenu) {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(e, 'folder', folder);
          }
        }}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        className={`w-full flex items-center justify-between gap-1 py-1 pr-2 text-left transition-colors cursor-pointer select-none group text-xs ${
          isSelected
            ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] font-semibold border-l-2 border-[var(--accent-primary)]'
            : 'text-fg-secondary hover:bg-surface-hover hover:text-fg'
        }`}
      >
        <div className="flex items-center gap-1 min-w-0 flex-1">
          {/* Botão de Chevron para Expandir / Recolher Inline */}
          <button
            type="button"
            onClick={(e) => onToggleExpand(folder, e)}
            className="w-4 h-4 flex items-center justify-center text-fg-muted hover:text-fg rounded shrink-0"
            title={isExpanded ? 'Recolher subpasta' : 'Expandir subpasta'}
          >
            {nodeData?.loading ? (
              <span className="w-2.5 h-2.5 rounded-full border border-current border-t-transparent animate-spin" />
            ) : (
              <span className="material-symbols-outlined text-[14px]">
                {isExpanded ? 'expand_more' : 'chevron_right'}
              </span>
            )}
          </button>

          {/* Ícone da Pasta */}
          <span className="material-symbols-outlined text-[16px] text-[var(--accent-secondary,#FFCC00)] shrink-0">
            {isLocked ? 'lock' : isExpanded ? 'folder_open' : 'folder'}
          </span>

          {/* Nome da Pasta */}
          <span className="truncate">{folder.name}</span>
        </div>

        {/* Quantidade de itens em hover */}
        {nodeData?.loaded && (
          <span className="text-[10px] text-fg-muted opacity-0 group-hover:opacity-100 transition-opacity">
            {nodeData.folders.length + nodeData.files.length}
          </span>
        )}
      </div>

      {/* Ramo Recursivo Aberto Verticalmente (Estilo VS Code) */}
      {isExpanded && (
        <div className="relative">
          {/* Linha Guia Vertical */}
          <div
            className="absolute top-0 bottom-0 border-l border-border-subtle/50 pointer-events-none"
            style={{ left: `${depth * 14 + 13}px` }}
          />

          {nodeData?.loading ? (
            <div
              style={{ paddingLeft: `${(depth + 1) * 14 + 14}px` }}
              className="flex items-center gap-2 py-1 text-[11px] text-fg-muted italic"
            >
              <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-ping" />
              <span>Carregando...</span>
            </div>
          ) : nodeData?.loaded ? (
            <>
              {/* Subpastas Recursivas */}
              {nodeData.folders.map((subF) => (
                <TreeFolderNode
                  key={subF.relativePath}
                  folder={subF}
                  depth={depth + 1}
                  treeData={treeData}
                  expandedFolders={expandedFolders}
                  selectedFolderPath={selectedFolderPath}
                  selectedFilePath={selectedFilePath}
                  unlockedPins={unlockedPins}
                  onToggleExpand={onToggleExpand}
                  onSelectFolder={onSelectFolder}
                  onSelectFile={onSelectFile}
                  onContextMenu={onContextMenu}
                />
              ))}

              {/* Arquivos do Nível */}
              {nodeData.files.map((subFi) => (
                <TreeFileNode
                  key={subFi.relativePath}
                  file={subFi}
                  depth={depth + 1}
                  isSelected={selectedFilePath === subFi.relativePath}
                  onSelectFile={onSelectFile}
                  onContextMenu={onContextMenu}
                />
              ))}

              {/* Pasta Vazia */}
              {nodeData.folders.length === 0 && nodeData.files.length === 0 && (
                <div
                  style={{ paddingLeft: `${(depth + 1) * 14 + 20}px` }}
                  className="py-1 text-[10px] text-fg-muted italic select-none"
                >
                  (pasta vazia)
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function VaultIdeTreeSidebar({
  currentFolder,
  folders,
  files,
  unlockedPins,
  ticket,
  serverUrl,
  onSelectFolder,
  onSelectFile,
  selectedFilePath,
  selectedFolderPath,
  onCreateNote,
  onCreateFolder,
  onUpload,
  onContextMenu,
}: VaultIdeTreeSidebarProps) {
  const [isRootExpanded, setIsRootExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [treeData, setTreeData] = useState<Record<string, DirectoryNodeData>>({});

  // Sincroniza dados da raiz quando props mudam na raiz
  useEffect(() => {
    if (currentFolder === '') {
      setTreeData((prev) => ({
        ...prev,
        '': {
          loading: false,
          loaded: true,
          folders,
          files,
        },
      }));
    }
  }, [currentFolder, folders, files]);

  // Carrega ou recarrega um diretório sob demanda
  const loadDirectoryData = useCallback(
    async (path: string, force = false) => {
      if (!ticket) return;
      if (!force && treeData[path]?.loaded) return;

      setTreeData((prev) => ({
        ...prev,
        [path]: {
          loading: true,
          loaded: false,
          folders: prev[path]?.folders || [],
          files: prev[path]?.files || [],
        },
      }));

      try {
        const res = await fetchTenantDirectory(path, ticket, { serverUrl });
        setTreeData((prev) => ({
          ...prev,
          [path]: {
            loading: false,
            loaded: true,
            folders: res.folders || [],
            files: res.files || [],
          },
        }));
      } catch (err: unknown) {
        setTreeData((prev) => ({
          ...prev,
          [path]: {
            loading: false,
            loaded: false,
            error: err instanceof Error ? err.message : 'Falha ao carregar',
            folders: prev[path]?.folders || [],
            files: prev[path]?.files || [],
          },
        }));
      }
    },
    [ticket, serverUrl, treeData]
  );

  // Inicializa raiz se ainda não foi carregada
  useEffect(() => {
    if (!treeData[''] && ticket) {
      if (currentFolder === '' && (folders.length > 0 || files.length > 0)) {
        setTreeData((prev) => ({
          ...prev,
          '': {
            loading: false,
            loaded: true,
            folders,
            files,
          },
        }));
      } else {
        void loadDirectoryData('', true);
      }
    }
  }, [ticket, currentFolder, folders, files, treeData, loadDirectoryData]);

  // Alterna expansão de uma subpasta
  const toggleExpandSubfolder = (folder: EdgeVaultEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    const folderPath = folder.relativePath || (folder as unknown as { path?: string })?.path || folder.name;

    // Se pasta for protegida e ainda não destravada, dispara modal de PIN
    if (folder.hasPin && (!unlockedPins || !unlockedPins.includes(folderPath))) {
      onSelectFolder(folderPath, folder);
      return;
    }

    const path = folderPath;
    const isExpanded = expandedFolders.has(path);
    const next = new Set(expandedFolders);

    if (isExpanded) {
      next.delete(path);
      setExpandedFolders(next);
    } else {
      next.add(path);
      setExpandedFolders(next);
      if (!treeData[path]?.loaded) {
        void loadDirectoryData(path);
      }
    }
  };

  // Clique na linha de uma pasta: Seleciona e alterna expansão verticalmente (estilo VS Code)
  const handleFolderClick = (folder: EdgeVaultEntry) => {
    const folderPath = folder.relativePath || (folder as unknown as { path?: string })?.path || folder.name;
    if (folder.hasPin && (!unlockedPins || !unlockedPins.includes(folderPath))) {
      onSelectFolder(folderPath, folder);
      return;
    }

    onSelectFolder(folderPath, folder);

    // Alterna expansão vertical (toggle expand/collapse)
    const path = folderPath;
    const isExpanded = expandedFolders.has(path);
    const next = new Set(expandedFolders);

    if (isExpanded) {
      next.delete(path);
      setExpandedFolders(next);
    } else {
      next.add(path);
      setExpandedFolders(next);
      if (!treeData[path]?.loaded) {
        void loadDirectoryData(path);
      }
    }
  };

  // Recolher todas as pastas
  const handleCollapseAll = () => {
    setExpandedFolders(new Set());
  };

  // Recarregar raiz e pastas ativas
  const handleRefreshAll = async () => {
    await loadDirectoryData('', true);
    for (const path of Array.from(expandedFolders)) {
      await loadDirectoryData(path, true);
    }
  };

  const rootData = treeData[''] || {
    loading: false,
    loaded: true,
    folders: currentFolder === '' ? folders : [],
    files: currentFolder === '' ? files : [],
  };

  const activeFolderPath = selectedFolderPath ?? currentFolder;

  return (
    <aside className="w-64 lg:w-72 bg-surface border-r border-border-subtle flex flex-col shrink-0 h-full overflow-hidden select-none font-mono text-xs">
      {/* Topo da Árvore VS Code */}
      <div className="h-10 px-3 py-2 border-b border-border-subtle flex items-center justify-between bg-elevated/60 shrink-0">
        <span className="font-bold uppercase tracking-wider text-[11px] text-fg-secondary flex items-center gap-1.5 truncate">
          <span className="material-symbols-outlined text-[16px] text-[var(--accent-primary)]">
            account_tree
          </span>
          Explorador
        </span>

        {/* Ações Rápidas de Topo (Estilo VS Code) */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={onCreateNote}
            className="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
            title="Nova Nota (.md)"
          >
            <span className="material-symbols-outlined text-[16px]">note_add</span>
          </button>
          <button
            type="button"
            onClick={onCreateFolder}
            className="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
            title="Nova Pasta"
          >
            <span className="material-symbols-outlined text-[16px]">create_new_folder</span>
          </button>
          <button
            type="button"
            onClick={onUpload}
            className="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
            title="Subir Arquivo"
          >
            <span className="material-symbols-outlined text-[16px]">upload_file</span>
          </button>
          <button
            type="button"
            onClick={() => void handleRefreshAll()}
            className="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
            title="Recarregar Árvore"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
          </button>
          <button
            type="button"
            onClick={handleCollapseAll}
            className="p-1 rounded text-fg-muted hover:text-fg hover:bg-surface-hover transition-colors"
            title="Recolher Todas as Pastas"
          >
            <span className="material-symbols-outlined text-[16px]">unfold_less</span>
          </button>
        </div>
      </div>

      {/* Estrutura de Árvore Recursiva Vertical */}
      <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {/* Raiz Meus Arquivos */}
        <div
          data-vault-path=""
          onClick={() => {
            onSelectFolder('', undefined);
            setIsRootExpanded((prev) => !prev);
          }}
          style={{ paddingLeft: '8px' }}
          className={`w-full flex items-center justify-between gap-1 py-1.5 pr-2 text-left transition-colors cursor-pointer select-none group text-xs ${
            activeFolderPath === ''
              ? 'bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] font-bold border-l-2 border-[var(--accent-primary)]'
              : 'text-fg-secondary hover:bg-surface-hover hover:text-fg'
          }`}
        >
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsRootExpanded((prev) => !prev);
              }}
              className="w-4 h-4 flex items-center justify-center text-fg-muted hover:text-fg rounded shrink-0"
              title={isRootExpanded ? 'Recolher raiz' : 'Expandir raiz'}
            >
              <span className="material-symbols-outlined text-[14px]">
                {isRootExpanded ? 'expand_more' : 'chevron_right'}
              </span>
            </button>
            <span className="material-symbols-outlined text-[16px] text-[var(--accent-primary)] shrink-0">
              source_environment
            </span>
            <span className="truncate font-semibold uppercase tracking-wider text-[11px]">
              Meus Arquivos (Raiz)
            </span>
          </div>

          {rootData.loaded && (
            <span className="text-[10px] text-fg-muted opacity-0 group-hover:opacity-100 transition-opacity">
              {rootData.folders.length + rootData.files.length}
            </span>
          )}
        </div>

        {/* Filhos da Raiz com Expansão Vertical */}
        {isRootExpanded && (
          <div className="relative">
            {/* Linha Guia Vertical da Raiz */}
            <div className="absolute top-0 bottom-0 left-[15px] border-l border-border-subtle/50 pointer-events-none" />

            {rootData.loading ? (
              <div className="pl-6 flex items-center gap-2 py-1 text-[11px] text-fg-muted italic">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] animate-ping" />
                <span>Carregando raiz...</span>
              </div>
            ) : (
              <>
                {/* Pastas de Nível 1 (cada uma expande recursivamente para nível 2, 3... N) */}
                {rootData.folders.map((folder) => (
                  <TreeFolderNode
                    key={folder.relativePath}
                    folder={folder}
                    depth={1}
                    treeData={treeData}
                    expandedFolders={expandedFolders}
                    selectedFolderPath={activeFolderPath}
                    selectedFilePath={selectedFilePath}
                    unlockedPins={unlockedPins}
                    onToggleExpand={toggleExpandSubfolder}
                    onSelectFolder={handleFolderClick}
                    onSelectFile={onSelectFile}
                    onContextMenu={onContextMenu}
                  />
                ))}

                {/* Arquivos de Nível 1 */}
                {rootData.files.map((file) => (
                  <TreeFileNode
                    key={file.relativePath}
                    file={file}
                    depth={1}
                    isSelected={selectedFilePath === file.relativePath}
                    onSelectFile={onSelectFile}
                    onContextMenu={onContextMenu}
                  />
                ))}

                {/* Vazio na Raiz */}
                {rootData.folders.length === 0 && rootData.files.length === 0 && (
                  <div className="pl-7 py-2 text-[10px] text-fg-muted italic select-none">
                    Nenhum item na raiz do cofre.
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
