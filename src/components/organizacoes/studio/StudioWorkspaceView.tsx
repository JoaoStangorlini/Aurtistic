// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useState } from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS, type AspectRatioKey } from './types';
import { StudioToolbarTabs } from './StudioToolbarTabs';
import { StudioImagePanel } from './StudioImagePanel';
import { StudioEditionPanel } from './StudioEditionPanel';
import { StudioTextPanel } from './StudioTextPanel';
import { StudioLayersPanel } from './StudioLayersPanel';
import { StudioElementsGallery } from './StudioElementsGallery';
import { StudioPaletteCenter } from './StudioPaletteCenter';
import { StudioDesignAssistant } from './StudioDesignAssistant';
import { StudioCanvasStage } from './StudioCanvasStage';
import { StudioCarouselStrip } from './StudioCarouselStrip';
import { StudioMaskBrushModal } from './StudioMaskBrushModal';
import { StudioDraftVersionsDrawer } from './StudioDraftVersionsDrawer';
import { useStudioKeyboard } from '@/hooks/useStudioKeyboard';

export function StudioWorkspaceView() {
  const {
    stage: _stage,
    setStage,
    activeTab,
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
  } = useStudio();

  const [activeAuxTool, setActiveAuxTool] = useState<'none' | 'elements' | 'palette' | 'assistant'>('none');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Atalhos de teclado profissionais (Ctrl+Z, Del, Ctrl+D, Setas, Ctrl+S)
  useStudioKeyboard({
    selectedLayer,
    onUndo: () => {},
    onRedo: () => {},
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

  return (
    <div className="space-y-4">
      {/* Topbar do Workspace de Edição */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 shadow-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStage('launcher')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-black/30 text-xs font-bold text-slate-300 hover:text-white transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Tela Inicial</span>
          </button>

          {/* Seletor com Format Adapt */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
            {(Object.keys(ASPECT_DIMENSIONS) as AspectRatioKey[]).map((key) => (
              <button
                key={key} type="button" onClick={() => adaptFormatTo(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${aspectRatio === key ? 'bg-[#FFCC00] text-black shadow-xs' : 'text-slate-400 hover:text-white'}`}
              >
                {key}
              </button>
            ))}
          </div>
        </div>

        {/* Ferramentas Rápidas no Topo */}
        <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-xl border border-white/10">
          <button
            type="button" onClick={() => setActiveAuxTool(activeAuxTool === 'elements' ? 'none' : 'elements')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${activeAuxTool === 'elements' ? 'bg-[#FFCC00] text-black' : 'text-slate-300 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[15px]">category</span>
            <span>Elementos</span>
          </button>
          <button
            type="button" onClick={() => setActiveAuxTool(activeAuxTool === 'palette' ? 'none' : 'palette')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${activeAuxTool === 'palette' ? 'bg-[#FFCC00] text-black' : 'text-slate-300 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[15px]">palette</span>
            <span>Paleta</span>
          </button>
          <button
            type="button" onClick={() => setActiveAuxTool(activeAuxTool === 'assistant' ? 'none' : 'assistant')}
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${activeAuxTool === 'assistant' ? 'bg-[#FFCC00] text-black' : 'text-slate-300 hover:text-white'}`}
          >
            <span className="material-symbols-outlined text-[15px]">auto_fix_high</span>
            <span>WCAG</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {/* Gaveta de Versões */}
          <button
            type="button" onClick={() => setIsDrawerOpen(true)}
            className="px-2.5 py-1.5 rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-slate-300 hover:text-white flex items-center gap-1"
            title="Abrir Histórico de Versões e Rascunhos"
          >
            <span className="material-symbols-outlined text-[16px]">history</span>
            <span>Versões</span>
          </button>

          <button
            type="button" onClick={() => saveCurrentToDraftSlot(activeDraftSlot || 1)}
            className="px-3 py-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 text-xs font-bold text-amber-300 hover:bg-amber-400/20 flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span>Salvar</span>
          </button>

          <button
            type="button" onClick={() => setStage('publish')}
            className="px-4 py-1.5 rounded-xl bg-[#FFCC00] text-black text-xs font-black hover:bg-[#FFD633] transition-all shadow-md flex items-center gap-1"
          >
            <span>Publicar</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Grid: 4 Abas + Canvas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 xl:col-span-5 space-y-3 flex flex-col">
          <StudioToolbarTabs />
          <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 min-h-[400px] shadow-sm">
            {activeAuxTool === 'elements' && <StudioElementsGallery />}
            {activeAuxTool === 'palette' && <StudioPaletteCenter />}
            {activeAuxTool === 'assistant' && <StudioDesignAssistant activeOverlay={activeOverlay} onToggleOverlay={setActiveOverlay} />}
            {activeAuxTool === 'none' && (
              <>
                {activeTab === 'images' && <StudioImagePanel />}
                {activeTab === 'edition' && <StudioEditionPanel />}
                {activeTab === 'texts' && <StudioTextPanel />}
                {activeTab === 'layers' && <StudioLayersPanel />}
              </>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 xl:col-span-7 flex flex-col items-center justify-between bg-black/40 border border-white/10 rounded-2xl p-4 shadow-inner min-h-[440px]">
          <div className="w-full flex-1 flex items-center justify-center">
            <StudioCanvasStage />
          </div>
          <StudioCarouselStrip />
        </div>
      </div>

      <StudioMaskBrushModal />
      <StudioDraftVersionsDrawer isOpen={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
    </div>
  );
}
