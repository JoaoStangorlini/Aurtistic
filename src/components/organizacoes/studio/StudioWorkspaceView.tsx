// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState, useMemo } from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS, type AspectRatioKey, type StudioActiveTab } from './types';
import { StudioImagePanel } from './StudioImagePanel';
import { StudioEditionPanel } from './StudioEditionPanel';
import { StudioTextPanel } from './StudioTextPanel';
import { StudioLayersPanel } from './StudioLayersPanel';
import { StudioElementsGallery } from './StudioElementsGallery';
import { StudioPaletteCenter } from './StudioPaletteCenter';
import { StudioDesignAssistant } from './StudioDesignAssistant';
import { StudioCanvasStage } from './StudioCanvasStage';
import { StudioTopActionBar } from './StudioTopActionBar';
import { StudioCarouselStrip } from './StudioCarouselStrip';
import { StudioMaskBrushModal } from './StudioMaskBrushModal';
import { StudioDraftVersionsDrawer } from './StudioDraftVersionsDrawer';
import { useStudioKeyboard } from '@/hooks/useStudioKeyboard';
import { useStudioAutoSave } from '@/hooks/useStudioAutoSave';

type DockToolId = StudioActiveTab | 'elements' | 'palette' | 'assistant';

const DOCK_TOOLS: { id: DockToolId; label: string; icon: string }[] = [
  { id: 'images', label: 'Imagens', icon: 'add_photo_alternate' },
  { id: 'edition', label: 'Ajustar', icon: 'tune' },
  { id: 'texts', label: 'Texto', icon: 'title' },
  { id: 'layers', label: 'Camadas', icon: 'layers' },
  { id: 'elements', label: 'Elementos', icon: 'category' },
  { id: 'palette', label: 'Paleta', icon: 'palette' },
  { id: 'assistant', label: 'WCAG', icon: 'auto_fix_high' },
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
    activeOverlay,
    setActiveOverlay,
    selectedLayer,
    removeLayer,
    duplicateLayerWithMaskOnTop,
    updateLayer,
    reorderLayers,
    setSelectedLayerId,
    activeSlide,
    slides,
    orgSlug,
    undo,
    redo,
  } = useStudio();

  const [openTool, setOpenTool] = useState<DockToolId | null>('images');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  const handleSelectDockTool = (toolId: DockToolId) => {
    if (openTool === toolId) {
      setOpenTool(null);
      return;
    }
    setOpenTool(toolId);
    if (toolId === 'images' || toolId === 'edition' || toolId === 'texts' || toolId === 'layers') {
      setActiveTab(toolId);
    }
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

  // Atalhos de teclado profissionais (Ctrl+Z, Del, Ctrl+D, Setas, Ctrl+S)
  useStudioKeyboard({
    selectedLayer,
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
  });

  const activeToolMeta = DOCK_TOOLS.find((t) => t.id === openTool);

  return (
    <div className="flex flex-col gap-3">
      {/* 1. Topbar compacta */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface border border-border-subtle rounded-2xl p-2.5 shadow-sm">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setStage('launcher')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border-subtle bg-app text-xs font-bold text-fg-muted hover:text-fg transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Tela Inicial</span>
          </button>

          {/* Seletor de Formato */}
          <div className="flex items-center gap-1 bg-app p-1 rounded-xl border border-border-subtle">
            {(Object.keys(ASPECT_DIMENSIONS) as AspectRatioKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => adaptFormatTo(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  aspectRatio === key ? 'bg-[#FFCC00] text-black shadow-xs' : 'text-fg-muted hover:text-fg'
                }`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="px-2.5 py-1.5 rounded-xl border border-border-subtle bg-app text-xs font-bold text-fg-muted hover:text-fg flex items-center gap-1 cursor-pointer"
            title="Abrir Histórico de Versões e Rascunhos"
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span>Versões</span>
          </button>

          <button
            type="button"
            onClick={() => saveCurrentToDraftSlot(activeDraftSlot || 1)}
            className="px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs font-bold text-amber-600 dark:text-amber-300 hover:bg-amber-500/20 flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span>Salvar</span>
          </button>

          <button
            type="button"
            onClick={() => setStage('publish')}
            className="px-4 py-1.5 rounded-xl bg-[#FFCC00] text-black text-xs font-black hover:bg-[#FFD633] transition-all shadow-md flex items-center gap-1 cursor-pointer"
          >
            <span>Publicar</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* 2. Navegação de Telas e Criar Tela ACIMA da foto/canvas */}
      <StudioCarouselStrip />

      {/* 3. Barra Superior Móvel Flutuante + Palco Central */}
      <div className="w-full flex flex-col items-center justify-center py-2 min-h-[360px] gap-2.5">
        <StudioTopActionBar />
        <StudioCanvasStage />
      </div>

      {/* 4. Menu de Ajustes Contextual ENTRE a foto e o menu horizontal inferior */}
      {openTool && (
        <div className="bg-surface border border-border-subtle rounded-2xl p-4 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between border-b border-border-subtle pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#FFCC00]">
                {activeToolMeta?.icon || 'tune'}
              </span>
              <span className="text-xs font-black uppercase tracking-wider text-fg">
                {activeToolMeta?.label || 'Ajustes'}
              </span>
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

          <div className="max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
            {openTool === 'images' && <StudioImagePanel />}
            {openTool === 'edition' && <StudioEditionPanel />}
            {openTool === 'texts' && <StudioTextPanel />}
            {openTool === 'layers' && <StudioLayersPanel />}
            {openTool === 'elements' && <StudioElementsGallery />}
            {openTool === 'palette' && <StudioPaletteCenter />}
            {openTool === 'assistant' && (
              <StudioDesignAssistant activeOverlay={activeOverlay} onToggleOverlay={setActiveOverlay} />
            )}
          </div>
        </div>
      )}

      {/* 5. Menu Horizontal Inferior (Ícone em cima + Nome abaixo) */}
      <nav
        aria-label="Ferramentas do Studio"
        className="w-full bg-surface border border-border-subtle rounded-2xl p-1.5 shadow-md overflow-x-auto scrollbar-thin"
      >
        <div className="flex items-center justify-start sm:justify-center gap-1 min-w-max">
          {DOCK_TOOLS.map((tool) => {
            const isActive = openTool === tool.id;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => handleSelectDockTool(tool.id)}
                className={`flex flex-col items-center justify-center gap-1 min-w-[68px] px-3 py-2 rounded-xl transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#FFCC00] text-black shadow-sm'
                    : 'text-fg-muted hover:text-fg hover:bg-app'
                }`}
              >
                <span className="material-symbols-outlined text-[20px] leading-none">{tool.icon}</span>
                <span className="text-[10px] font-bold tracking-tight leading-none">{tool.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <StudioMaskBrushModal />
      <StudioDraftVersionsDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
}
