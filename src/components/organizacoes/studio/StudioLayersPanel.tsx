// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStudio } from './StudioContext';
import type { StudioLogoLayer, LogoPreset, StudioLayer, StudioLayerFolder } from './types';
import { StudioHelpTooltip } from './StudioHelpTooltip';

const FOLDER_COLORS = ['#FFCC00', '#00D4FF', '#10B981', '#F43F5E', '#A855F7', '#F97316'];

type LayerTreeNode =
  | { kind: 'folder'; folder: StudioLayerFolder; items: { layer: StudioLayer; index: number }[] }
  | { kind: 'layer'; layer: StudioLayer; index: number };

export function StudioLayersPanel() {
  const {
    activeSlide,
    selectedLayerId,
    selectedLayerIds,
    setSelectedLayerId,
    setSelectedLayerIds,
    updateLayer,
    removeLayer,
    reorderLayers,
    duplicateLayerWithMaskOnTop,
    addLayer,
    createFolder,
    updateFolder,
    deleteFolder,
    duplicateFolder,
    moveLayerToFolder,
    moveLayerStep,
    reorderFolderBlock,
    groupSelectedLayers,
    ungroupSelectedLayers,
  } = useStudio();

  const [showLogoPresets, setShowLogoPresets] = useState(false);
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [colorMenuFolderId, setColorMenuFolderId] = useState<string | null>(null);
  const [deleteMenuFolderId, setDeleteMenuFolderId] = useState<string | null>(null);
  const [moveMenu, setMoveMenu] = useState<{ layerId: string; currentFolderId: string | null; top: number; left: number } | null>(null);
  const moveMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!moveMenu) return;
    const close = () => setMoveMenu(null);
    const onDown = (e: MouseEvent) => {
      if (moveMenuRef.current && !moveMenuRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [moveMenu]);

  const layers = activeSlide.layers;
  const folders = useMemo(() => activeSlide.folders || [], [activeSlide.folders]);

  const folderMap = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);

  // Constrói árvore contígua de cima para baixo (maior Z-index primeiro)
  const treeNodes = useMemo<LayerTreeNode[]>(() => {
    const nodes: LayerTreeNode[] = [];
    const seenFolders = new Set<string>();

    for (let i = layers.length - 1; i >= 0; i--) {
      const layer = layers[i];
      if (layer.folderId && folderMap.has(layer.folderId)) {
        if (!seenFolders.has(layer.folderId)) {
          seenFolders.add(layer.folderId);
          const folder = folderMap.get(layer.folderId)!;
          const items: { layer: StudioLayer; index: number }[] = [];
          for (let j = layers.length - 1; j >= 0; j--) {
            if (layers[j].folderId === folder.id) {
              items.push({ layer: layers[j], index: j });
            }
          }
          nodes.push({ kind: 'folder', folder, items });
        }
      } else {
        nodes.push({ kind: 'layer', layer, index: i });
      }
    }

    // Pastas vazias ficam no topo para facilitar soltar camadas dentro delas
    for (const f of folders) {
      if (!seenFolders.has(f.id)) {
        nodes.unshift({ kind: 'folder', folder: f, items: [] });
      }
    }
    return nodes;
  }, [layers, folders, folderMap]);

  const hasGroupedSelection = useMemo(
    () => layers.some((l) => selectedLayerIds.includes(l.id) && Boolean(l.folderId)),
    [layers, selectedLayerIds]
  );

  const handleAddLogo = (preset: LogoPreset) => {
    const layer: StudioLogoLayer = {
      id: `logo-${Date.now()}`,
      type: 'logo',
      name: `Selo ${preset === 'show-da-fisica-tricolor' ? 'Show de Física' : preset === 'ifusp' ? 'IFUSP' : 'Logo Org'}`,
      preset,
      preserveAspect: true,
      visible: true,
      locked: false,
      opacity: 1,
      x: 0.05,
      y: 0.05,
      width: 0.22,
      height: 0.08,
      rotation: 0,
    };
    addLayer(layer);
    setShowLogoPresets(false);
  };

  const commitFolderRename = (folderId: string) => {
    const trimmed = editingFolderName.trim();
    if (trimmed) updateFolder(folderId, { name: trimmed });
    setEditingFolderId(null);
  };

  const renderLayerRow = (layer: StudioLayer, idx: number, inFolder = false) => {
    const isSelected = selectedLayerIds.includes(layer.id) || layer.id === selectedLayerId;
    const isImage = layer.type === 'image';

    return (
      <div
        key={layer.id}
        draggable
        onDragStart={(e) => e.dataTransfer.setData('text/plain', String(idx))}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const from = Number(e.dataTransfer.getData('text/plain'));
          if (!Number.isNaN(from) && from !== idx) {
            const dragged = layers[from];
            if (dragged && dragged.folderId !== layer.folderId) {
              moveLayerToFolder(dragged.id, layer.folderId || null);
            } else {
              reorderLayers(from, idx);
            }
          }
        }}
        onClick={() => setSelectedLayerId(layer.id)}
        className={`p-2 rounded-xl border transition-all flex flex-wrap items-center justify-between gap-1.5 cursor-pointer ${
          inFolder ? 'ml-3 border-l-2' : ''
        } ${
          isSelected
            ? 'border-[#FFCC00] bg-[#FFCC00]/10 shadow-xs'
            : 'border-border-subtle bg-elevated/60 hover:border-border-strong'
        }`}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="material-symbols-outlined text-[15px] text-[#FFCC00] shrink-0">
            {layer.type === 'image'
              ? 'photo'
              : layer.type === 'text'
                ? 'title'
                : layer.type === 'logo'
                  ? 'verified'
                  : layer.type === 'drawing'
                    ? 'brush'
                    : layer.type === 'math'
                      ? 'functions'
                      : 'category'}
          </span>
          <span className="text-xs font-bold text-fg truncate">
            {layer.type === 'drawing'
              ? `${layer.name} (${layer.strokes.length} traço${layer.strokes.length === 1 ? '' : 's'})`
              : layer.name}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          {/* Mover para pasta (Popover customizado Aurtistic via Portal) */}
          {folders.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const rect = e.currentTarget.getBoundingClientRect();
                const menuW = 160;
                const estMenuH = Math.min(220, (folders.length + 1) * 32 + 12);
                const left = Math.max(8, Math.min(window.innerWidth - menuW - 8, rect.right - menuW));
                const spaceBelow = window.innerHeight - rect.bottom;
                const top =
                  spaceBelow < estMenuH && rect.top > estMenuH
                    ? Math.max(8, rect.top - estMenuH - 4)
                    : Math.min(window.innerHeight - estMenuH - 8, rect.bottom + 4);
                setMoveMenu((prev) =>
                  prev?.layerId === layer.id
                    ? null
                    : { layerId: layer.id, currentFolderId: layer.folderId || null, top, left }
                );
              }}
              className="px-1.5 py-0.5 rounded bg-surface border border-border-subtle text-[9px] font-semibold text-fg-secondary hover:text-fg hover:border-[#FFCC00] flex items-center gap-0.5 cursor-pointer"
              title="Mover para pasta"
            >
              <span className="truncate max-w-[54px]">
                {layer.folderId ? folderMap.get(layer.folderId)?.name || 'Pasta' : 'Mover'}
              </span>
              <span className="material-symbols-outlined text-[12px]">expand_more</span>
            </button>
          )}

          {isImage && (
            <button
              type="button"
              onClick={() => duplicateLayerWithMaskOnTop(layer.id)}
              title="Duplicar com Máscara no Topo"
              className="p-1 rounded-lg text-amber-700 dark:text-amber-300 hover:bg-amber-400/20 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[14px]">layers_spark</span>
            </button>
          )}

          <button
            type="button"
            disabled={idx === layers.length - 1}
            onClick={() => moveLayerStep(layer.id, 'up')}
            className="p-1 rounded-md text-fg-muted hover:text-fg disabled:opacity-20 cursor-pointer"
            title="Subir Camada"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
          </button>
          <button
            type="button"
            disabled={idx === 0}
            onClick={() => moveLayerStep(layer.id, 'down')}
            className="p-1 rounded-md text-fg-muted hover:text-fg disabled:opacity-20 cursor-pointer"
            title="Descer Camada"
          >
            <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
          </button>

          <button
            type="button"
            onClick={() => updateLayer(layer.id, { visible: !layer.visible })}
            className={`p-1 rounded-md cursor-pointer ${layer.visible ? 'text-fg-secondary hover:text-fg' : 'text-fg-muted/40'}`}
            title={layer.visible ? 'Ocultar' : 'Exibir'}
          >
            <span className="material-symbols-outlined text-[14px]">{layer.visible ? 'visibility' : 'visibility_off'}</span>
          </button>

          <button
            type="button"
            onClick={() => updateLayer(layer.id, { locked: !layer.locked })}
            className={`p-1 rounded-md cursor-pointer ${layer.locked ? 'text-amber-400' : 'text-fg-muted hover:text-fg'}`}
            title={layer.locked ? 'Desbloquear' : 'Bloquear'}
          >
            <span className="material-symbols-outlined text-[14px]">{layer.locked ? 'lock' : 'lock_open'}</span>
          </button>

          <button
            type="button"
            onClick={() => removeLayer(layer.id)}
            className="p-1 rounded-md text-red-400 hover:bg-red-500/20 cursor-pointer"
            title="Excluir"
          >
            <span className="material-symbols-outlined text-[14px]">delete</span>
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Cabeçalho com Pastas, Agrupamento e Selos */}
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <label className="text-[11px] font-bold text-fg-muted uppercase tracking-wider flex items-center gap-1.5">
          <span>Camadas ({layers.length})</span>
          <StudioHelpTooltip helpKey="layers.stack" />
        </label>

        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => createFolder()}
            className="px-2 py-1 rounded-lg bg-surface border border-border-subtle text-fg text-[10px] font-bold hover:border-[#FFCC00] flex items-center gap-1 cursor-pointer"
            title="Criar Nova Pasta de Camadas"
          >
            <span className="material-symbols-outlined text-[13px] text-[#FFCC00]">create_new_folder</span>
            <span>+ Pasta</span>
          </button>

          {selectedLayerIds.length >= 2 && (
            <button
              type="button"
              onClick={groupSelectedLayers}
              className="px-2 py-1 rounded-lg bg-[#00D4FF]/15 border border-[#00D4FF]/40 text-[#00D4FF] text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              title="Agrupar Selecionadas (Ctrl+G)"
            >
              <span className="material-symbols-outlined text-[13px]">workspaces</span>
              <span>Agrupar</span>
            </button>
          )}

          {hasGroupedSelection && (
            <button
              type="button"
              onClick={ungroupSelectedLayers}
              className="px-2 py-1 rounded-lg bg-surface border border-border-subtle text-fg-secondary text-[10px] font-bold hover:text-fg cursor-pointer"
              title="Desagrupar (Ctrl+Shift+G)"
            >
              Desagrupar
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowLogoPresets(!showLogoPresets)}
            className="px-2 py-1 rounded-lg bg-amber-400/20 text-amber-700 dark:text-amber-300 font-bold text-[10px] hover:bg-amber-400/30 flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[13px]">verified</span>
            <span>+ Selo</span>
          </button>
        </div>
      </div>

      {showLogoPresets && (
        <div className="p-2.5 rounded-xl bg-elevated border border-amber-400/30 space-y-2 animate-in fade-in">
          <span className="text-[10px] text-fg-muted block font-bold uppercase">Escolha o Selo Oficial:</span>
          <div className="grid grid-cols-3 gap-1 text-[10px] font-bold">
            <button type="button" onClick={() => handleAddLogo('org-logo')} className="p-1.5 rounded bg-elevated hover:bg-[#FFCC00] hover:text-black transition-all cursor-pointer">Logo da Org</button>
            <button type="button" onClick={() => handleAddLogo('show-da-fisica-tricolor')} className="p-1.5 rounded bg-elevated hover:bg-[#FFCC00] hover:text-black transition-all cursor-pointer">Show Física</button>
            <button type="button" onClick={() => handleAddLogo('ifusp')} className="p-1.5 rounded bg-elevated hover:bg-[#FFCC00] hover:text-black transition-all cursor-pointer">IFUSP</button>
          </div>
        </div>
      )}

      {selectedLayerId && layers.find((l) => l.id === selectedLayerId)?.type === 'logo' && (
        <div className="p-2 rounded-xl bg-elevated/60 border border-border-subtle space-y-1">
          <span className="text-[10px] text-fg-muted block font-bold uppercase">Posição Rápida do Selo:</span>
          <div className="grid grid-cols-5 gap-1 text-[10px] font-bold">
            <button type="button" onClick={() => updateLayer(selectedLayerId, { x: 0.05, y: 0.05 })} className="p-1 rounded bg-elevated hover:bg-[#FFCC00] hover:text-black cursor-pointer text-center">↖ TE</button>
            <button type="button" onClick={() => updateLayer(selectedLayerId, { x: 0.73, y: 0.05 })} className="p-1 rounded bg-elevated hover:bg-[#FFCC00] hover:text-black cursor-pointer text-center">↗ TD</button>
            <button type="button" onClick={() => updateLayer(selectedLayerId, { x: 0.39, y: 0.88 })} className="p-1 rounded bg-elevated hover:bg-[#FFCC00] hover:text-black cursor-pointer text-center">↓ BC</button>
            <button type="button" onClick={() => updateLayer(selectedLayerId, { x: 0.05, y: 0.88 })} className="p-1 rounded bg-elevated hover:bg-[#FFCC00] hover:text-black cursor-pointer text-center">↙ BE</button>
            <button type="button" onClick={() => updateLayer(selectedLayerId, { x: 0.73, y: 0.88 })} className="p-1 rounded bg-elevated hover:bg-[#FFCC00] hover:text-black cursor-pointer text-center">↘ BD</button>
          </div>
        </div>
      )}

      {layers.length === 0 && folders.length === 0 ? (
        <div className="p-4 rounded-xl border border-dashed border-border-subtle text-center text-xs text-fg-muted">
          Nenhuma camada nesta tela.
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1 scrollbar-thin">
          {treeNodes.map((node) => {
            if (node.kind === 'layer') {
              return renderLayerRow(node.layer, node.index, false);
            }

            const { folder, items } = node;
            const isEditing = editingFolderId === folder.id;

            return (
              <div
                key={folder.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(e.dataTransfer.getData('text/plain'));
                  if (!Number.isNaN(from) && layers[from]) {
                    moveLayerToFolder(layers[from].id, folder.id);
                  }
                }}
                className="rounded-xl border border-border-subtle bg-surface/80 p-1.5 space-y-1"
              >
                <div className="flex flex-wrap items-center justify-between gap-1 px-1 py-0.5">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => updateFolder(folder.id, { collapsed: !folder.collapsed })}
                      className="p-0.5 text-fg-muted hover:text-fg cursor-pointer"
                      title={folder.collapsed ? 'Expandir pasta' : 'Recolher pasta'}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {folder.collapsed ? 'chevron_right' : 'expand_more'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setColorMenuFolderId((c) => (c === folder.id ? null : folder.id))}
                      className="w-3 h-3 rounded-full border border-black/30 shrink-0 cursor-pointer"
                      style={{ backgroundColor: folder.color }}
                      title="Cor da pasta"
                    />

                    {isEditing ? (
                      <input
                        autoFocus
                        value={editingFolderName}
                        onChange={(e) => setEditingFolderName(e.target.value)}
                        onBlur={() => commitFolderRename(folder.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitFolderRename(folder.id);
                          if (e.key === 'Escape') setEditingFolderId(null);
                        }}
                        className="px-1.5 py-0.5 rounded bg-app border border-[#FFCC00] text-xs font-bold text-fg w-28 focus:outline-none"
                      />
                    ) : (
                      <span
                        onDoubleClick={() => {
                          setEditingFolderId(folder.id);
                          setEditingFolderName(folder.name);
                        }}
                        className="text-xs font-bold text-fg truncate cursor-pointer"
                        title="Duplo clique para renomear"
                      >
                        {folder.isGroup ? '⬡ ' : ''}{folder.name}
                      </span>
                    )}

                    <span className="px-1.5 py-0.5 rounded-md bg-surface-hover text-[9px] font-mono text-fg-muted shrink-0">
                      {items.length}
                    </span>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingFolderId(folder.id);
                        setEditingFolderName(folder.name);
                      }}
                      className="p-1 text-fg-muted hover:text-fg cursor-pointer"
                      title="Renomear pasta"
                    >
                      <span className="material-symbols-outlined text-[13px]">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedLayerIds(items.map((it) => it.layer.id))}
                      className="p-1 text-fg-muted hover:text-[#00D4FF] cursor-pointer"
                      title="Selecionar todas as camadas da pasta"
                    >
                      <span className="material-symbols-outlined text-[13px]">select_all</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => reorderFolderBlock(folder.id, 'up')}
                      className="p-1 text-fg-muted hover:text-fg cursor-pointer"
                      title="Subir bloco da pasta"
                    >
                      <span className="material-symbols-outlined text-[13px]">arrow_upward</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => reorderFolderBlock(folder.id, 'down')}
                      className="p-1 text-fg-muted hover:text-fg cursor-pointer"
                      title="Descer bloco da pasta"
                    >
                      <span className="material-symbols-outlined text-[13px]">arrow_downward</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateFolder(folder.id, { visible: !folder.visible })}
                      className={`p-1 cursor-pointer ${folder.visible ? 'text-fg-secondary' : 'text-fg-muted/40'}`}
                      title={folder.visible ? 'Ocultar pasta' : 'Exibir pasta'}
                    >
                      <span className="material-symbols-outlined text-[13px]">{folder.visible ? 'visibility' : 'visibility_off'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => updateFolder(folder.id, { locked: !folder.locked })}
                      className={`p-1 cursor-pointer ${folder.locked ? 'text-amber-400' : 'text-fg-muted'}`}
                      title={folder.locked ? 'Desbloquear pasta' : 'Bloquear pasta'}
                    >
                      <span className="material-symbols-outlined text-[13px]">{folder.locked ? 'lock' : 'lock_open'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateFolder(folder.id)}
                      className="p-1 text-fg-muted hover:text-[#FFCC00] cursor-pointer"
                      title="Duplicar pasta e camadas"
                    >
                      <span className="material-symbols-outlined text-[13px]">content_copy</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteMenuFolderId((d) => (d === folder.id ? null : folder.id))}
                      className="p-1 text-red-400 hover:bg-red-500/20 rounded cursor-pointer"
                      title="Excluir pasta"
                    >
                      <span className="material-symbols-outlined text-[13px]">delete</span>
                    </button>
                  </div>
                </div>

                {colorMenuFolderId === folder.id && (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-app border border-border-subtle">
                    <span className="text-[10px] text-fg-muted">Cor:</span>
                    {FOLDER_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => {
                          updateFolder(folder.id, { color: c });
                          setColorMenuFolderId(null);
                        }}
                        className="w-4 h-4 rounded-full border border-black/30 cursor-pointer"
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                )}

                {deleteMenuFolderId === folder.id && (
                  <div className="flex items-center justify-between gap-1 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-[10px]">
                    <span className="text-red-400 font-bold">Excluir pasta:</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          deleteFolder(folder.id, false);
                          setDeleteMenuFolderId(null);
                        }}
                        className="px-2 py-0.5 rounded bg-surface border border-border-subtle text-fg font-semibold cursor-pointer"
                      >
                        Manter camadas
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          deleteFolder(folder.id, true);
                          setDeleteMenuFolderId(null);
                        }}
                        className="px-2 py-0.5 rounded bg-red-600 text-white font-bold cursor-pointer"
                      >
                        Apagar tudo
                      </button>
                    </div>
                  </div>
                )}

                {!folder.collapsed && (
                  <div className="space-y-1 pt-0.5">
                    {items.length === 0 ? (
                      <div className="ml-3 px-2 py-1.5 rounded-lg border border-dashed border-border-subtle text-[10px] text-fg-muted">
                        Pasta vazia — arraste uma camada ou use &ldquo;Mover&rdquo;.
                      </div>
                    ) : (
                      items.map((it) => renderLayerRow(it.layer, it.index, true))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Portal do menu customizado "Mover para pasta" */}
      {moveMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={moveMenuRef}
            style={{ position: 'fixed', top: moveMenu.top, left: moveMenu.left, zIndex: 9999 }}
            className="w-40 rounded-xl bg-surface border border-border-subtle shadow-2xl p-1 text-xs animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => {
                moveLayerToFolder(moveMenu.layerId, null);
                setMoveMenu(null);
              }}
              className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left cursor-pointer ${
                !moveMenu.currentFolderId ? 'bg-[#FFCC00]/15 text-[#FFCC00] font-bold' : 'text-fg-secondary hover:bg-surface-hover hover:text-fg'
              }`}
            >
              <span>Solta (raiz)</span>
              {!moveMenu.currentFolderId && <span className="material-symbols-outlined text-[14px]">check</span>}
            </button>
            {folders.map((f) => {
              const active = moveMenu.currentFolderId === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    moveLayerToFolder(moveMenu.layerId, f.id);
                    setMoveMenu(null);
                  }}
                  className={`w-full flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-left cursor-pointer ${
                    active ? 'bg-[#FFCC00]/15 text-[#FFCC00] font-bold' : 'text-fg-secondary hover:bg-surface-hover hover:text-fg'
                  }`}
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: f.color }} />
                    <span className="truncate">{f.name}</span>
                  </span>
                  {active && <span className="material-symbols-outlined text-[14px] shrink-0">check</span>}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
}
