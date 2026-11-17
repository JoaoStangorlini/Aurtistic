// Este programa é um software livre (Licença AGPLv3)
'use client';

import React from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS } from './types';

export function StudioCarouselStrip() {
  const { slides, activeSlideId, setActiveSlideId, addSlide, removeSlide, aspectRatio } = useStudio();
  const dims = ASPECT_DIMENSIONS[aspectRatio];

  return (
    <div className="w-full flex items-center gap-3 overflow-x-auto py-2 px-1 scrollbar-thin border-t border-white/10">
      <div className="flex items-center gap-2.5">
        {slides.map((slide, idx) => {
          const isActive = slide.id === activeSlideId;
          const bg = slide.backgroundColor || '#07090e';

          return (
            <div key={slide.id} className="relative group shrink-0">
              <button
                type="button"
                onClick={() => setActiveSlideId(slide.id)}
                className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer flex flex-col items-center justify-center ${
                  isActive
                    ? 'border-[#FFCC00] shadow-md shadow-[#FFCC00]/20 scale-105'
                    : 'border-white/15 hover:border-white/40 opacity-70 hover:opacity-100'
                }`}
                style={{
                  width: dims.width > dims.height ? '96px' : '64px',
                  height: dims.height > dims.width ? '96px' : '64px',
                  backgroundColor: bg,
                }}
              >
                <span className="text-[10px] font-black font-mono text-white/80 z-10">
                  {idx + 1}
                </span>
                <span className="text-[8px] text-white/50 truncate max-w-[50px] z-10">
                  {slide.title}
                </span>
              </button>

              {slides.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSlide(slide.id);
                  }}
                  title="Excluir Tela"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white text-[12px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:bg-red-700 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[12px]">close</span>
                </button>
              )}
            </div>
          );
        })}

        {/* Botão de Adicionar Nova Tela */}
        <button
          type="button"
          onClick={addSlide}
          className="shrink-0 flex flex-col items-center justify-center rounded-xl border border-dashed border-white/25 hover:border-[#FFCC00] hover:text-[#FFCC00] text-slate-400 transition-all cursor-pointer p-3 gap-1"
          style={{
            width: dims.width > dims.height ? '96px' : '64px',
            height: dims.height > dims.width ? '96px' : '64px',
          }}
          title="Adicionar Nova Tela ao Carrossel"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span className="text-[9px] font-bold">+ Tela</span>
        </button>
      </div>
    </div>
  );
}

