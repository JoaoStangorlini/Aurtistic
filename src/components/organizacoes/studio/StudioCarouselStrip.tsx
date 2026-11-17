// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS } from './types';
import type { StudioSlide } from './types';
import { renderSlideToCanvas } from '../../../lib/studio/canvas-renderer';
import { useOrganizationBrand } from '../OrganizationBrandProvider';

function SlideThumbnail({
  slide,
  isActive,
  thumbW,
  thumbH,
}: {
  slide: StudioSlide;
  isActive: boolean;
  thumbW: number;
  thumbH: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { tokens } = useOrganizationBrand();

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderSlideToCanvas(ctx, slide, thumbW, thumbH, tokens);
  }, [slide, thumbW, thumbH, tokens]);

  useEffect(() => {
    if (isActive) {
      paint();
    } else {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(paint);
      } else {
        setTimeout(paint, 60);
      }
    }
  }, [paint, isActive]);

  return (
    <canvas
      ref={canvasRef}
      width={thumbW}
      height={thumbH}
      className={`rounded-lg transition-transform duration-300 ${isActive ? 'scale-105' : ''}`}
      style={{ width: thumbW, height: thumbH, display: 'block' }}
    />
  );
}

export function StudioCarouselStrip() {
  const { slides, activeSlideId, setActiveSlideId, addSlide, removeSlide, aspectRatio } = useStudio();
  const dims = ASPECT_DIMENSIONS[aspectRatio];
  const thumbW = dims.width > dims.height ? 96 : 64;
  const thumbH = dims.height > dims.width ? 96 : 64;

  return (
    <div className="w-full flex items-center gap-3 overflow-x-auto py-2 px-1 scrollbar-thin border-t border-white/10">
      <div className="flex items-center gap-2.5">
        {slides.map((slide, idx) => {
          const isActive = slide.id === activeSlideId;
          return (
            <div key={slide.id} className="relative group shrink-0">
              <button
                type="button"
                onClick={() => setActiveSlideId(slide.id)}
                title={`Tela ${idx + 1}: ${slide.title}`}
                className={`relative rounded-xl overflow-hidden border-2 transition-all cursor-pointer ${
                  isActive
                    ? 'border-[#FFCC00] shadow-md shadow-[#FFCC00]/20'
                    : 'border-white/15 hover:border-white/40 opacity-70 hover:opacity-100'
                }`}
                style={{ width: thumbW, height: thumbH }}
              >
                <SlideThumbnail slide={slide} isActive={isActive} thumbW={thumbW} thumbH={thumbH} />
                <span className="absolute bottom-0.5 left-0.5 text-[9px] font-black font-mono text-white/80 bg-black/40 rounded px-0.5 leading-tight z-10">
                  {idx + 1}
                </span>
              </button>

              {slides.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); removeSlide(slide.id); }}
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
          style={{ width: thumbW, height: thumbH }}
          title="Adicionar Nova Tela ao Carrossel"
        >
          <span className="material-symbols-outlined text-[20px]">add</span>
          <span className="text-[9px] font-bold">+ Tela</span>
        </button>
      </div>
    </div>
  );
}
