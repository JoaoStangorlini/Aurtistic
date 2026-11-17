// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS } from './types';
import { renderSlideToCanvas } from '@/lib/studio/canvas-renderer';
import { useOrganizationBrand } from '../OrganizationBrandProvider';

export function StudioCanvasStage() {
  const { activeSlide, aspectRatio, selectedLayerId, setSelectedLayerId, updateLayer, activeOverlay } = useStudio();
  const { tokens } = useOrganizationBrand();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [snapGuides, setSnapGuides] = useState<{ x?: number; y?: number }>({});
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number; w: number; h: number } | null>(null);

  const dims = ASPECT_DIMENSIONS[aspectRatio];
  const repaintRef = useRef<(() => void) | null>(null);

  const repaint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !activeSlide) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    renderSlideToCanvas(ctx, activeSlide, dims.width, dims.height, tokens, {
      onNeedRepaint: () => repaintRef.current?.(),
    });
  }, [activeSlide, dims.width, dims.height, tokens]);

  useEffect(() => { repaintRef.current = repaint; }, [repaint]);
  useEffect(() => { repaint(); }, [repaint]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    const reversed = [...activeSlide.layers].reverse();
    const hit = reversed.find((l) => l.visible && !l.locked && clickX >= l.x && clickX <= l.x + l.width && clickY >= l.y && clickY <= l.y + l.height);

    if (hit) {
      setSelectedLayerId(hit.id);
      setIsDragging(true);
      dragStartRef.current = { startX: clickX, startY: clickY, origX: hit.x, origY: hit.y, w: hit.width, h: hit.height };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } else {
      setSelectedLayerId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current || !selectedLayerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const curX = (e.clientX - rect.left) / rect.width;
    const curY = (e.clientY - rect.top) / rect.height;

    let nextX = dragStartRef.current.origX + (curX - dragStartRef.current.startX);
    let nextY = dragStartRef.current.origY + (curY - dragStartRef.current.startY);

    // Smart Snapping magnético no Centro (0.5) com tolerância de 2%
    const guides: { x?: number; y?: number } = {};
    const centerX = nextX + dragStartRef.current.w / 2;
    const centerY = nextY + dragStartRef.current.h / 2;

    if (Math.abs(centerX - 0.5) < 0.02) {
      nextX = 0.5 - dragStartRef.current.w / 2;
      guides.x = 0.5;
    }
    if (Math.abs(centerY - 0.5) < 0.02) {
      nextY = 0.5 - dragStartRef.current.h / 2;
      guides.y = 0.5;
    }

    setSnapGuides(guides);
    updateLayer(selectedLayerId, { x: Math.max(0, Math.min(1, nextX)), y: Math.max(0, Math.min(1, nextY)) });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
    setSnapGuides({});
  };

  const selectedLayer = activeSlide.layers.find((l) => l.id === selectedLayerId);

  return (
    <div className="relative flex items-center justify-center w-full h-full max-h-[70vh] p-2 select-none">
      <div
        className="relative max-w-full max-h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 touch-none cursor-default"
        style={{ aspectRatio: dims.cssAspect }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <canvas ref={canvasRef} width={dims.width} height={dims.height} className="w-full h-full object-contain block bg-[#07090e]" />

        {/* Linhas Guias Magnéticas (Snap no Centro) */}
        {snapGuides.x !== undefined && <div className="absolute top-0 bottom-0 border-l border-dashed border-[#00D4FF] z-30 pointer-events-none" style={{ left: '50%' }} />}
        {snapGuides.y !== undefined && <div className="absolute left-0 right-0 border-t border-dashed border-[#00D4FF] z-30 pointer-events-none" style={{ top: '50%' }} />}

        {/* Overlays de Composição Fotográfica */}
        {activeOverlay === 'thirds' && (
          <div className="absolute inset-0 pointer-events-none z-20">
            <div className="absolute top-0 bottom-0 left-1/3 border-r border-dashed border-amber-300/40" />
            <div className="absolute top-0 bottom-0 left-2/3 border-r border-dashed border-amber-300/40" />
            <div className="absolute left-0 right-0 top-1/3 border-b border-dashed border-amber-300/40" />
            <div className="absolute left-0 right-0 top-2/3 border-b border-dashed border-amber-300/40" />
          </div>
        )}
        {activeOverlay === 'diagonals' && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20 stroke-amber-300/35 stroke-[1.5] stroke-dasharray-[4]">
            <line x1="0" y1="0" x2="100%" y2="100%" />
            <line x1="100%" y1="0" x2="0" y2="100%" />
          </svg>
        )}
        {activeOverlay === 'golden' && (
          <div className="absolute inset-0 pointer-events-none z-20 border border-amber-400/30">
            <div className="absolute top-0 left-0 bottom-0 w-[61.8%] border-r border-amber-400/30" />
            <div className="absolute top-0 left-0 right-0 h-[61.8%] border-b border-amber-400/30" />
          </div>
        )}

        {/* Bounding box de seleção da camada ativa */}
        {selectedLayer && selectedLayer.visible && (
          <div
            className="absolute pointer-events-none border-2 border-[#FFCC00] rounded-xs shadow-sm transition-all z-40"
            style={{
              left: `${selectedLayer.x * 100}%`,
              top: `${selectedLayer.y * 100}%`,
              width: `${selectedLayer.width * 100}%`,
              height: `${selectedLayer.height * 100}%`,
              transform: selectedLayer.rotation ? `rotate(${selectedLayer.rotation}deg)` : undefined,
            }}
          >
            <div className="absolute -top-6 left-0 bg-[#FFCC00] text-[#121212] text-[10px] font-bold px-1.5 py-0.5 rounded-xs flex items-center gap-1 shadow">
              <span>{selectedLayer.name}</span>
              {selectedLayer.locked && <span className="material-symbols-outlined text-[10px]">lock</span>}
            </div>
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 bg-[#FFCC00] rounded-full border border-black" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-[#FFCC00] rounded-full border border-black" />
            <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 bg-[#FFCC00] rounded-full border border-black" />
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 bg-[#FFCC00] rounded-full border border-black" />
          </div>
        )}
      </div>
    </div>
  );
}
