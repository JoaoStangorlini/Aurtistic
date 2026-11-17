// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS, type AspectRatioKey } from './types';
import { StudioToolbarTabs } from './StudioToolbarTabs';
import { StudioImagePanel } from './StudioImagePanel';
import { StudioEditionPanel } from './StudioEditionPanel';
import { StudioTextPanel } from './StudioTextPanel';
import { StudioLayersPanel } from './StudioLayersPanel';
import { StudioCanvasStage } from './StudioCanvasStage';
import { StudioCarouselStrip } from './StudioCarouselStrip';
import { StudioMaskBrushModal } from './StudioMaskBrushModal';

export function StudioWorkspaceView() {
  const {
    stage: _stage,
    setStage,
    activeTab,
    aspectRatio,
    setAspectRatio,
    saveCurrentToDraftSlot,
    activeDraftSlot,
  } = useStudio();

  return (
    <div className="space-y-4">
      {/* Topbar do Workspace de Edição */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 shadow-md">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStage('launcher')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/15 bg-black/30 text-xs font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">arrow_back</span>
            <span>Tela Inicial</span>
          </button>

          {/* Seletor de Aspect Ratio */}
          <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/10">
            {(Object.keys(ASPECT_DIMENSIONS) as AspectRatioKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setAspectRatio(key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  aspectRatio === key
                    ? 'bg-[#FFCC00] text-[#121212] shadow-xs'
                    : 'text-slate-400 hover:text-white'
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
            onClick={() => saveCurrentToDraftSlot(activeDraftSlot || 1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-400/40 bg-amber-400/10 text-xs font-bold text-amber-300 hover:bg-amber-400/20 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span>Salvar Rascunho {activeDraftSlot ? `(Slot ${activeDraftSlot})` : ''}</span>
          </button>

          <button
            type="button"
            onClick={() => setStage('publish')}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#FFCC00] text-[#121212] text-xs font-black hover:bg-[#FFD633] transition-all cursor-pointer shadow-md"
          >
            <span>Publicar</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>

      {/* Grid de Edição Principal: Abas à esquerda e Canvas + Carrossel à direita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Coluna da Esquerda (Painéis de Ferramentas) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3 flex flex-col">
          <StudioToolbarTabs />
          <div className="flex-1 bg-white/5 border border-white/10 rounded-2xl p-4 min-h-[380px] shadow-sm">
            {activeTab === 'images' && <StudioImagePanel />}
            {activeTab === 'edition' && <StudioEditionPanel />}
            {activeTab === 'texts' && <StudioTextPanel />}
            {activeTab === 'layers' && <StudioLayersPanel />}
          </div>
        </div>

        {/* Coluna da Direita (Canvas Central + Tira de Slides) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col items-center justify-between bg-black/40 border border-white/10 rounded-2xl p-4 shadow-inner min-h-[440px]">
          <div className="w-full flex-1 flex items-center justify-center">
            <StudioCanvasStage />
          </div>
          <StudioCarouselStrip />
        </div>
      </div>

      {/* Modal de Pincel de Máscara Offscreen */}
      <StudioMaskBrushModal />
    </div>
  );
}

