// Este programa é um software livre (Licença AGPLv3)
'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useStudio } from './StudioContext';
import { ASPECT_DIMENSIONS } from './types';
import { renderSlideToCanvas } from '@/lib/studio/canvas-renderer';
import { useOrganizationBrand } from '../OrganizationBrandProvider';

export function StudioCanvasStage() {
  const { activeSlide, aspectRatio, selectedLayerId, setSelectedLayerId, updateLayer } = useStudio();
  const { tokens } = useOrganizationBrand();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

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

  useEffect(() => {
    repaintRef.current = repaint;
  }, [repaint]);

  useEffect(() => {
    repaint();
  }, [repaint]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) / rect.width;
    const clickY = (e.clientY - rect.top) / rect.height;

    // Acha a camada no ponto clicado (ordem reversa para topo)
    const reversed = [...activeSlide.layers].reverse();
    const hit = reversed.find(
      (l) =>
        l.visible &&
        !l.locked &&
        clickX >= l.x &&
        clickX <= l.x + l.width &&
        clickY >= l.y &&
        clickY <= l.y + l.height
    );

    if (hit) {
      setSelectedLayerId(hit.id);
      setIsDragging(true);
      dragStartRef.current = {
        startX: clickX,
        startY: clickY,
        origX: hit.x,
        origY: hit.y,
      };
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

    const deltaX = curX - dragStartRef.current.startX;
    const deltaY = curY - dragStartRef.current.startY;

    const nextX = Math.max(0, Math.min(1, dragStartRef.current.origX + deltaX));
    const nextY = Math.max(0, Math.min(1, dragStartRef.current.origY + deltaY));

    updateLayer(selectedLayerId, { x: nextX, y: nextY });
  };

  const handlePointerUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const selectedLayer = activeSlide.layers.find((l) => l.id === selectedLayerId);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center w-full h-full max-h-[70vh] p-2 select-none"
    >
      <div
        className="relative max-w-full max-h-full rounded-2xl overflow-hidden shadow-2xl border border-white/10 touch-none cursor-default"
        style={{ aspectRatio: dims.cssAspect }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <canvas
          ref={canvasRef}
          width={dims.width}
          height={dims.height}
          className="w-full h-full object-contain block bg-[#07090e]"
        />

        {/* Bounding box de seleção da camada ativa */}
        {selectedLayer && selectedLayer.visible && (
          <div
            className="absolute pointer-events-none border-2 border-[#FFCC00] rounded-xs shadow-sm transition-all"
            style={{
              left: `${selectedLayer.x * 100}%`,
              top: `${selectedLayer.y * 100}%`,
              width: `${selectedLayer.width * 100}%`,
              height: `${selectedLayer.height * 100}%`,
              transform: selectedLayer.rotation ? `rotate(${selectedLayer.rotation}deg)` : undefined,
            }}
          >
            <div className="absolute -top-6 left-0 bg-[#FFCC00] text-[#121212] text-[10px] font-bold px-1.5 py-0.5 rounded-xs flex items-center gap-1">
              <span>{selectedLayer.name}</span>
              {selectedLayer.locked && <span className="material-symbols-outlined text-[10px]">lock</span>}
            </div>
            {/* Manipuladores visuais nos cantos */}
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
