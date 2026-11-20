// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS, type AspectRatioKey, type StudioActiveTab } from './types';
import { StudioImagePanel } from './StudioImagePanel';
import { StudioEditionPanel } from './StudioEditionPanel';
import { StudioTextPanel } from './StudioTextPanel';
import { StudioLayersPanel } from './StudioLayersPanel';
import { StudioElementsGallery } from './StudioElementsGallery';
import { StudioPaletteCenter } from './StudioPaletteCenter';
import { StudioCanvasStage } from './StudioCanvasStage';
import { StudioTopActionBar } from './StudioTopActionBar';
import { StudioCarouselStrip } from './StudioCarouselStrip';
import { StudioMaskBrushModal } from './StudioMaskBrushModal';
import { StudioMaskPanel } from './StudioMaskPanel';
import { StudioBrushPanel } from './StudioBrushPanel';
import { StudioDraftVersionsDrawer } from './StudioDraftVersionsDrawer';
import { StudioHelpTooltip } from './StudioHelpTooltip';
import StudioShortcutsModal from './StudioShortcutsModal';
import { StudioInstagramPreviewModal } from './StudioInstagramPreviewModal';
import { isLayerEffectivelyLocked, isLayerEffectivelyVisible } from '@/lib/studio/folder-utils';
import { useStudioKeyboard } from '@/hooks/useStudioKeyboard';
import { useStudioAutoSave } from '@/hooks/useStudioAutoSave';

type DockToolId = StudioActiveTab;

const DOCK_TOOLS: { id: DockToolId; label: string; icon: string; helpKey: string }[] = [
  { id: 'images', label: 'Imagens', icon: 'add_photo_alternate', helpKey: 'dock.images' },
  { id: 'edition', label: 'Ajustar', icon: 'tune', helpKey: 'dock.adjust' },
  { id: 'masks', label: 'Máscara', icon: 'contrast', helpKey: 'dock.mask' },
  { id: 'brush', label: 'Pincel', icon: 'brush', helpKey: 'dock.draw' },
  { id: 'texts', label: 'Texto', icon: 'title', helpKey: 'dock.text' },
  { id: 'elements', label: 'Elementos', icon: 'category', helpKey: 'dock.elements' },
  { id: 'palette', label: 'Paleta', icon: 'palette', helpKey: 'dock.palette' },
  { id: 'layers', label: 'Camadas', icon: 'layers', helpKey: 'dock.layers' },
];

export function StudioWorkspaceView() {
  const {
    stage,
    setStage,
    setActiveTab,
    aspectRatio,
    adaptFormatTo,
    saveCurrentToDraftSlot,
    activeDraftSlot,
    selectedLayer,
    removeLayer,
    duplicateLayerWithMaskOnTop,
    copySelectedLayers,
    pasteClipboardLayers,
    updateLayer,
    reorderLayers,
    setSelectedLayerId,
    setSelectedLayerIds,
    activeSlide,
    slides,
    addSlide,
    orgSlug,
    undo,
    redo,
    editingTextLayerId,
    groupSelectedLayers,
    ungroupSelectedLayers,
    activeSliderId,
    helpMode,
    lastSavedAt,
    setMaskModalLayerId,
    isBrushMode,
    setIsBrushMode,
    brushDrawerCollapsed,
    setBrushDrawerCollapsed,
    isHandTool,
    setIsHandTool,
    isEyedropperActive,
    startEyedropper,
    cancelEyedropper,
    shortcutsOpen,
    setShortcutsOpen,
    instagramPreviewOpen,
    setInstagramPreviewOpen,
    clearHistoryAndAssets,
  } = useStudio();

  const [openTool, setOpenTool] = useState<DockToolId | null>(null);
  const [activeHelpDockId, setActiveHelpDockId] = useState<DockToolId | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const prevHandBeforeSpaceRef = useRef<boolean>(false);

  const handleSelectDockTool = (toolId: DockToolId) => {
    if (helpMode) {
      setActiveHelpDockId((prev) => (prev === toolId ? null : toolId));
      return;
    }
    if (openTool === toolId) {
      if (toolId === 'brush' && brushDrawerCollapsed) {
        setBrushDrawerCollapsed(false);
        return;
      }
      setOpenTool(null);
      if (toolId === 'brush') setIsBrushMode(false);
      return;
    }
    setOpenTool(toolId);
    setActiveTab(toolId);
    setIsBrushMode(toolId === 'brush');
    if (toolId === 'brush') setBrushDrawerCollapsed(false);
  };

  // Auto-Save contínuo com debounce de 5s no slot ativo
  const currentDraft = useMemo(() => {
    if (!activeDraftSlot) return null;
    return {
      id: `draft-slot-${activeDraftSlot}`,
      slotIndex: activeDraftSlot,
      title: `Rascunho ${activeDraftSlot}`,
      aspectRatio,
      updatedAt: new Date().toISOString(),
      slides,
    };
  }, [activeDraftSlot, aspectRatio, slides]);

  useStudioAutoSave({
    stage,
    activeDraftSlot,
    draft: currentDraft,
    orgSlug,
  });

  // Atalhos de teclado profissionais (Ctrl+Z, Del, Ctrl+D, Setas, Ctrl+S, Espaço, V/B/T/I/?, Ctrl+A)
  useStudioKeyboard({
    selectedLayer,
    isSelectedLocked: selectedLayer ? isLayerEffectivelyLocked(selectedLayer, activeSlide.folders) : false,
    isEditingText: editingTextLayerId !== null,
    onUndo: undo,
    onRedo: redo,
    onDeleteLayer: (id) => removeLayer(id),
    onDuplicateLayer: (id) => duplicateLayerWithMaskOnTop(id),
    onMoveLayer: (id, dx, dy) => {
      if (selectedLayer) updateLayer(id, { x: Math.max(0, Math.min(1, selectedLayer.x + dx)), y: Math.max(0, Math.min(1, selectedLayer.y + dy)) });
    },
    onReorderLayer: (up) => {
      if (!selectedLayer) return;
      const idx = activeSlide.layers.findIndex((l) => l.id === selectedLayer.id);
      if (up && idx < activeSlide.layers.length - 1) reorderLayers(idx, idx + 1);
      else if (!up && idx > 0) reorderLayers(idx, idx - 1);
    },
    onSaveDraft: () => saveCurrentToDraftSlot(activeDraftSlot || 1),
    onClearSelection: () => setSelectedLayerId(null),
    onEscapeGlobal: () => {
      if (isEyedropperActive) cancelEyedropper();
    },
    onGroupSelected: groupSelectedLayers,
    onUngroupSelected: ungroupSelectedLayers,
    onCopyLayers: copySelectedLayers,
    onPasteLayers: pasteClipboardLayers,
    onSelectAll: () => {
      const selectableIds = activeSlide.layers
        .filter((l) => isLayerEffectivelyVisible(l, activeSlide.folders) && !isLayerEffectivelyLocked(l, activeSlide.folders))
        .map((l) => l.id);
      setSelectedLayerIds(selectableIds);
    },
    onSelectToolV: () => {
      setIsBrushMode(false);
      setIsHandTool(false);
      if (isEyedropperActive) cancelEyedropper();
      if (openTool === 'brush') setOpenTool(null);
    },
    onToggleBrush: () => {
      if (isEyedropperActive) cancelEyedropper();
      const next = !isBrushMode;
      setIsBrushMode(next);
      if (next) {
        setIsHandTool(false);
        setOpenTool('brush');
        setActiveTab('brush');
        setBrushDrawerCollapsed(false);
      } else if (openTool === 'brush') {
        setOpenTool(null);
      }
    },
    onSelectToolText: () => {
      setIsBrushMode(false);
      setIsHandTool(false);
      if (isEyedropperActive) cancelEyedropper();
      setOpenTool('texts');
      setActiveTab('texts');
    },
    onToggleEyedropper: () => {
      if (isEyedropperActive) cancelEyedropper();
      else startEyedropper();
    },
    onToggleShortcuts: () => setShortcutsOpen(!shortcutsOpen),
    onTempHandStart: () => {
      prevHandBeforeSpaceRef.current = isHandTool;
      setIsHandTool(true);
    },
    onTempHandEnd: () => {
      setIsHandTool(prevHandBeforeSpaceRef.current);
    },
  });

  const activeToolMeta = DOCK_TOOLS.find((t) => t.id === openTool);
  const isScrubbing = Boolean(activeSliderId);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const dockRef = useRef<HTMLElement | null>(null);
  const drawerScrollRef = useRef<HTMLDivElement | null>(null);
  const savedScrollTopRef = useRef<number>(0);

  // Fecha o submenu flutuante ao clicar fora dele e fora do dock inferior
  useEffect(() => {
    if (!openTool || isScrubbing) return;
    if (openTool === 'brush' && brushDrawerCollapsed) return;
    const handleOutside = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (drawerRef.current?.contains(target)) return;
      if (dockRef.current?.contains(target)) return;
      if (target.closest('[role="dialog"]')) return;
      if (openTool === 'brush') {
        setBrushDrawerCollapsed(true);
      } else {
        setOpenTool(null);
      }
    };
    window.addEventListener('pointerdown', handleOutside);
    return () => window.removeEventListener('pointerdown', handleOutside);
  }, [openTool, isScrubbing, brushDrawerCollapsed, setBrushDrawerCollapsed]);

  useLayoutEffect(() => {
    const el = drawerScrollRef.current;
    if (!el) return;
    if (isScrubbing) {
      savedScrollTopRef.current = el.scrollTop;
    } else if (savedScrollTopRef.current > 0) {
      el.scrollTop = savedScrollTopRef.current;
    }
  }, [isScrubbing]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-hidden relative">
      {/* 1. Topbar compacta em 1 linha no mobile */}
      <div className="shrink-0 flex items-center justify-between gap-1.5 sm:gap-2 bg-surface/95 backdrop-blur-md border border-border-subtle rounded-2xl px-2 py-1.5 sm:px-3 sm:py-2 shadow-sm">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              clearHistoryAndAssets();
              setStage('launcher');
            }}
            className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1.5 rounded-xl border border-border-subtle bg-app text-xs font-bold text-fg-muted hover:text-fg transition-all cursor-pointer shrink-0"
            title="Voltar à Tela Inicial"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span className="hidden sm:inline">Início</span>
          </button>

          {/* Seletor compacto no mobile (<select>) e pílulas no desktop */}
          <select
            aria-label="Formato do Slide"
            value={aspectRatio}
            onChange={(e) => adaptFormatTo(e.target.value as AspectRatioKey)}
            className="sm:hidden bg-app border border-border-subtle rounded-xl px-2 py-1.5 text-xs font-bold text-fg focus:outline-none cursor-pointer"
          >
            {(Object.keys(ASPECT_DIMENSIONS) as AspectRatioKey[]).map((key) => (
              <option key={key} value={key}>{key}</option>
            ))}
          </select>

          <div className="hidden sm:flex items-center gap-0.5 bg-app p-0.5 rounded-xl border border-border-subtle">
            {(Object.keys(ASPECT_DIMENSIONS) as AspectRatioKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => adaptFormatTo(key)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${aspectRatio === key ? 'bg-[#FFCC00] text-black shadow-xs' : 'text-fg-muted hover:text-fg'
                  }`}
              >
                {key}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={addSlide}
            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-xl border border-border-subtle bg-app text-[11px] font-bold text-fg-secondary hover:text-fg hover:border-[#FFCC00]/60 transition-all cursor-pointer shrink-0"
            title="Adicionar Novo Slide ao Carrossel"
          >
            <span className="material-symbols-outlined text-[15px]">add</span>
            <span className="hidden xs:inline">Slide</span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl border border-border-subtle bg-app text-xs font-bold text-fg-muted hover:text-fg flex items-center gap-1 cursor-pointer"
            title="Abrir Histórico de Versões e Rascunhos"
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span className="hidden md:inline">Versões</span>
          </button>

          <button
            type="button"
            onClick={() => saveCurrentToDraftSlot(activeDraftSlot || 1)}
            className="relative px-2.5 py-1.5 rounded-xl border border-amber-500/50 bg-amber-500/15 text-xs font-bold text-amber-800 dark:text-amber-300 hover:bg-amber-500/25 flex items-center gap-1 cursor-pointer"
            title={lastSavedAt ? `Salvo às ${new Date(lastSavedAt).toLocaleTimeString('pt-BR')}` : 'Salvar Rascunho'}
          >
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${lastSavedAt ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            <span className="material-symbols-outlined text-[15px]">save</span>
            <span className="hidden sm:inline">Salvar</span>
          </button>

          <button
            type="button"
            onClick={() => setStage('publish')}
            className="px-3 sm:px-3.5 py-1.5 rounded-xl bg-[#FFCC00] text-black text-xs font-black hover:bg-[#FFD633] transition-all shadow-md flex items-center gap-1 cursor-pointer"
          >
            <span>Publicar</span>
            <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* 2. Navegação de Telas (oculta automaticamente quando houver 1 slide) */}
      <div className="shrink-0">
        <StudioCarouselStrip />
      </div>

      {/* 3. Palco Central + Barra Superior + Gaveta Flutuante para Cima */}
      <div className="relative flex-1 min-h-0 flex flex-col items-center justify-center gap-1.5 overflow-hidden">
        <div className="shrink-0 w-full flex justify-center">
          <StudioTopActionBar />
        </div>
        <div className="flex-1 min-h-0 w-full flex items-center justify-center">
          <StudioCanvasStage />
        </div>

        {/* Chip compacto quando a gaveta de Pincel auto-recolhe durante a pintura */}
        {openTool === 'brush' && brushDrawerCollapsed && (
          <div className="absolute bottom-3 right-3 z-30 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setBrushDrawerCollapsed(false)}
              className="px-3 py-1.5 rounded-full bg-black/90 text-[#FFCC00] border border-[#FFCC00]/50 shadow-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">brush</span>
              <span>Pincel Ativo • Ajustes</span>
            </button>
          </div>
        )}

        {/* 4. Gaveta Flutuante que expande PARA CIMA sobre a base do palco (estilo Xiaomi/Lightroom) */}
        {openTool && !(openTool === 'brush' && brushDrawerCollapsed) && (
          <div
            ref={drawerRef}
            className={`${editingTextLayerId ? 'max-sm:hidden' : ''} absolute bottom-2 inset-x-0 mx-auto w-[calc(100%-1rem)] max-w-2xl z-30 rounded-2xl ${openTool === 'edition' || openTool === 'masks' || openTool === 'palette'
              ? 'p-2.5 sm:p-3 h-auto max-h-[38%]'
              : 'p-3 sm:p-4 max-h-[52%]'
              } flex flex-col ${isScrubbing
                ? 'overflow-visible bg-transparent border-transparent shadow-none pointer-events-none'
                : 'overflow-hidden bg-surface/95 border border-border-subtle shadow-2xl backdrop-blur-xl transition-colors duration-150'
              }`}
          >
            <div
              className={`flex items-center justify-between border-b border-border-subtle pb-2 mb-2.5 shrink-0 transition-opacity duration-100 ${isScrubbing ? 'opacity-0 pointer-events-none' : 'opacity-100'
                }`}
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">
                  {activeToolMeta?.icon || 'tune'}
                </span>
                <span className="text-xs font-black uppercase tracking-wider text-fg">
                  {activeToolMeta?.label || 'Ajustes'}
                </span>
                {activeToolMeta?.helpKey && <StudioHelpTooltip helpKey={activeToolMeta.helpKey} />}
              </div>
              <button
                type="button"
                onClick={() => setOpenTool(null)}
                className="p-1 rounded-lg text-fg-muted hover:text-fg hover:bg-app transition-colors cursor-pointer"
                title="Recolher ajustes"
              >
                <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
              </button>
            </div>

            <div
              ref={drawerScrollRef}
              data-scrubbing={isScrubbing ? 'true' : 'false'}
              className={`flex-1 min-h-0 pr-1 scrollbar-thin ${isScrubbing ? 'overflow-visible' : 'overflow-y-auto'
                }`}
            >
              {openTool === 'images' && <StudioImagePanel />}
              {openTool === 'edition' && <StudioEditionPanel />}
              {openTool === 'masks' && <StudioMaskPanel />}
              {openTool === 'brush' && (
                <StudioBrushPanel
                  onExitBrushMode={() => {
                    setIsBrushMode(false);
                    setOpenTool(null);
                  }}
                />
              )}
              {openTool === 'texts' && <StudioTextPanel />}
              {openTool === 'layers' && <StudioLayersPanel />}
              {openTool === 'elements' && <StudioElementsGallery />}
              {openTool === 'palette' && <StudioPaletteCenter />}
            </div>
          </div>
        )}
      </div>

      {/* 5. Faixa Preta Inferior Fixa (.studio-dock-dark — 8 Ícones Dedicados) */}
      <nav
        ref={dockRef}
        aria-label="Ferramentas do Studio"
        className="relative shrink-0 w-full studio-dock-dark bg-black text-white border border-white/10 rounded-2xl p-1.5 shadow-xl overflow-hidden"
      >
        <div className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-black to-transparent z-10 sm:hidden" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-3 bg-gradient-to-l from-black to-transparent z-10 sm:hidden" />
        <div
          className="flex items-center justify-start gap-1 overflow-x-auto snap-x snap-mandatory no-scrollbar px-1"
          style={{ width: 'fit-content', maxWidth: '100%', marginInline: 'auto' }}
        >
          {DOCK_TOOLS.map((tool) => {
            const isActive = openTool === tool.id;
            return (
              <div key={tool.id} className="relative snap-start shrink-0">
                <button
                  type="button"
                  onClick={() => handleSelectDockTool(tool.id)}
                  className={`flex flex-col items-center justify-center gap-1 min-w-[56px] sm:min-w-[66px] px-2 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer ${isActive
                    ? 'bg-[#FFCC00] text-black shadow-sm'
                    : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                >
                  <span className="material-symbols-outlined text-[19px] leading-none">{tool.icon}</span>
                  <span className="text-[10px] font-bold tracking-tight leading-none whitespace-nowrap">{tool.label}</span>
                </button>
                <div
                  className={`absolute -top-1 -right-0.5 z-20 transition-opacity ${helpMode ? 'opacity-100 scale-105' : 'opacity-75 hover:opacity-100'
                    }`}
                >
                  <StudioHelpTooltip
                    helpKey={tool.helpKey}
                    controlledOpen={helpMode ? activeHelpDockId === tool.id : undefined}
                    onControlledOpenChange={
                      helpMode ? (isOpen) => setActiveHelpDockId(isOpen ? tool.id : null) : undefined
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
      </nav>

      <StudioMaskBrushModal />
      <StudioDraftVersionsDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
      <StudioShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <StudioInstagramPreviewModal open={instagramPreviewOpen} onClose={() => setInstagramPreviewOpen(false)} />
    </div>
  );
}
